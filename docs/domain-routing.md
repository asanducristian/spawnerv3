# Domain Routing

How external traffic reaches the right container via `*.nuazi.ro`.

---

## Concept

Each domain configured inside a container's nginx (e.g. `testwebsite.com`) gets a public URL by replacing dots with dashes:

```
testwebsite.com       →  testwebsite-com.nuazi.ro
api.testwebsite.com   →  api-testwebsite-com.nuazi.ro
```

---

## Full request flow

```
Browser visits testwebsite-com.nuazi.ro
  ↓
DNS wildcard *.nuazi.ro → host machine IP
  ↓
nginx (port 443, SSL)
  proxy_pass http://127.0.0.1:3002
  ↓
Spawner container proxy (port 3002)
  reads Host header → extracts subdomain "testwebsite-com"
  queries domain_routes by subdomain_key → gets virtual IP 10.0.42.17
  queries container_mappings → gets host:httpPort
  proxies request, rewrites Host: testwebsite.com
  ↓
Container nginx
  sees Host: testwebsite.com → serves correct virtual host
```

---

## Registering a domain

After starting a container, call the spawner API to register the mapping:

```bash
curl -X POST https://spawner-host:3001/domains \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"domain":"testwebsite.com","virtualIp":"10.0.42.17","gameId":"game-123"}'
```

Response:
```json
{
  "domain": "testwebsite.com",
  "subdomainKey": "testwebsite-com",
  "externalUrl": "http://testwebsite-com.nuazi.ro",
  "virtualIp": "10.0.42.17"
}
```

---

## Subdomain encoding

`domain.replace(/\./g, '-')` — dots become dashes.

Known limitation: `my-site.com` and `my.site.com` produce the same key (`my-site-com`). Acceptable for game-controlled domains where names are simple.

---

## Gameplay use

- Container starts with `testwebsite.com` pre-configured in nginx
- Players can configure additional nginx virtual hosts as part of gameplay
- Frontend calls `POST /domains` to register each new domain externally
- Domain routes are cleaned up with `DELETE /domains/:domain` or bulk-removed by `game_id` when a game ends

---

## nginx config on server

The server at `sandu@ManagerServer` has `/etc/nginx/sites-available/wildcard.nuazi.ro`:
- HTTP → HTTPS redirect for `*.nuazi.ro`
- HTTPS with Let's Encrypt cert at `/etc/letsencrypt/live/nuazi.ro/`
- **`proxy_pass` must point to `http://127.0.0.1:3002`** (the spawner proxy port)
