# Deployment

Lapso is self-hosted at https://lapso.cloud.dirgosalga.com, served by a
single Docker image (`Dockerfile` at the repo root, built via
`.github/workflows/docker-publish.yml` and published to GitHub Container
Registry) behind the existing Traefik reverse proxy on `ds-hetz-bird-01`.
The image is the app *and* the web server together — no build step and no
app code on the host, just `docker compose pull`.

## Layout on the host

```
/home/ava/lapso/
  docker-compose.yml   # this directory's copy
```

`nginx.conf` no longer lives on the host — it's baked into the image at
build time (`Dockerfile` copies `deploy/nginx.conf` in). Changing routing/
caching rules means editing `deploy/nginx.conf` in the repo and letting the
next image build pick it up, not editing anything on the host.

The `lapso` container joins the `proxy` docker network that Traefik
already watches (`exposedByDefault: false`, so only labeled containers
are routed). Traefik issues its own Let's Encrypt cert for the host via
the `namecheap` DNS-01 resolver already configured for this Traefik
instance — no cert config needed here beyond the router labels.

## Publishing a new image

Pushing to `main` (or pushing a `vX.Y.Z` tag, or running the workflow
manually) builds the image and pushes it to
`ghcr.io/dirgosalga/lapso` with tags:

- `latest` — every push to `main`
- `X.Y.Z` — only when a matching `vX.Y.Z` git tag is pushed
- `sha-<short-sha>` — every build, for pinning/rollback

**One-time setup:** the first successful workflow run creates the GHCR
package as **private** by default. Go to the package's settings on GitHub
(`github.com/DirgoSalga/lapso` → Packages → `lapso` → Package settings) and
change visibility to **public** — the app has no secrets and this avoids
needing registry auth on the host. If it's kept private instead, the host
needs `docker login ghcr.io` with a PAT that has `read:packages`.

## Redeploying after a change

```bash
ssh ds-hetz-bird-01
cd /home/ava/lapso
docker compose pull
docker compose up -d
```

That's it — no rsync, no local build. If `docker-compose.yml` changes
(e.g. pinning a specific tag instead of `latest`), copy it up first:

```bash
scp deploy/docker-compose.yml ds-hetz-bird-01:/home/ava/lapso/docker-compose.yml
```

## Rolling back

Pull an older `sha-<short-sha>` or `X.Y.Z` tag instead of `latest`: edit
`image:` in `docker-compose.yml` on the host to that tag, then
`docker compose pull && docker compose up -d`.
