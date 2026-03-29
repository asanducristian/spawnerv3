# Docker Images

This directory contains all Docker images used by the Container Spawner.

## Available Images

### `linux-server/`
A realistic Linux server container with:
- **Alpine Linux** (lightweight)
- SSH server (port 22)
- nginx web server (port 80)
- Multiple users (admin, api, webuser)
- tmux, vim, git, curl
- Static website at `/var/www/testwebsite.com`

**Build:**
```bash
cd images/linux-server
./build.sh
```

**Image name:** `game-runtime:latest`  
**Size:** ~200MB

---

### `ubuntu-server/`
Same setup as linux-server but on Ubuntu:
- **Ubuntu 24.04 LTS** (Noble Numbat)
- SSH server (port 22)
- nginx web server (port 80)
- Multiple users (admin, api, webuser)
- tmux, vim, git, curl
- Static website at `/var/www/testwebsite.com`

**Build:**
```bash
cd images/ubuntu-server
./build.sh
```

**Image name:** `ubuntu-server:latest`  
**Size:** ~400MB

## Creating a New Image

1. Create a new directory:
```bash
mkdir images/my-new-image
```

2. Create a `Dockerfile`:
```bash
touch images/my-new-image/Dockerfile
```

3. Create a `build.sh` script:
```bash
cat > images/my-new-image/build.sh << 'EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker build -f "$SCRIPT_DIR/Dockerfile" -t my-new-image:latest "$SCRIPT_DIR"
EOF
chmod +x images/my-new-image/build.sh
```

4. Build your image:
```bash
cd images/my-new-image
./build.sh
```

## Notes

- Each image should expose ports 22 (SSH) and 80 (HTTP) for compatibility with the spawner
- Images should accept `GAME_ID` environment variable
- Images should support dynamic user creation via the `USERS` environment variable (JSON)

