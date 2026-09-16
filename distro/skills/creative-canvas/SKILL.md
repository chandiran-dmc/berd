---
name: creative-canvas
description: Use Berd's visible session or project canvas through bounded berdctl commands.
---

# Creative canvas

Use `berdctl session list --json` to locate the current session id. Open its
chat canvas before reading or changing it:

```text
berdctl canvas open --session-id <session-id> --scope chat --json
berdctl canvas context --session-id <session-id> --scope chat --json
```

For a session attached to a project, use `--scope project --project-id
<project-id>`. Berd verifies that the session belongs to that project. The
canvas commands operate only on the mounted, visible board and reject closed
boards.

Projects and chats can have several named boards. Read `boardId` from the
attached canvas context JSON and pass it as `--board-id` to every `canvas` command. Omit
`--board-id` only for the default board. Berd verifies explicit ids against the
owner's board catalog, so an id from another session or project is rejected.

Create one bounded visible shape with `berdctl canvas add`:

```text
berdctl canvas add --session-id <session-id> --kind rectangle --x 100 --y 100 \
  --width 240 --height 144 --text "Draft" --json
```

Update a known shape id returned by `canvas add` or `canvas context`:

```text
berdctl canvas update --session-id <session-id> --shape-id <shape-id> \
  --text "Approved" --json
```

Draw an arrow between two existing shapes (the `connect` spelling is an alias
with `from` and `to` field names):

```text
berdctl canvas arrow --session-id <session-id> \
  --start-shape-id <shape-id> --end-shape-id <shape-id> --json
berdctl canvas connect --session-id <session-id> \
  --from-shape-id <shape-id> --to-shape-id <shape-id> --json
```

Import a local PNG, JPEG, or WebP into the board's persistent asset store:

```text
berdctl canvas image --session-id <session-id> --path /absolute/path/reference.png \
  --name reference.png --x 100 --y 100 --width 320 --height 200 --json
```

The command also accepts a bounded matching `--src` data URL with
`--mime-type`. Remote and blob URLs, SVG, mismatched MIME data, and files over
the bound are rejected so exported project bundles keep their images offline.

Use `canvas move`, `resize`, `align`, `distribute`, and `reorder` for bounded
batch edits. Pass shape ids returned by `canvas add`, `canvas image`,
`canvas arrow`, `canvas connect`, or `canvas context`; keep each operation
small enough to review in the visible board. Use `canvas group` and
`canvas ungroup` to preserve an intentional layout while editing it.
Repeat `--shape-ids` once per shape. Resize uses integer
`--scale-x-percent` and `--scale-y-percent` values (for example, `125` means
125%). Ungroup uses `--group-ids`.

Use `canvas viewport --mode fit` to frame the board after a large edit, or use
`--mode camera --x <x> --y <y> --zoom-percent <percent>` for a precise view.
Use `canvas undo`
to reverse a recent visible change. Every mutation is applied to the mounted
board and remains visible in the app. `canvas delete` is destructive and
requires the explicit `--confirm` flag; explain the affected ids before using
it when the user has not clearly requested deletion.

Use only the bounded fields exposed by `berdctl canvas --help`. Do not invent
shape ids, mutate hidden boards, fetch arbitrary local files, or use arbitrary
JavaScript. If a command reports that the canvas is not open, run `canvas open`
for the same session, project, and scope before retrying.
