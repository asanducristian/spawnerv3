# DevOps Game — Project Overview

A multiplayer DevOps training game with 3 planned game modes:

1. **Story mode** — solo narrative-driven DevOps challenges
2. **Machines to fix** — player gets a broken server to repair
3. **Among Us style** — multiplayer; some players are devops engineers keeping systems up, some are impostors sabotaging

For all game modes, each player gets a **Docker container** spawned as their "production environment" to work in.

---

## Services

All services live in this repo:

| Folder | Status | Description |
|--------|--------|-------------|
| `spawner/` | ✅ Active | New rewritten container spawner (TypeScript/Fastify v5/MariaDB) |
| `backendV2/` | 🔄 To rewrite | User auth, game lifecycle (JS/Fastify v5/MySQL) |
| `frontendV2/` | 🔄 To rewrite | React desktop-metaphor UI |
| `containerspawner/` | ❌ Old | Original spawner, replaced by `spawner/` |

---

## What's been built

- `spawner/` fully rewritten from scratch — see [spawner.md](./spawner.md)
- Domain routing via `*.nuazi.ro` — see [domain-routing.md](./domain-routing.md)
- Infrastructure / server setup — see [infrastructure.md](./infrastructure.md)

## What's next

- Backend rewrite: TypeScript, Fastify v5, proper game state machine, BullMQ for game health check polling
- Frontend rewrite: keep desktop shell UI, replace context+reducer with Zustand, proper error boundaries
