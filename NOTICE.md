# Third-party notices

Looper's original product code is covered by the root `LICENSE` and
`COPYRIGHT` under `AGPL-3.0-or-later`. Embedded or adapted third-party
components retain their upstream notices in their owning package:

- [Mobile notices](apps/mobile/THIRD_PARTY_NOTICES.md)
- [Rust transcription notices](packages/rust/looper-ts/THIRD_PARTY_NOTICES.md)
- [Desktop native notices](apps/desktop/src-tauri/THIRD_PARTY_NOTICES.md)
- [Desktop font notice](apps/desktop/public/fonts/NOTICE.md)
- [Audio license](packages/rust/audio/LICENSE)

Patched dependencies retain their upstream license declarations:

- `expo-modules-jsi@57.0.4` — MIT; patch:
  `patches/expo-modules-jsi@57.0.4.patch`; upstream package:
  `https://github.com/expo/expo/tree/main/packages/expo-modules-jsi`.
- `react-native-sherpa-onnx@0.4.3` — MIT; patch:
  `patches/react-native-sherpa-onnx@0.4.3.patch`; full notice in the mobile
  notices linked above.

The provenance process and remaining manual-review cases are recorded in
[`docs/rebuild/CONTAMINATION_RISK_REGISTER.md`](docs/rebuild/CONTAMINATION_RISK_REGISTER.md).

Those files must travel with the corresponding package. This index is not a
replacement for the complete upstream license texts.
