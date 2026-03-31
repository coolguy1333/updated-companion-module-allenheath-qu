# Allen & Heath QU module

This module controls Allen & Heath QU mixers over MIDI-over-TCP (default port `51325`).

## Supported mixers
- QU16
- QU24
- QU32
- QUSB
- QUPAC

## Implemented actions (current)
- Input mute
- Input PAFL
- Input fader level (0-127, Companion variables supported)
- Input send level to mix (0-127, Companion variables supported)
- Scene recall
- Scene step (+/-)
- SoftKey fire
- QuDrive transport (Play/Stop)
- Input gain (raw 0-127)

## Implemented feedbacks
- Input mute active
- Input PAFL active

## Implemented variables
- `current_scene`
- `ch_name_<channel>`
- `level_<channel>`

## Configuration
When creating an instance set:
- **Mixer IP**: IP address of the QU mixer
- **Model**: your mixer model

## Notes
- Channel-level actions target mono input channels in the selected model range.
- Level and gain values are raw MIDI values (`0-127`) rather than dB.
- This module currently uses a focused subset of QU controls; legacy module documentation describing additional controls may not apply to this version.
