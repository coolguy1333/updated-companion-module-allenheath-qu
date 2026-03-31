const net = require('node:net')
const {
	InstanceBase,
	InstanceStatus,
	combineRgb,
} = require('@companion-module/base')

const quconfig = require('../quconfig.json')

const MIDI_PORT = 51325

const CHANNEL_TYPES = {
	input: 0x20,
	stereo: 0x40,
	lr: 0x67,
	mix: 0x60,
	group: 0x68,
	matrix: 0x6c,
	fx_send: 0x00,
	fx_return: 0x08,
	dca: 0x10,
	mutegroup: 0x50,
}

class AllenHeathQuInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.socket = undefined
		this.receiveBuffer = Buffer.alloc(0)
		this.state = {
			mute: {},
			pafl: {},
			level: {},
			sendLevel: {},
			gain: {},
			currentScene: 1,
			channelNames: {},
		}
	}

	async init(config) {
		this.config = config
		this.initState()
		this.updateDefinitions()
		this.connect()
	}

	async configUpdated(config) {
		this.config = config
		this.initState()
		this.updateDefinitions()
		this.connect()
	}

	async destroy() {
		this.disconnect()
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Mixer IP',
				width: 8,
				regex: this.REGEX_IP,
				default: '192.168.1.70',
			},
			{
				type: 'dropdown',
				id: 'model',
				label: 'Model',
				default: 'QUPAC',
				choices: Object.keys(quconfig.config).map((model) => ({ id: model, label: model })),
			},
		]
	}

	initState() {
		this.state = {
			mute: {},
			pafl: {},
			level: {},
			sendLevel: {},
			gain: {},
			currentScene: 1,
			channelNames: {},
		}

		const model = quconfig.config[this.config.model] || quconfig.config.QUPAC
		for (let i = 0; i < model.chCount; i++) {
			this.state.channelNames[CHANNEL_TYPES.input + i] = `CH ${i + 1}`
		}
		for (let i = 0; i < model.chStereo; i++) {
			this.state.channelNames[CHANNEL_TYPES.stereo + i] = `ST ${i + 1}`
		}
	}

	updateDefinitions() {
		const model = quconfig.config[this.config.model] || quconfig.config.QUPAC
		const inputChoices = this.makeChoices('CH', model.chCount)
		const mixChoices = this.makeMixChoices(model)
		const softKeyChoices = this.makeChoices('SoftKey', model.SoftKey, 1)

		this.setActionDefinitions({
			mute_input: {
				name: 'Mute Input',
				options: [this.channelDropdown(inputChoices), this.toggleDropdown('mute', 'Mute')],
				callback: async (event) => this.toggleStateAndSend('mute', CHANNEL_TYPES.input, event.options.channel, event.options.mute),
			},
			pafl_input: {
				name: 'PAFL Input',
				options: [this.channelDropdown(inputChoices), this.toggleDropdown('pafl', 'PAFL')],
				callback: async (event) => this.toggleStateAndSend('pafl', CHANNEL_TYPES.input, event.options.channel, event.options.pafl),
			},
			level_input: {
				name: 'Set Input Fader Level',
				options: [
					this.channelDropdown(inputChoices),
					{
						type: 'textinput',
						id: 'level',
						label: 'MIDI level (0-127, variables supported)',
						default: '98',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const level = this.clamp(parseInt(String(event.options.level ?? '98'), 10), 0, 127)
					const channel = CHANNEL_TYPES.input + parseInt(event.options.channel, 10)
					this.state.level[channel] = level
					this.setVariableValues({ [`level_${channel}`]: String(level) })
					this.sendNrpn(channel, 0x17, level, 0x07)
				},
			},
			sendlev_input_mix: {
				name: 'Set Input Send Level to Mix',
				options: [
					this.channelDropdown(inputChoices),
					{
						type: 'dropdown',
						id: 'mix',
						label: 'Mix',
						default: 0,
						choices: mixChoices,
					},
					{
						type: 'textinput',
						id: 'level',
						label: 'MIDI level (0-127, variables supported)',
						default: '98',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const level = this.clamp(parseInt(String(event.options.level ?? '98'), 10), 0, 127)
					const channel = CHANNEL_TYPES.input + parseInt(event.options.channel, 10)
					const mix = parseInt(event.options.mix, 10)
					this.state.sendLevel[`${channel}_${mix}`] = level
					this.sendNrpn(channel, 0x20, level, mix)
				},
			},
			scene_recall: {
				name: 'Recall Scene',
				options: [{ type: 'number', id: 'scene', label: 'Scene (1-100)', default: 1, min: 1, max: model.sceneCount }],
				callback: async (event) => {
					const scene = this.clamp(parseInt(event.options.scene, 10), 1, model.sceneCount)
					this.state.currentScene = scene
					this.setVariableValues({ current_scene: String(scene) })
					this.send(Buffer.from([0xb0, 0x00, 0x00, 0xc0, scene - 1]))
				},
			},
			scene_step: {
				name: 'Step Scene',
				options: [{ type: 'number', id: 'step', label: 'Step (+/-)', default: 1, min: -99, max: 99 }],
				callback: async (event) => {
					const next = this.clamp(this.state.currentScene + parseInt(event.options.step, 10), 1, model.sceneCount)
					this.state.currentScene = next
					this.setVariableValues({ current_scene: String(next) })
					this.send(Buffer.from([0xb0, 0x00, 0x00, 0xc0, next - 1]))
				},
			},
			softkey_fire: {
				name: 'Fire SoftKey',
				options: [{ type: 'dropdown', id: 'key', label: 'SoftKey', default: 1, choices: softKeyChoices }],
				callback: async (event) => {
					const keyIndex = parseInt(event.options.key, 10)
					this.send(Buffer.from([0x90, 0x70 + keyIndex, 0x7f, 0x80, 0x70 + keyIndex, 0x00]))
				},
			},
			qudrive_transport: {
				name: 'QuDrive Transport',
				options: [{
					type: 'dropdown',
					id: 'transport',
					label: 'Command',
					default: 2,
					choices: [
						{ id: 1, label: 'Stop' },
						{ id: 2, label: 'Play' },
					],
				}],
				callback: async (event) => {
					this.send(Buffer.from([0xf0, 0x7f, 0x7f, 0x06, parseInt(event.options.transport, 10), 0xf7]))
				},
			},
			gain_input: {
				name: 'Set Input Gain',
				options: [
					this.channelDropdown(inputChoices),
					{ type: 'number', id: 'gain', label: 'Gain raw (0-127)', default: 64, min: 0, max: 127 },
				],
				callback: async (event) => {
					const channel = CHANNEL_TYPES.input + parseInt(event.options.channel, 10)
					const gain = this.clamp(parseInt(event.options.gain, 10), 0, 127)
					this.state.gain[channel] = gain
					this.sendNrpn(channel, 0x6a, gain, 0x07)
				},
			},
		})

		this.setFeedbackDefinitions({
			mute_input: {
				type: 'boolean',
				name: 'Input mute active',
				defaultStyle: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(153, 0, 51) },
				options: [this.channelDropdown(inputChoices)],
				callback: (feedback) => !!this.state.mute[CHANNEL_TYPES.input + parseInt(feedback.options.channel, 10)],
			},
			pafl_input: {
				type: 'boolean',
				name: 'Input PAFL active',
				defaultStyle: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(255, 153, 51) },
				options: [this.channelDropdown(inputChoices)],
				callback: (feedback) => !!this.state.pafl[CHANNEL_TYPES.input + parseInt(feedback.options.channel, 10)],
			},
		})

		const variableDefinitions = {
			current_scene: { name: 'Current Scene' },
		}
		for (const choice of inputChoices) {
			const channel = CHANNEL_TYPES.input + choice.id
			variableDefinitions[`level_${channel}`] = { name: `${choice.label} Level` }
			variableDefinitions[`ch_name_${channel}`] = { name: `${choice.label} Name` }
		}
		this.setVariableDefinitions(variableDefinitions)
		const variableValues = { current_scene: String(this.state.currentScene) }
		for (const choice of inputChoices) {
			const channel = CHANNEL_TYPES.input + choice.id
			variableValues[`ch_name_${channel}`] = this.state.channelNames[channel]
			variableValues[`level_${channel}`] = String(this.state.level[channel] ?? 0)
		}
		this.setVariableValues(variableValues)
	}

	channelDropdown(choices) {
		return {
			type: 'dropdown',
			id: 'channel',
			label: 'Channel',
			default: 0,
			choices,
		}
	}

	toggleDropdown(id, label) {
		return {
			type: 'dropdown',
			id,
			label,
			default: 0,
			disableAutoExpression: true,
			choices: [
				{ id: 0, label: 'Toggle' },
				{ id: 1, label: 'On' },
				{ id: 2, label: 'Off' },
			],
		}
	}

	makeChoices(prefix, count, start = 0) {
		const choices = []
		for (let i = 0; i < count; i++) {
			choices.push({ id: i + start, label: `${prefix} ${i + 1}` })
		}
		return choices
	}

	makeMixChoices(model) {
		const choices = []
		for (let i = 0; i < model.mixCount; i++) {
			choices.push({ id: i, label: `Mix ${i + 1}` })
		}
		let stereo = 5
		for (let i = 0; i < model.mixStereo; i++) {
			choices.push({ id: model.mixCount + i, label: `Mix ${stereo}/${stereo + 1}` })
			stereo += 2
		}
		return choices
	}

	async toggleStateAndSend(type, base, offset, mode) {
		const channel = base + parseInt(offset, 10)
		const force = parseInt(mode, 10)
		if (force === 1) this.state[type][channel] = true
		else if (force === 2) this.state[type][channel] = false
		else this.state[type][channel] = !this.state[type][channel]

		if (type === 'mute') {
			this.send(Buffer.from([0x90, channel, this.state[type][channel] ? 0x7f : 0x3f, 0x80, channel, 0x00]))
		} else if (type === 'pafl') {
			this.sendNrpn(channel, 0x51, this.state[type][channel] ? 1 : 0, 0x07)
		}
		this.checkFeedbacks(`${type}_input`)
	}

	connect() {
		this.disconnect()
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing host')
			return
		}

		this.socket = new net.Socket()
		this.socket.setNoDelay(true)

		this.socket.on('connect', () => {
			this.updateStatus(InstanceStatus.Ok)
		})

		this.socket.on('error', (err) => {
			this.log('error', `TCP error: ${err.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})

		this.socket.on('close', () => {
			this.updateStatus(InstanceStatus.Disconnected)
		})

		this.socket.on('data', (data) => {
			this.receiveBuffer = Buffer.concat([this.receiveBuffer, data])
			this.parseIncoming()
		})

		this.socket.connect(MIDI_PORT, this.config.host)
	}

	disconnect() {
		if (this.socket) {
			this.socket.destroy()
			this.socket = undefined
		}
	}

	send(buffer) {
		if (this.socket && !this.socket.destroyed) {
			this.socket.write(buffer)
		}
	}

	sendNrpn(channel, param, dataMsb, dataLsb) {
		this.send(Buffer.from([0xb0, 0x63, channel, 0xb0, 0x62, param, 0xb0, 0x06, dataMsb, 0xb0, 0x26, dataLsb]))
	}

	parseIncoming() {
		while (this.receiveBuffer.length >= 3) {
			const status = this.receiveBuffer[0]
			if ((status & 0xf0) === 0x90 && this.receiveBuffer.length >= 3) {
				const ch = this.receiveBuffer[1]
				const val = this.receiveBuffer[2]
				this.state.mute[ch] = val === 0x7f
				this.checkFeedbacks('mute_input')
				this.receiveBuffer = this.receiveBuffer.subarray(3)
			} else {
				this.receiveBuffer = this.receiveBuffer.subarray(1)
			}
		}
	}

	clamp(value, min, max) {
		if (Number.isNaN(value)) return min
		return Math.min(max, Math.max(min, value))
	}
}

module.exports = AllenHeathQuInstance
