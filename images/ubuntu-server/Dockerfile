# Realistic Linux server container for training/simulation - Ubuntu 24.04
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

SHELL ["/bin/bash", "-c"]

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

COPY nginx/000-default.conf /etc/nginx/sites-available/000-default.conf
COPY nginx/testwebsite.conf /etc/nginx/sites-available/testwebsite.conf
COPY nginx/api.testwebsite.conf /etc/nginx/sites-available/api.testwebsite.conf

RUN ln -s /etc/nginx/sites-available/000-default.conf /etc/nginx/sites-enabled/ && \
    ln -s /etc/nginx/sites-available/testwebsite.conf /etc/nginx/sites-enabled/ && \
    ln -s /etc/nginx/sites-available/api.testwebsite.conf /etc/nginx/sites-enabled/

# ------------------------------------------------------------------------------
# systemctl shim (nginx only)
# ------------------------------------------------------------------------------
COPY scripts/systemctl /usr/local/bin/systemctl
RUN chmod +x /usr/local/bin/systemctl

# ------------------------------------------------------------------------------
# tmux config
# ------------------------------------------------------------------------------
COPY scripts/tmux.conf /root/.tmux.conf

# ------------------------------------------------------------------------------
# MOTD
# ------------------------------------------------------------------------------
RUN rm -f /etc/update-motd.d/* 2>/dev/null || true && \
    rm -f /etc/legal /etc/issue.net && \
    sed -i 's/^session\s\+optional\s\+pam_motd.so/#&/' /etc/pam.d/sshd
COPY scripts/motd /etc/motd

# ------------------------------------------------------------------------------
# Dynamic user creation script + startup script
# ------------------------------------------------------------------------------
WORKDIR /app

COPY scripts/create-users.sh /app/create-users.sh
COPY scripts/start.sh /app/start.sh
RUN chmod +x /app/create-users.sh /app/start.sh

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -sf http://localhost/ || exit 1

EXPOSE 22 80

CMD ["/bin/bash", "/app/start.sh"]
