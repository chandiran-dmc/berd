# Creative Harness: Berd's visual workspace

Creative Harness adds a tldraw workspace to the Berd desktop fork. Berd's selected
agent, existing sign-ins, ACP transport, message queue and pinned upstream Goose
backend remain authoritative. There is no second canvas chat service or model
routing gateway. The backend fork is reserved for demonstrated future needs.

- Desktop fork: https://github.com/chandiran-dmc/berd
- Desktop upstream: https://github.com/block/berd
- Reserved backend fork: https://github.com/chandiran-dmc/goose
- Upstream backend: https://github.com/aaif-goose/goose

## Boards and chat

Open Canvas in a conversation. A project conversation opens its project workspace;
a standalone conversation opens its private chat board. The Chat/Project switch
keeps both available. Create named boards with New board, select a board from the
board menu, and rename it using Board name. Project boards are shared across that
project's conversations; private chat boards remain separate. Hide chat gives the
canvas the workspace; Show chat restores the same composer and its draft.

Boards have stable identities independent of names. Documents, board catalogs and
media live in IndexedDB. Multiple windows receive document changes through the
existing BroadcastChannel adapter. This is local storage, not cloud collaboration.
Clearing app data removes it. Export a project for a portable backup.

## Canvas-aware conversations

Attach visible canvas captures a PNG of the viewport. Ask about selection captures
the selection bounds and adds a question to the composer. Both add an ordinary,
removable image attachment to the selected conversation; nothing is sent until the
user sends the message. Its expandable summary shows the exact attached board,
screenshot and JSON. Removing the attachment removes both image and context.

Context includes selected shapes first, visible shapes, page-space bounds, camera,
selection, summaries of offscreen clusters, and recent shape edits. It is stable in
shape order and bounded to 100 detailed shapes, 500 text characters per shape,
24 offscreen clusters, 10 recent edit batches and 64 KB of serialized context.
Truncation counts are explicit. The screenshot is bounded to 1600 pixels on its
longest edge, then passes through Berd's existing image normalization. Attachment
payload limits apply to image and context together.

This integrates the complete user-facing feature set of tldraw's Agent starter kit
at the repository's pinned tldraw 5.4.2 version. Its canvas context, work/review
modes, persistent todo list, canvas lints, viewport control and editing actions run
through Berd's existing selected agent and `berdctl` tool surface. Berd's ordinary
ACP transcript provides streamed messages, thinking and history, so the starter's
standalone Cloudflare worker and duplicate model picker are replaced by the host
application's equivalent services. The adapted source retains the starter's MIT
license alongside the implementation.

The existing agent receives the screenshot as an ACP image block and the structure
as text through Berd's ordinary queue. A provider must support image inputs to
interpret screenshots. Attaching a board sends that snapshot to the selected
provider when the message is submitted; local storage does not make inference
local. Canvas text is identified as user-provided content rather than instructions.
Source: https://tldraw.dev/starter-kits/agent

## Agent editing

The bundled `creative-canvas` skill documents `berdctl canvas` commands. Use
`berdctl canvas --help` for the authoritative generated surface. In addition to
notes, text and geometry, commands cover freehand pen paths, bound arrows,
persistent image imports, deleting and clearing, grouping/ungrouping,
moving/resizing/rotating batches, aligning, distributing, stacking, reordering,
viewport navigation, agent mode/todo updates and undo. The Agent panel exposes the
same persistent work/review mode and todo list in the canvas UI, reports canvas
lints, and can queue a work or review prompt with attached visual context. Commands
validate bounded inputs and operate on a visible, mounted board. Project targets
must belong to the named session. Explicit board IDs must belong to the selected
scope's catalog.

Mutations appear immediately, announce feedback on the canvas, and stop undo history
at logical operations. Delete remains reversible through undo. Image placement
copies PNG/JPEG/WebP bytes into the same local asset adapter; arbitrary remote URLs,
SVG payloads and blob URLs are not accepted as agent image sources.

## Executable workflows

Switch the board from Canvas to Workflow to use the complete tldraw Workflow
starter kit at the pinned 5.4.2 version. It includes typed node shapes, draggable
component tools, input and output ports, directed connection shapes and bindings,
connection insertion, workflow regions, run/stop controls and execution state.
The included node library has add, subtract, multiply, divide, conditional,
slider and live earthquake-data nodes. Connected graphs execute in dependency
order and write results back to their nodes.

Workflow records use the same local board store as ordinary tldraw content. They
survive board changes and app reloads, synchronize through the existing local
multi-window adapter, and remain editable in exported bundles. An imported or
reopened board containing workflow nodes re-enters Workflow mode automatically.
The starter source and its MIT license live under `src/features/canvas/workflow`.
Source: https://tldraw.dev/starter-kits/workflow

## Editable portable bundles

More → Export editable bundle downloads `.creative.zip` containing all boards in the current
scope, editable tldraw documents and their actual media. PNG export is a separate
rendered output. Import editable bundle validates the archive before publishing imported
boards. Imports receive fresh board IDs, preserving existing boards even when names
match. Unsupported versions, malformed records, external asset dependencies,
missing media, unsafe archive paths and oversized archives are rejected.

The format supports at most 100 boards, a 100 MB compressed/expanded archive budget
and 25 MB per asset. SVG, remote media dependencies and bookmark image previews
are rejected; plain link/text bookmarks remain editable. Bundles contain the board's media and creative brief; they do
not contain agent credentials, chat histories or provider settings. Store private
project bundles privately.

## Reference → brief → variations → export

1. Import reference images using the canvas image tool.
2. Select the references. Open Creative workflow and choose Draft brief in chat.
   The existing selected agent receives the visual context when you send and can
   write a creative brief as a canvas note using `berdctl`.
3. Select its note and choose Use selected note as brief, or write your own brief.
   The brief is saved in the board document and travels with editable bundles.
4. Select up to four reference images, choose 1–4 variations, and Generate variations.
   Generated PNGs are stored as ordinary persistent image assets on the board.
5. Arrange the images manually or ask the existing agent to arrange them. Export
   PNG for a rendered composition or More → Export editable bundle for all editable boards/media.

The optional image capability uses the official OpenAI Images API directly from
the native shell, fixed to `gpt-image-2`. It is an image operation, not another chat
agent. It uses `/v1/images/edits` with references and `/v1/images/generations` without
references. Current API documentation:
https://developers.openai.com/api/docs/guides/image-generation

Set `CREATIVE_OPENAI_API_KEY` (preferred) or `OPENAI_API_KEY` in the process environment
before starting the desktop app. The key stays in the native process and is never
returned to the renderer, embedded in a bundle, or placed in `VITE_` settings. There
is no silent fallback to coding subscriptions or existing voice credentials. OpenAI
API access and billing are separate from coding subscriptions. The UI reports when
image API access is not configured. A configured key is not proof of account quota
or model entitlement; provider errors are shown without response bodies or secrets.
There are no automatic retries of paid generation requests.

Paid generation must be tested with legitimate configured access before claiming a
live generation result. Browser tests with deterministic image responses validate
client behavior only and do not establish provider availability.

## Run locally

Requirements: Node 22.12+, pnpm, Rust (pinned toolchain), Xcode on macOS, and an
accepted Xcode license.

```sh
pnpm install --frozen-lockfile
pnpm dev:creative
```

The first run builds the pinned Goose backend unless `GOOSE_BIN` explicitly names
a compatible binary. Example with the installed Berd backend:

```sh
GOOSE_BIN=/Applications/Berd.app/Contents/MacOS/goosed VITE_PORT=1541 pnpm dev:creative
```

`CARGO_TARGET_DIR` may point to an existing build cache. Creative Harness has its own
Tauri identifier, URL scheme and Goose state root. It disables automatic updating
and system CLI installation. The Rust executable retains the Berd name. This is
not the separate original Creative Harness app.

## tldraw licensing

Set the public client-side `VITE_TLDRAW_LICENSE_KEY` in `.env.local` when the hobby
license arrives, then restart or rebuild. Production requires a valid license.
This fork does not bypass license checking or attribution. `pnpm canvas:assets`
prepares the pinned SDK's fonts, icons and translations locally; dev/build run it
automatically. Berd/Goose remain Apache-2.0; tldraw retains its separate license.

## Verification commands

```sh
pnpm typecheck
pnpm check
pnpm test
pnpm build
pnpm test:canvas
cd src-tauri
cargo test -p berdctl
```

The canvas browser suite runs the real editor, IndexedDB, image decoding, action
dispatch and composer queue with a mocked native/ACP shell. Native verification
must separately exercise the selected existing agent and shell. A signed/notarized
release and production license activation require separate release verification.
