# Third-party notices

`looper-ts` embeds the model below and contains adapted source code from the
projects that follow. The adaptations are internal to this crate; neither
upstream crate is linked as a dependency.

## Glimpse-Speech (MIT)

- Project: <https://github.com/glimpse-hq/Glimpse-Speech>
- Upstream package: `glimpse-speech`; its Cargo metadata declares `MIT`.
- Reference/adaptation scope: local transcription engine boundaries and
  speech-pipeline contracts documented in
  `docs/rebuild/CONTAMINATION_RISK_REGISTER.md`.
- This repository does not link `glimpse-speech` as a Cargo dependency. The
  Looper crate is distributed under the root AGPL license, while this notice
  preserves the upstream MIT attribution for the adapted portions.

The upstream license declaration is available in the repository's
`Cargo.toml` at <https://raw.githubusercontent.com/glimpse-hq/Glimpse-Speech/main/Cargo.toml>.
No separate upstream copyright holder is declared in that metadata.

## Silero VAD (MIT)

- Project: <https://github.com/snakers4/silero-vad>
- Copyright: Copyright (c) 2024 Silero Team
- License: MIT
- Embedded artifact: `src/vad/silero_vad_16k_op15.onnx` (v5, 16 kHz opset 15),
  redistributed unmodified. The surrounding inference code is Looper's own.

```text
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
```

## parakeet-rs 0.3.6

- Project: <https://github.com/altunenes/parakeet-rs>
- Source revision: `7deba612fc9a30c4a7182f4eaa53554cb2fa42c8`
- Copyright: Copyright (c) 2025 Enes Altun
- License: MIT
- Adapted paths:
  - `src/parakeet/features.rs`
  - `src/parakeet/mod.rs`
  - `src/parakeet/model.rs`
  - `src/parakeet/timestamps.rs`
  - `src/parakeet/vocab.rs`

```text
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
```

## transcribe-rs 0.3.11

- Project: <https://github.com/cjpais/transcribe-rs>
- Source revision: `343768c100d566b135fbb7a2441e61fa8aa177f2`
- Copyright: Copyright (c) 2025 Ilya Stupakov
- License: MIT
- Adapted paths:
  - `src/cohere/decoder.rs`
  - `src/cohere/mod.rs`
  - `src/cohere/vocab.rs`

```text
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
```
