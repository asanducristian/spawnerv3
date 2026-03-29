#!/bin/bash

# Build the linux-server Docker image

echo "Building game-runtime:latest image..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build from workspace root so we can access projects/
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

docker build \
  -f "$SCRIPT_DIR/Dockerfile" \
  -t game-runtime:latest \
  "$WORKSPACE_ROOT"

echo "✅ Image built successfully!"
echo ""
echo "Verify with:"
echo "  docker images | grep game-runtime"
echo ""
echo "Test the image:"
echo "  docker run --rm -p 22:22 -p 80:80 -e GAME_ID=test-123 game-runtime:latest"

