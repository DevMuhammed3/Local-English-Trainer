# Local English Trainer

A simple local-first desktop app for learning and reviewing English vocabulary with spaced repetition.

All user data stays on the user's machine. No accounts, backend, cloud services, or online database.

## Features

* Review English vocabulary with spaced repetition
* Recall the meaning before revealing the answer
* Listen to word pronunciation using local TTS
* Record yourself speaking and play the recording back for practice
* Add, edit, delete, and search vocabulary
* Optional example sentences
* Light, dark, and system themes
* Keyboard-friendly review (Space/Enter to reveal)
* Fully local data storage

## Tech Stack

* Tauri 2 (Rust)
* React 19 + TypeScript
* Tailwind CSS v4
* Local JSON storage
* Web Speech API (TTS)
* MediaRecorder API (voice recording)

## Privacy

Local English Trainer does not require:

* Accounts
* Backend servers
* Cloud storage
* Online databases
* Uploaded recordings
* AI services

Vocabulary data is stored locally on the user's computer. Voice recordings are temporary and never persisted to disk.

## Getting Started

### Prerequisites

* Node.js 20+
* pnpm
* Rust (rustup)
* Linux (Fedora): `sudo dnf install webkit2gtk4.1-devel libsoup3-devel gtk3-devel librsvg2-devel`

### Run

```bash
pnpm install
cargo tauri dev
```

### Build

```bash
cargo tauri build
```

Produces a native binary, `.deb`, and `.rpm` for Linux.

## Status

Early MVP. The focus is on making the core vocabulary review experience useful and pleasant before adding more features.
