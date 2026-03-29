# Spawner Service

**Location:** `spawner/`
**Stack:** TypeScript, Fastify v5, Knex, MariaDB, Dockerode, ssh2, http-proxy

---

## What it does

- Starts/stops Docker containers with resource limits (128MB RAM, 0.1 CPU, 64 PIDs)
- Assigns each container a virtual IP (`10.0.x.x`), persisted in MariaDB
- WebSocket SSH terminal proxy — frontend connects to `/terminal?ip=&username=&password=`
- HTTP proxy server (port 3002) — routes `*.nuazi.ro` traffic to the right container
- Domain routing API — maps `testwebsite.com` → container → `testwebsite-com.nuazi.ro`

---

## File structure

```
spawner/
├── src/
│   ├── server.ts           — entry point, wires everything
│   ├── types.ts            — shared interfaces
│   ├── db.ts               — Knex/MariaDB instance
│   ├── container-store.ts  — DB-backed virtual IP store
│   ├── domain-store.ts     — DB-backed domain → virtualIP store
│   ├── docker.ts           — DockerManager (start/stop/status)
│   ├── terminal.ts         — WebSocket SSH proxy
│   ├── container-proxy.ts  — HTTP proxy server on port 3002
│   └── routes/
│       ├── containers.ts   — container lifecycle endpoints
│       └── domains.ts      — domain routing endpoints
├── migrations/
│   ├── 20240101000000_create_container_mappings.ts
│   └── 20240102000000_create_domain_routes.ts
├── images/
│   └── ubuntu-server/      — game container Dockerfile + build.sh
├── nginx/
│   └── nuazi.ro.conf       — reference nginx config
├── knexfile.ts
├── .env.example
└── .gitignore
```

---

## DB tables

**`container_mappings`**
| Column | Description |
|--------|-------------|
| container_id | Docker container ID |
| virtual_ip | Assigned virtual IP (10.0.x.x) |
| host | Public IP of the spawner machine |
| ssh_port | Host port mapped to container port 22 |
| http_port | Host port mapped to container port 80 |
| game_id | Game session ID |

**`domain_routes`**
| Column | Description |
|--------|-------------|
| domain | Original domain, e.g. `testwebsite.com` |
| subdomain_key | Encoded key, e.g. `testwebsite-com` |
| virtual_ip | Points to a container_mappings virtual IP |
| game_id | Game session ID |

---

## Ports

| Port | Purpose |
|------|---------|
| 3001 | API server (Fastify) — authenticated with `X-API-Key` header |
| 3002 | Container HTTP proxy — receives traffic forwarded by nginx |

---

## API endpoints

### Containers
- `POST /containers/start` — start a game container
- `POST /containers/stop` — stop a container
- `GET /containers/:id/status` — check if running
- `GET /containers` — list all active mappings

### Domains
- `POST /domains` — register `{ domain, virtualIp, gameId? }`
- `DELETE /domains/:domain` — remove a domain route
- `GET /domains?gameId=` — list all routes
- `GET /domains/resolve/:subdomain` — debug: what does a subdomain point to
- `GET /domains/preview/:domain` — preview the subdomain key before registering

### Other
- `GET /health` — health check (no auth)
- `WS /terminal?ip=&username=&password=` — SSH terminal proxy (no auth)
- `GET /docs` — Swagger UI (no auth)

---

## Auth

All API routes require `X-API-Key` header. Value comes from `API_KEY` env var.
Unauthenticated routes: `/health`, `/terminal`, `/docs`

---

## Running

```bash
cd spawner
cp .env.example .env   # fill in API_KEY, WORKER_PUBLIC_IP, DB_PASSWORD
npm install
npm run migrate        # runs automatically on dev start too
npm run dev
```

Swagger UI: http://localhost:3001/docs

---

## Game container image

The `ubuntu-server:latest` image is the environment players work in.

**Key design decision:** all slow work (git clone, npm install, frontend build) happens at `docker build` time, not at container start. Containers boot in ~5 seconds.

```bash
cd spawner/images/ubuntu-server
bash build.sh                  # normal build (uses layer cache)
bash build.sh --no-cache       # force re-clone repos + rebuild frontend
```

**What's inside the container:**
- Ubuntu 24.04, nginx, SSH, Node.js 20, PM2
- Users: `admin` (sudo), `api` (runs backend via PM2), `webuser` (web root)
- nginx virtual hosts: `testwebsite.com`, `api.testwebsite.com`
- `systemctl` shim supporting nginx start/stop/restart/reload
- Dynamic user creation via `USERS` env var (JSON array passed by spawner)

**Allowed images:** `game-runtime:latest`, `ubuntu-server:latest`

---

## On startup behaviour

1. Runs Knex migrations automatically
2. Reconciles stale container mappings — checks each DB entry against Docker, removes dead ones
3. Starts API server on port 3001
4. Starts proxy server on port 3002
