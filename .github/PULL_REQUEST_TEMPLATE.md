<!-- Keep the title in Conventional Commit style, e.g. `feat(web): add artifact runner`. -->

## What & why

<!-- One or two sentences. What does this change and what problem does it solve? -->

## How to test

<!-- Steps a reviewer can follow to verify the change locally. -->

## Checklist

`make ci` is the portable local baseline. GitHub CI also runs provider,
browser, native Rust, audio, and Windows-specific jobs where applicable.

- [ ] `make ci` passes (typecheck, non-mutating checks, desktop boundary, docs, unit tests)
- [ ] The affected app/package builds
- [ ] Required browser, native, device, or provider evidence is attached or explicitly marked missing
- [ ] Web/mobile parity kept where the feature applies to both
- [ ] Env vars: declared in the relevant `.env.example` and configured in the intended deployment; values are never committed
- [ ] No secrets, API keys, or `.env*` files in the diff

## Evidence

<!-- Add screenshots, recordings, logs, or explicitly state what remains unverified. -->

## Related

<!-- Closes #123, follows up on #456. -->
