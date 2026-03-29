# Realistic Linux server container for training/simulation
FROM node:20-alpine

# Install essential packages
RUN apk add --no-cache \
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
    g++

# Setup SSH
RUN ssh-keygen -A && \
    mkdir -p /var/run/sshd /root/.ssh && \
    chmod 700 /root/.ssh && \
    chmod 755 /var/run/sshd

# Create system users
RUN adduser -D -s /bin/bash admin && \
    adduser -D -s /bin/bash api && \
    adduser -D -s /bin/bash webuser

# Set passwords (training / simulation only)
RUN echo "admin:admin123" | chpasswd && \
    echo "api:api123" | chpasswd && \
    echo "webuser:web123" | chpasswd

# Unlock accounts
RUN passwd -u admin 2>/dev/null || true && \
    passwd -u api 2>/dev/null || true && \
    passwd -u webuser 2>/dev/null || true

# Sudo for admin only
RUN echo "admin ALL=(ALL) ALL" > /etc/sudoers.d/admin && \
    chmod 440 /etc/sudoers.d/admin

# Configure SSH (disable root, enable password auth)
RUN sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# Install PM2 globally
RUN npm install -g pm2

# Setup /var/www directory
RUN mkdir -p /var/www && \
    chown -R webuser:webuser /var/www

# Copy projects from projects directory (build context is workspace root)
COPY --chown=webuser:webuser projects/testwebsite.com /var/www/testwebsite.com
COPY --chown=api:api projects/health-api /home/api/health-api

# Install health-api dependencies
RUN cd /home/api/health-api && npm install --production

# Configure nginx
# Remove default site
RUN rm -f /etc/nginx/http.d/default.conf

# Create testwebsite.com server block (static site)
RUN cat > /etc/nginx/http.d/testwebsite.conf << 'EOF'
server {
    listen 80;
    server_name testwebsite.com;

    root /var/www/testwebsite.com;
    index index.html;

    # Serve static files
    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/testwebsite.access.log;
    error_log /var/log/nginx/testwebsite.error.log;
}
EOF

# Create api.testwebsite.com server block (proxy ALL traffic to Node.js)
RUN cat > /etc/nginx/http.d/api.testwebsite.conf << 'EOF'
server {
    listen 80;
    server_name api.testwebsite.com;

    # Proxy ALL requests to Node.js API on port 3001
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
    }

    # Logging
    access_log /var/log/nginx/api.access.log;
    error_log /var/log/nginx/api.error.log;
}
EOF

# Create nginx log directory and set permissions
RUN mkdir -p /var/log/nginx && \
    chown -R nginx:nginx /var/log/nginx

# Configure tmux (available but not started automatically)
RUN cat > /root/.tmux.conf << 'EOF'
set -g mouse on
set -g default-terminal "screen-256color"
EOF

# Customize MOTD (Message of the Day)
# Remove default Alpine MOTD
RUN rm -f /etc/motd /etc/motd.d/* 2>/dev/null || true

# Create custom MOTD
RUN cat > /etc/motd << 'EOF'
================================================================================
  DevOps Training Environment
================================================================================

ASDDASDSAWelcome to your Linux server container!

Services:
  - SSH (port 22)
  - nginx (port 80)
  - Website: testwebsite.com
  - Web root: /var/www/testwebsite.com

Available users:
  - admin (sudo access)
  - api (service user)
  - webuser (web owner)

================================================================================
EOF

# Ensure it's used
RUN chmod 644 /etc/motd

# Create app directory
WORKDIR /app

# Create user creation script for dynamic users
RUN cat > /app/create-users.sh << 'EOF'
#!/bin/bash

# Parse USERS JSON and create users
if [ -n "$USERS" ]; then
    echo "Creating additional users from configuration..."
    
    # Parse JSON and create users
    echo "$USERS" | jq -c '.[]' | while read -r user; do
        username=$(echo "$user" | jq -r '.username')
        password=$(echo "$user" | jq -r '.password')
        is_sudoer=$(echo "$user" | jq -r '.isSudoer')
        
        # Create user with home directory
        if ! id "$username" 2>/dev/null; then
            adduser -D -s /bin/bash "$username"
        fi
        
        # Set password (unlock the account)
        echo "$username:$password" | chpasswd
        passwd -u "$username" 2>/dev/null || true
        
        # Create .ssh directory
        mkdir -p "/home/$username/.ssh"
        chown "$username:$username" "/home/$username/.ssh"
        chmod 700 "/home/$username/.ssh"
        
        # Add to sudoers if needed
        if [ "$is_sudoer" = "true" ]; then
            echo "$username ALL=(ALL) ALL" > "/etc/sudoers.d/$username"
            chmod 440 "/etc/sudoers.d/$username"
            echo "  ✅ Created user: $username (SUDOER)"
        else
            echo "  ✅ Created user: $username"
        fi
    done
    
    echo "All users created successfully!"
else
    echo "No custom users specified"
fi
EOF

RUN chmod +x /app/create-users.sh

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash

echo "Starting simulated Linux server..."
echo ""

# Create custom users if USERS env var is set
/app/create-users.sh
echo ""

# Start SSH
/usr/sbin/sshd
echo "✅ SSH server started on port 22"

# Start health API with PM2 (as api user)
cd /home/api/health-api
su -s /bin/bash api -c "pm2 start ecosystem.config.js"
echo "✅ Health API started on port 3001 (PM2)"

# Start nginx
nginx
echo "✅ nginx started on port 80"

echo ""
echo "Services running:"
echo " - SSH on port 22"
echo " - nginx on port 80"
echo " - Health API on port 3001 (PM2)"
echo " - Website: testwebsite.com"
echo " - Web root: /var/www/testwebsite.com"
echo ""
echo "Default users:"
echo " - admin (sudo) - password: admin123"
echo " - api (service user, runs PM2) - password: api123"
echo " - webuser (web owner) - password: web123"
echo ""
echo "Container ready for SSH access."

# Keep container alive
tail -f /dev/null
EOF

RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 22 80

# Run the startup script
CMD ["/bin/bash", "/app/start.sh"]
