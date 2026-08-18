# Third-party notices

Looper's original product code is covered by the root `LICENSE` and
`COPYRIGHT`. Some embedded or adapted permissively licensed components retain
their upstream notices in their owning package:

- [Mobile notices](apps/mobile/THIRD_PARTY_NOTICES.md)
- [Rust transcription notices](packages/rust/looper-ts/THIRD_PARTY_NOTICES.md)
- [Audio license](packages/rust/audio/LICENSE)

## AGPL source lineage

The reconstruction includes code adapted from the GNU AGPL-3.0
[Glimpse application](https://github.com/glimpse-hq/Glimpse), used as a source
reference during development. Local transcription components also reference
[Glimpse-Speech](https://github.com/glimpse-hq/Glimpse-Speech) under its own
upstream terms recorded in the owning package notice. The mobile keyboard and
dictation layer was also reviewed against the AGPLv3 [Voquill project](https://github.com/voquill/voquill);
the mobile-specific attribution is recorded in `apps/mobile/THIRD_PARTY_NOTICES.md`.
The complete GNU AGPL v3 text is included in the root `LICENSE`; the product name, artwork, and
trademarks used here are Looper's and are not Glimpse branding. The provenance
process and the remaining manual-risk cases are recorded in
[`docs/rebuild/CONTAMINATION_RISK_REGISTER.md`](docs/rebuild/CONTAMINATION_RISK_REGISTER.md).

Those files must travel with the corresponding package. This index is not a
replacement for the complete upstream license texts.
