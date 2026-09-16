#!/usr/bin/env bash
# Creative Harness addition. Run the fork with a separate app identity and state.
set -euo pipefail
cd "$(dirname "$0")/.."
export VITE_PORT="${VITE_PORT:-1530}"
export VITE_UPDATER_ENABLED=false
export BERD_RELEASE_CHANNEL=disabled
export BERD_DEV_APP_NAME="Creative Harness"
export GOOSE_PATH_ROOT="${GOOSE_PATH_ROOT:-$HOME/Library/Application Support/dev.chandiran.creative-harness/goose}"
export GOOSE_DISTRO_DIR="$PWD/distro"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/src-tauri/target}"
mkdir -p "$GOOSE_PATH_ROOT"
pnpm canvas:assets
pnpm --filter @aaif/goose-sdk build:ts
if [[ -z "${GOOSE_BIN:-}" ]]; then
  export GOOSE_BIN="$(GOOSE_DEV_MODE=required ./scripts/ensure-local-goose.sh --print-bin)"
fi
(cd src-tauri && cargo build -p berdctl -p berd-monitor)
export BERDCTL_BIN="$CARGO_TARGET_DIR/debug/berdctl"
export BERD_MONITOR_BIN="$CARGO_TARGET_DIR/debug/berd-monitor"
config="$(node -e 'const port = Number(process.env.VITE_PORT); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid VITE_PORT"); process.stdout.write(JSON.stringify({build:{devUrl:`http://localhost:${port}`,beforeDevCommand:{script:`exec pnpm exec vite --port ${port} --strictPort`,cwd:"..",wait:false}}}));')"
exec pnpm tauri dev --features berdctl,app-test-driver,no-bb-cli-install,no-block-npm-registry \
  --config src-tauri/tauri.dev.conf.json \
  --config src-tauri/tauri.creative.conf.json \
  --config "$config"
