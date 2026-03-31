# companion-module-allenheath-qu

Allen & Heath Qu series control module for Bitfocus Companion v4.

## Supported mixers

- Qu-16
- Qu-24
- Qu-32
- Qu-SB
- Qu-Pac

## Qu-Pac notes

This module keeps Qu-Pac configured as a **32 mono-input-capable** mixer for control workflows (for example with AB168 expansion).

Qu-Pac capability notes used by this module:
- 16 local mono inputs
- expandable to 32 mono inputs
- 3 stereo inputs
- 4 mono + 3 stereo mixes
- 4 stereo groups
- 2 stereo matrix
- 15 soft keys

## Current v4 action coverage

- Input mute and PAFL
- Input fader level (supports Companion variables)
- Input send level to mix (supports Companion variables)
- Scene recall and scene step
- SoftKey fire action
- QuDrive transport (play/stop)
- Input gain (raw MIDI value)

## Companion compatibility notes

- Manifest includes `type: "connection"` and uses the Node 22 runtime (`apiVersion: 2.0.0`).
- Entrypoint exports the module class directly (`module.exports = ...`) instead of using the removed `runEntrypoint()` helper.
- Variable definitions use the API 2.0 object format expected by modern Companion.

## Development checks

- `npm run check`

See [HELP.md](HELP.md) and [LICENSE](LICENSE) for additional information.
