# Real speech fixtures

These files contain recorded human speech. They are used by local and remote
STT release gates; generated or mocked transcripts are not accepted.

| File | Language | Expected text/tokens | Source |
| --- | --- | --- | --- |
| `harvard.wav` | English | `stale smell`, `old beer`, `heat`, `odor`, `pickle`, `ham` | Existing Looper Harvard-sentence fixture |
| `es-voxforge.wav` | Spanish | `parras artificiales`, `hojas`, `terciopelo` | VoxForge `AGOs-20100831-jdm`, utterance `es-0015` |
| `pt-voxforge.wav` | Portuguese | `festa`, `mundo`, `contente` | VoxForge `waldyrious-20140912-dbi`, utterance `072` |

The Spanish and Portuguese recordings come from the public VoxForge 16 kHz,
16-bit speech repository and retain its GPL corpus license:

- Spanish archive: `http://www.repository.voxforge1.org/downloads/es/Trunk/Audio/Main/16kHz_16bit/AGOs-20100831-jdm.tgz`
- Portuguese archive: `http://www.repository.voxforge1.org/downloads/pt/Trunk/Audio/Main/16kHz_16bit/waldyrious-20140912-dbi.tgz`
