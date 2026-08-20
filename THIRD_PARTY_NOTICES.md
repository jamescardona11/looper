# Third-party notices

Looper's original product code is licensed under `AGPL-3.0-or-later` as
described in [`LICENSE`](LICENSE) and [`COPYRIGHT`](COPYRIGHT). The components
and test fixtures below retain their upstream terms. This file must accompany
every distribution that contains any of them.

## MIT-licensed components

### tauri-nspanel 2.1.0

- Project: <https://github.com/ahkohd/tauri-nspanel>
- Source revision: `a3122e894383aa068ec5365a42994e3ac94ba1b6`
- Copyright: Copyright (c) 2023 - Present Victor Aremu
- License: MIT, selected from the upstream `MIT OR Apache-2.0` choice
- Used by: `apps/desktop/src-tauri/Cargo.toml`

### react-native-sherpa-onnx 0.4.3

- Project: <https://github.com/XDcobra/react-native-sherpa-onnx/tree/v0.4.3>
- Copyright: Copyright (c) 2026 XDcobra
- License: MIT
- Local patch: `patches/react-native-sherpa-onnx@0.4.3.patch`

### Fastrepl audio code and AEC models

- Project: <https://github.com/fastrepl/anarlog>
- Copyright: Copyright (c) 2023-present Fastrepl, Inc.
- License: MIT
- Embedded model revision: `b14809dcd80fe80c5158c8a9f5a19fa173878b12`

The adapted crate layout is:

| Looper path | Upstream path |
| --- | --- |
| `packages/rust/audio/aec` | `crates/aec` |
| `packages/rust/audio/capture` | `crates/audio-actual` |
| `packages/rust/audio/core` | `crates/audio` |
| `packages/rust/audio/interface` | `crates/audio-interface` |
| `packages/rust/audio/mime` | `crates/audio-mime` |
| `packages/rust/audio/onnx` | `crates/onnx` |
| `packages/rust/audio/resampler` | `crates/resampler` |
| `packages/rust/audio/sync` | `crates/audio-sync` |
| `packages/rust/audio/utils` | `crates/audio-utils` |

The embedded models match these upstream files:

| Local file | Upstream path | SHA-256 |
| --- | --- | --- |
| `packages/rust/audio/aec/data/models/model_128_1.onnx` | `crates/aec/data/models/model_128_1.onnx` | `a060e46a6bebed03d6360262d814851dc6c2806cec7c1b6a388e617cae7c082c` |
| `packages/rust/audio/aec/data/models/model_128_2.onnx` | `crates/aec/data/models/model_128_2.onnx` | `6b6e312f701d3fad2aac2981ca1ed978d25dffa0bc8da9f33235a2e91f56705a` |

### Silero VAD

- Project: <https://github.com/snakers4/silero-vad>
- Copyright: Copyright (c) 2020-present Silero Team
- License: MIT
- Embedded artifact: `packages/rust/looper-ts/src/vad/silero_vad_16k_op15.onnx`
  (v5, 16 kHz, opset 15), redistributed unmodified

The surrounding inference code is original Looper code.

### parakeet-rs 0.3.6

- Project: <https://github.com/altunenes/parakeet-rs>
- Source revision: `7deba612fc9a30c4a7182f4eaa53554cb2fa42c8`
- Copyright: Copyright (c) 2025 Enes Altun
- License: MIT
- Adapted paths: `packages/rust/looper-ts/src/parakeet/features.rs`, `mod.rs`,
  `model.rs`, `timestamps.rs`, and `vocab.rs`

### transcribe-rs 0.3.11

- Project: <https://github.com/cjpais/transcribe-rs>
- Source revision: `343768c100d566b135fbb7a2441e61fa8aa177f2`
- Copyright: Copyright (c) 2025 Ilya Stupakov
- License: MIT
- Adapted paths: `packages/rust/looper-ts/src/cohere/decoder.rs`, `mod.rs`,
  and `vocab.rs`

### expo-modules-jsi 57.0.4

- Project: <https://github.com/expo/expo/tree/a4789f1e53353f4929b0baddcfe5a7c622b99c71/packages/expo-modules-jsi>
- Source revision: `a4789f1e53353f4929b0baddcfe5a7c622b99c71`
- Copyright: Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)
- License: MIT
- Local patch: `patches/expo-modules-jsi@57.0.4.patch`

### MIT license text

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## GPL-licensed test fixtures

### VoxForge Spanish fixture

- File: `test-support/fixtures/audio/es-voxforge.wav`
- Source archive: `AGOs-20100831-jdm.tgz`
- Source path: `AGOs-20100831-jdm/wav/es-0015.wav`
- Source: <http://www.repository.voxforge1.org/downloads/es/Trunk/Audio/Main/16kHz_16bit/AGOs-20100831-jdm.tgz>
- SHA-256: `260cf28236e1a4a563be5bece26b291ab1cc917dce1ddceba10c2c3fa6c89a8e`
- Copyright: Copyright 2010 Free Software Foundation
- License: GPL-3.0-or-later

### VoxForge Portuguese fixture

- File: `test-support/fixtures/audio/pt-voxforge.wav`
- Source archive: `waldyrious-20140912-dbi.tgz`
- Source path: `waldyrious-20140912-dbi/wav/072.wav`
- Source: <http://www.repository.voxforge1.org/downloads/pt/Trunk/Audio/Main/16kHz_16bit/waldyrious-20140912-dbi.tgz>
- SHA-256: `036006f881d55c78509f75d40b7c3a660450a064474ef518459ce499e538f676`
- Copyright: Copyright 2014 Fundação de Software Livre
- License: GPL-3.0-or-later

The complete license text is in
[`test-support/fixtures/audio/LICENSE.GPL-3.0`](test-support/fixtures/audio/LICENSE.GPL-3.0).

## Distribution review still required

- Recover the exact `fastrepl/anarlog` revision used to adapt
  `packages/rust/audio/**` before distributing artifacts containing it.
- Do not redistribute `test-support/fixtures/audio/harvard.wav` until it is
  replaced by a project-owned recording or its source and license are verified.
- Resolve the historical source and license of
  `apps/mobile/targets/keyboard/Types/SharedWorkflow.swift` before distributing
  it separately.
- Produce a complete transitive-license inventory for every release artifact.
  Installed metadata for `@polar-sh/sdk@0.47.1` and `khroma@2.1.0` needs MIT
  overrides because those packages omit the license field.
- Distributed applications must include the AGPL source offer and link to the
  canonical public source URL once it exists.

This inventory records technical provenance; it is not independent proof of
authorship or a substitute for legal review.
