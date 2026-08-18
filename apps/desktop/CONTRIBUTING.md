# Contributing to Looper

Thanks for helping out. Looper is a small project with a big surface area: local speech, native integrations, two platforms. Code, translations, bug reports, or just spreading the word all help it grow.

## Ways to help

|                   | What you can do                               |
| ----------------- | --------------------------------------------- |
| **Translations**  | Help localize Looper into your language       |
| **Bug reports**   | Tell us when something breaks                 |
| **Feature ideas** | Suggest improvements in the issue tracker     |
| **Code**          | Fix bugs, polish UI, improve the Rust backend |
| **Word of mouth** | Star the repo, share Looper, write about it   |

---

## Translations

Translations run on [Lokalise](https://lokalise.com/), by invite. Open a translation request in the repository's issue tracker with:

- The language(s) you want to translate
- Whether you're a native speaker
- Any prior translation experience (optional)

Applications are reviewed by hand, and not every language gets approved, depending on demand and capacity. If you're in, you'll get a Lokalise invite by email.

Active translators get a **Personal** license (full access on up to 5 devices) as thanks.

> <a href="https://lokalise.com/"><img src="./assets/readme/lokalise.png" width="18" alt="Lokalise" align="center" /></a>&ensp;Translations supported by [Lokalise](https://lokalise.com/)

---

## Bug reports

Found a bug? Open an issue in the repository's configured issue tracker and include:

- **Steps to reproduce:** what you did, in order
- **Expected vs. actual:** what you thought would happen, and what did
- **Environment:** your OS version, and your Looper version (Settings → About)

For UI bugs, a screenshot or screen recording goes a long way.

For security or privacy issues, use the private reporting channel configured by the repository host instead of opening a public issue.

---

## Feature requests

Have an idea? Open an issue with what you'd like and why it's useful. Check existing issues first to avoid duplicates.

Looper is local-first by design. Features that send audio or transcripts to a server by default probably won't fit the project's direction.

---

## Code contributions

1. Create a branch from `main` in your fork or local clone.
2. Set up a local build ([Building locally](#building-locally)).
3. Make your changes and test them on the platform(s) you touched.
4. Open a change request **targeting `main`** with a clear description of what changed and why.

All change requests target `main`, regardless of the current release version.

**What we're looking for in contributions:**

- Changes that extend existing code rather than adding parallel systems
- Platform parity when touching macOS- or Windows-specific behavior
- `pnpm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` passing

Run the repository's formatting, lint, build, and test checks before submitting a change. Native changes must also be checked on every platform they affect.

---

## Spread the word

Tell a friend, mention Looper in a post, or share the project through its current repository host.

---

## Building locally

### macOS

**Prerequisites:** macOS 14+, [Rust](https://rustup.rs/) 1.74+, [pnpm](https://pnpm.io/) 10+ (with Node.js 20+), Xcode Command Line Tools

```bash
xcode-select --install
git clone <repository-url>
cd Looper
pnpm install
pnpm tauri dev    # Development with hot reload
pnpm tauri build  # Production build
```

### Windows

**Prerequisites:** Windows 10/11, [pnpm](https://pnpm.io/) 10+ (with Node.js 20+), [Rust](https://rustup.rs/) with the MSVC toolchain, Visual Studio Build Tools with **Desktop development with C++** / MSVC, and the Microsoft Edge WebView2 Runtime.

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
git clone <repository-url>
cd Looper
pnpm install
pnpm tauri dev    # Development with hot reload
pnpm tauri build  # Production build
```

On Windows, `pnpm tauri ...` stores Cargo build artifacts in `C:\.looper-cargo-target` to avoid long native build paths. Override with `CARGO_TARGET_DIR` or `LOOPER_CARGO_TARGET_DIR` if needed.

If you run Cargo directly on Windows, set a short target directory first:

```powershell
$env:CARGO_TARGET_DIR = "C:\.looper-cargo-target"
cargo check --manifest-path src-tauri/Cargo.toml
```

> [!TIP]
> After a production build on macOS, you may need to re-enable accessibility permissions in System Settings for text insertion to work.
