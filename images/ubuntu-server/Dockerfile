# Realistic Linux server container for training/simulation - Ubuntu 24.04
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------------------
# Base packages
# ------------------------------------------------------------------------------
RUN apt-get update && apt-get install -y \
    bash \
    vim \
    curl \
    git \
    tmux \
    openssh-server \
    sudo \
    nginx \
    jq \
    python3 \
    make \
    g++ \
    procps \
    rsync \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Node.js + PM2
# ------------------------------------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pm2

# ------------------------------------------------------------------------------
# SSH setup
# ------------------------------------------------------------------------------
RUN mkdir -p /var/run/sshd /root/.ssh && \
    chmod 700 /root/.ssh && \
    chmod 755 /var/run/sshd

RUN sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# ------------------------------------------------------------------------------
# System users
# ------------------------------------------------------------------------------
RUN useradd -m -s /bin/bash admin && \
    useradd -m -s /bin/bash api && \
    useradd -m -s /bin/bash webuser

RUN echo "admin:admin123" | chpasswd && \
    echo "api:api123" | chpasswd && \
    echo "webuser:web123" | chpasswd

RUN echo "admin ALL=(ALL) ALL" > /etc/sudoers.d/admin && \
    chmod 440 /etc/sudoers.d/admin

# ------------------------------------------------------------------------------
# Directories
# ------------------------------------------------------------------------------
RUN mkdir -p \
      /srv/apps/backend \
      /srv/apps/frontend \
      /var/www/testwebsite.com \
    && chown -R api:api /srv/apps/backend \
    && chown -R webuser:webuser /srv/apps/frontend /var/www/testwebsite.com

# ------------------------------------------------------------------------------
# Clone repos and pre-build at image build time
# This is the key change: all slow work happens here, not at container start.
# Rebuild the image when game repo content changes.
# ------------------------------------------------------------------------------
ARG FRONTEND_REPO=https://github.com/asanducristian/devops-game-frontend.git
ARG BACKEND_REPO=https://github.com/asanducristian/devops-game-backend.git

ENV FRONTEND_DIR=/srv/apps/frontend/repo
ENV BACKEND_DIR=/srv/apps/backend/repo

# Clone
RUN git clone --depth=1 $FRONTEND_REPO $FRONTEND_DIR && \
    chown -R webuser:webuser $FRONTEND_DIR

RUN git clone --depth=1 $BACKEND_REPO $BACKEND_DIR && \
    chown -R api:api $BACKEND_DIR

# Install frontend deps + build
RUN su -s /bin/bash webuser -c " \
    cd $FRONTEND_DIR && \
    npm config set fund false && \
    npm config set audit false && \
    npm ci && \
    npm run build \
"

# Deploy frontend dist -> web root
RUN rsync -a --delete $FRONTEND_DIR/dist/ /var/www/testwebsite.com/ && \
    chown -R webuser:webuser /var/www/testwebsite.com && \
    chmod -R a+rX /var/www/testwebsite.com

# Install backend deps (prod only)
RUN su -s /bin/bash api -c " \
    cd $BACKEND_DIR && \
    npm config set fund false && \
    npm config set audit false && \
    npm ci --omit=dev \
"

# ------------------------------------------------------------------------------
# nginx configuration
# ------------------------------------------------------------------------------
RUN rm -f /etc/nginx/sites-enabled/default

RUN cat > /etc/nginx/sites-available/000-default.conf << 'EOF'
server {
    listen 80 default_server;
    server_name _;
    location / {
        return 404 '{"error":"Domain not configured"}';
        add_header Content-Type application/json always;
    }
}
EOF

RUN cat > /etc/nginx/sites-available/testwebsite.conf << 'EOF'
server {
    listen 80;
    server_name testwebsite.com;
    root /var/www/testwebsite.com;
    index index.html;
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
EOF

RUN cat > /etc/nginx/sites-available/api.testwebsite.conf << 'EOF'
server {
    listen 80;
    server_name api.testwebsite.com;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

RUN ln -s /etc/nginx/sites-available/000-default.conf /etc/nginx/sites-enabled/ && \
    ln -s /etc/nginx/sites-available/testwebsite.conf /etc/nginx/sites-enabled/ && \
    ln -s /etc/nginx/sites-available/api.testwebsite.conf /etc/nginx/sites-enabled/

# ------------------------------------------------------------------------------
# systemctl shim (nginx only)
# ------------------------------------------------------------------------------
RUN cat > /usr/local/bin/systemctl << 'SCRIPT'
#!/bin/bash
set -euo pipefail
ACTION="${1:-}"; UNIT="${2:-}"
[[ -z "$ACTION" || -z "$UNIT" ]] && { echo "Usage: systemctl {start|stop|restart|reload|status} <unit>"; exit 1; }
case "$UNIT" in
  nginx|nginx.service) ;;
  *) echo "System has not been booted with systemd (PID 1). Can't operate."; exit 1 ;;
esac
is_running() { pgrep -x nginx >/dev/null 2>&1; }
case "$ACTION" in
  status)
    is_running \
      && echo "● nginx.service - Active: active (running)" \
      || echo "● nginx.service - Active: inactive (dead)" ;;
  start)   is_running || nginx ;;
  stop)    is_running && (nginx -s quit || pkill -x nginx) || true ;;
  reload)  nginx -t && nginx -s reload ;;
  restart) nginx -t; is_running && (nginx -s quit || pkill -x nginx) && sleep 0.5; nginx ;;
  *)       echo "Unknown action: $ACTION"; exit 1 ;;
esac
SCRIPT
RUN chmod +x /usr/local/bin/systemctl

# ------------------------------------------------------------------------------
# tmux config
# ------------------------------------------------------------------------------
RUN cat > /root/.tmux.conf << 'EOF'
set -g mouse on
set -g default-terminal "screen-256color"
EOF

# ------------------------------------------------------------------------------
# MOTD
# ------------------------------------------------------------------------------
RUN rm -f /etc/update-motd.d/* 2>/dev/null || true && \
    rm -f /etc/legal /etc/issue.net && \
    sed -i 's/^session\s\+optional\s\+pam_motd.so/#&/' /etc/pam.d/sshd

RUN cat > /etc/motd << 'EOF'
================================================================================
  DevOps Training Environment - Ubuntu 24.04 LTS
================================================================================

Services:   SSH :22  |  nginx :80
Website:    testwebsite.com        (/var/www/testwebsite.com)
API:        api.testwebsite.com    (proxy -> localhost:3001)

Users:
  admin   (sudo)          password: admin123
  api     (PM2 / backend) password: api123
  webuser (web root)      password: web123

================================================================================
EOF

# ------------------------------------------------------------------------------
# Dynamic user creation script (runs at container start from USERS env var)
# ------------------------------------------------------------------------------
WORKDIR /app

RUN cat > /app/create-users.sh << 'EOF'
#!/bin/bash
set -euo pipefail
[ -z "${USERS:-}" ] && exit 0
echo "$USERS" | jq -c '.[]' | while read -r user; do
  username=$(echo "$user" | jq -r '.username')
  password=$(echo "$user" | jq -r '.password')
  is_sudoer=$(echo "$user" | jq -r '.isSudoer')
  id "$username" >/dev/null 2>&1 || useradd -m -s /bin/bash "$username"
  echo "$username:$password" | chpasswd
  usermod -U "$username" 2>/dev/null || true
  mkdir -p "/home/$username/.ssh"
  chown "$username:$username" "/home/$username/.ssh"
  chmod 700 "/home/$username/.ssh"
  if [ "$is_sudoer" = "true" ]; then
    echo "$username ALL=(ALL) ALL" > "/etc/sudoers.d/$username"
    chmod 440 "/etc/sudoers.d/$username"
    echo "Created sudoer: $username"
  else
    echo "Created user: $username"
  fi
done
EOF

RUN chmod +x /app/create-users.sh

# ------------------------------------------------------------------------------
# Startup script — only starts services, no cloning or building
# ------------------------------------------------------------------------------
RUN cat > /app/start.sh << 'EOF'
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
EOF

RUN chmod +x /app/start.sh

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -sf http://localhost/ || exit 1

EXPOSE 22 80

CMD ["/bin/bash", "/app/start.sh"]
