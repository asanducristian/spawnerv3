#!/bin/bash
set -uo pipefail

log() { echo "[boot] $*"; }

log "Creating dynamic users..."
/app/create-users.sh

# Detect backend entry file
BACKEND_ENTRY=""
for f in \
    "$BACKEND_DIR/src/server/js/server.js" \
    "$BACKEND_DIR/src/server.js" \
    "$BACKEND_DIR/src/server/server.js" \
    "$BACKEND_DIR/server.js"; do
  [ -f "$f" ] && BACKEND_ENTRY="$f" && break
done

log "Starting SSH..."
mkdir -p /var/run/sshd
/usr/sbin/sshd

log "Starting nginx..."
nginx -t && nginx

if [ -n "$BACKEND_ENTRY" ]; then
  log "Starting backend ($BACKEND_ENTRY)..."
  su -s /bin/bash api -c "
    export PORT=3001
    pm2 delete backend 2>/dev/null || true
    pm2 start '$BACKEND_ENTRY' --name backend
  "
else
  log "No backend entry found, skipping."
fi

log "Boot complete. SSH :22 | nginx :80"
tail -f /dev/null
