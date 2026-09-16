# Creative Harness: Berd with an optional canvas

This downstream fork adds a tldraw canvas to Berd's desktop agent workspace.
The original Berd chat, provider setup, and Goose backend remain the agent runtime.
There is no second canvas model gateway and no Cloudflare service to run.

## Repositories

- Desktop fork: https://github.com/chandiran-dmc/berd
- Backend fork: https://github.com/chandiran-dmc/goose
- Desktop upstream: https://github.com/block/berd
- Backend upstream: https://github.com/aaif-goose/goose

The Goose fork is reserved for future backend changes. The app deliberately keeps
the reviewed upstream commit in `goose-backend.lock.json`; a canvas does not
require maintaining a modified Goose runtime.

## Boards

Open a conversation and use its Canvas control. A chat canvas belongs to that
conversation. A project canvas is shared by conversations assigned to the same
project. Switching scope chooses a different board; it does not move or copy the
current board. Closing the canvas hides it without clearing its contents.

Each board and its imported media are stored in local IndexedDB, with separate
versioned keys for chat and project identities. This is local app storage, not a
cloud sync or a portable project file. Clearing application data removes boards.
PNG export provides a rendered copy; it does not preserve editable shapes.

Use the canvas tools for shapes, notes, arrows, drawing, and image references.
The existing selected agent can use the bundled `berdctl canvas` commands to read
and edit an open board. Agent changes are visible and use the editor's undo
history. See the bundled canvas skill for the command surface.

## Run locally

Requirements: Node 22.12+, pnpm, Rust (the pinned toolchain), and Xcode on macOS.
Review and accept Xcode's license before the first native build.

```sh
pnpm install --frozen-lockfile
pnpm dev:creative
```

The first run builds the pinned Goose backend if `GOOSE_BIN` is not supplied.
To test against an existing compatible Goose binary, explicitly set `GOOSE_BIN`
to its absolute path. The launcher does not discover or copy account credentials.
Connect providers through the app's normal setup flow.

Creative Harness uses its own Tauri identifier, URL scheme, and Goose state root
so it can run alongside the official Berd application. The launcher disables
updating and automatic system CLI installation. The underlying Rust executable
and some upstream UI text still use the Berd name.

## tldraw licensing and assets

Copy `.env.example` to `.env.local` and set `VITE_TLDRAW_LICENSE_KEY` when you
receive your hobby license. Restart development or rebuild after changing it.
The key is a public client-side license key; provider credentials do not belong
in any `VITE_` variable. Production requires a valid tldraw license. This fork
does not disable or bypass the license checker or attribution.

`pnpm canvas:assets` copies the pinned tldraw fonts, icons, translations, and
license into `public/tldraw/`. Dev and build commands prepare these automatically.
The generated directory is ignored by Git and included in the frontend build.

Berd and Goose retain their Apache-2.0 licenses. The tldraw SDK and its assets
retain their separate tldraw license. This implementation uses the SDK directly;
it does not bundle the starter kit's separate agent loop.

## Scope of this first slice

This provides a persistent visual workspace and agent-editable board. It is not
yet a FLORA-style generation graph: image/video generation, node execution,
provider billing, timeline editing, and portable project bundles remain separate
future features. Canvas content can be sent to the selected provider when the
user asks the agent to inspect it; local storage does not make remote inference
offline.

## Verification

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:canvas
cd src-tauri
cargo test -p berdctl
```

The browser suite uses the real canvas editor and command dispatcher with a
mocked Tauri/ACP transport. It covers edits, undo, closed-board rejection,
chat isolation, project sharing across reloads, image persistence, PNG export,
and the native app's minimum window size. CI runs this suite.

Native development was also exercised on macOS using the installed Berd
`goosed` as an explicit override: Codex's existing sign-in was detected, a live
conversation completed, and canvas CLI commands changed the visible board.
A signed/notarized release bundle and production tldraw license activation
are not part of this development build.
