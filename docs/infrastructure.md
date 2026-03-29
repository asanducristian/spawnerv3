# Infrastructure

---

## Server

- **Host:** `sandu@ManagerServer` (Linux)
- **DNS:** `*.nuazi.ro` wildcard A record → host machine public IP

---

## nginx

Config at `/etc/nginx/sites-available/wildcard.nuazi.ro`:

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name *.nuazi.ro;
    return 301 https://$host$request_uri;
}

# HTTPS wildcard proxy
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name *.nuazi.ro;

    ssl_certificate     /etc/letsencrypt/live/nuazi.ro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nuazi.ro/privkey.pem;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3002;   # spawner container proxy
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }
}
```

---

## MariaDB

```sql
-- Create DB and user (run as root)
CREATE DATABASE spawner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spawner'@'%' IDENTIFIED BY '<password>';
CREATE USER 'spawner'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON spawner.* TO 'spawner'@'%';
GRANT ALL PRIVILEGES ON spawner.* TO 'spawner'@'localhost';
FLUSH PRIVILEGES;
```

Password stored in `spawner/.env` — never committed.

---

## Spawner .env

```
PORT=3001
HOST=0.0.0.0
WORKER_PUBLIC_IP=<host machine public IP>
API_KEY=<strong random key>
PROXY_PORT=3002
BASE_DOMAIN=nuazi.ro
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=spawner
DB_PASSWORD=<password>
DB_NAME=spawner
```

---

## Port summary

| Port | Service | Exposed |
|------|---------|---------|
| 3001 | Spawner API | Internal (or behind auth proxy) |
| 3002 | Spawner container proxy | Internal — nginx proxies to it |
| 22 | Container SSH | Random ephemeral host port per container |
| 80 | Container HTTP | Random ephemeral host port per container |
