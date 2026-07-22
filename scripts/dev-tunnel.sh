#!/usr/bin/env bash
# Build + preview + cloudflared quick tunnel — share the running game through a
# public HTTPS URL (e.g. to playtest multiplayer with someone off-network).
#
# Why preview and not `npm run dev`: the authoritative game WebSocket is mounted
# onto Vite's HTTP server by viteWSPlugin's `configureServer` AND
# `configurePreviewServer` hooks, so realtime sync works through either — but the
# production preview bundle is what you actually want to share. The client builds
# its socket URL from `location.host` (wss:// under https), so it dials back
# through the tunnel with no extra config.
#
# cloudflared uses a single outbound HTTPS connection to Cloudflare's edge, so
# networks that block inbound ports still tunnel fine, and its quick-tunnel mode
# needs no Cloudflare account — it prints a one-shot https://<name>.trycloudflare.com
# URL that forwards HTTP + WebSocket upgrades to the local preview server.
#
# The cloudflared binary is checked in at ./bin/cloudflared (gitignored) so no
# sudo/install is needed. To refresh it:
#   curl -fsSL -o ./bin/cloudflared \
#     https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
#   chmod +x ./bin/cloudflared

set -euo pipefail

PORT="${PORT:-5173}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLOUDFLARED="$ROOT_DIR/bin/cloudflared"

if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "cloudflared not found at $CLOUDFLARED" >&2
  echo "Run: curl -fsSL -o $CLOUDFLARED https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x $CLOUDFLARED" >&2
  exit 1
fi

# Kill the whole process group (preview + tunnel) on exit/Ctrl-C.
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Let Vite's preview host check accept the *.trycloudflare.com Host (see
# vite.config.ts). Only set here, so plain `npm run preview` stays strict.
export DELVE_TUNNEL=1

echo "▸ Building production bundle…"
npx vite build

echo "▸ Serving preview on :$PORT and opening cloudflared tunnel…"
# --host 0.0.0.0 so cloudflared (and the LAN) can reach the preview server.
npx vite preview --host 0.0.0.0 --port "$PORT" &

# Quick-tunnel mode: no account, prints an https://<name>.trycloudflare.com URL
# in an info banner on stdout. Watch this script's output for the URL.
"$CLOUDFLARED" tunnel --url "http://localhost:$PORT" &

# Exit (and trigger cleanup) as soon as either background job stops.
wait -n
