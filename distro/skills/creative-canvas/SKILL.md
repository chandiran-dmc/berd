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

Use only the bounded shape kinds and fields exposed by `berdctl canvas
--help`. Do not invent shape ids, mutate hidden boards, or use arbitrary
JavaScript. There is no delete command; ask the user before proposing a
workflow that requires destructive canvas changes.
