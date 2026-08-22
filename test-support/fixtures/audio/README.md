# Real speech fixtures

These files contain recorded human speech. They are used by local and remote
STT release gates; generated or mocked transcripts are not accepted.

| File | Language | Expected text/tokens | Source |
| --- | --- | --- | --- |
| `harvard.wav` | English | `stale smell`, `old beer`, `heat`, `odor`, `pickle`, `ham` | Existing Looper Harvard-sentence fixture |
| `es-voxforge.wav` | Spanish | `parras artificiales`, `hojas`, `terciopelo` | VoxForge `AGOs-20100831-jdm`, utterance `es-0015` |
| `pt-voxforge.wav` | Portuguese | `festa`, `mundo`, `contente` | VoxForge `waldyrious-20140912-dbi`, utterance `072` |

The Spanish and Portuguese recordings come from the public VoxForge speech
repository and retain the archive's GPLv3-or-later terms. Exact paths, hashes,
copyright notices, source archives, and the complete license are in
[`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md).

The source and license of `harvard.wav` remain unresolved; do not redistribute
that fixture until its provenance is verified or it is replaced.
