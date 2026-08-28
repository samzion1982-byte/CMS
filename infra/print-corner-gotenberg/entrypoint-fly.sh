#!/bin/sh
set -e

# Gotenberg on localhost (not exposed publicly)
gotenberg \
  --api-timeout=120s \
  --libreoffice-restart-after=10 &

# Caddy on :8080 with X-Gotenberg-Key check (public port for Fly/Railway)
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
