# Deployment

Lapso is self-hosted at https://lapso.cloud.dirgosalga.com, served by
`nginx:alpine` behind the existing Traefik reverse proxy on
`ds-hetz-bird-01`. There is no server-side logic and no build step runs
on the host — this is a static export, built locally and synced over.

## Layout on the host

```
/home/ava/lapso/
  docker-compose.yml   # this directory's copy
  nginx.conf           # this directory's copy
  dist/                # synced build output (not version controlled there)
```

The `lapso` container joins the `proxy` docker network that Traefik
already watches (`exposedByDefault: false`, so only labeled containers
are routed). Traefik issues its own Let's Encrypt cert for the host via
the `namecheap` DNS-01 resolver already configured for this Traefik
instance — no cert config needed here beyond the router labels.

## Redeploying after a change

```bash
npm run build
rsync -az --delete dist/ ava@ds-hetz-bird-01:/home/ava/lapso/dist/
```

That's it — nginx serves the new files immediately, no restart needed.
If `docker-compose.yml` or `nginx.conf` change, also copy those up and
run `docker compose up -d` again on the host.

## Gotcha: file permissions

Files created by some editors/tools land as `0600` (owner-only) locally.
Vite's `public/` copy step preserves source file permissions verbatim
into `dist/`, and nginx runs as a non-owner user inside the container --
an unreadable file there is a silent `403`, not a build error. If a
freshly built asset 404s/403s in production but works locally, check:

```bash
find dist -not -perm -044
```

A normal `git clone` will not reproduce this (git doesn't store full
permission bits), so it's only ever a local-working-tree issue.
