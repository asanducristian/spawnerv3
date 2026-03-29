#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pass --no-cache to force a full rebuild (re-clones repos, re-runs npm build)
docker build \
  "$@" \
  -f "$SCRIPT_DIR/Dockerfile" \
  -t ubuntu-server:latest \
  "$SCRIPT_DIR"

echo ""
echo "✅ ubuntu-server:latest built"
echo ""
echo "Test it:"
echo "  docker run --rm -p 2222:22 -p 8080:80 ubuntu-server:latest"
echo "  ssh admin@localhost -p 2222   (password: admin123)"
echo "  curl -H 'Host: testwebsite.com' http://localhost:8080/"
echo "  curl -H 'Host: api.testwebsite.com' http://localhost:8080/health"
