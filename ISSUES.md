# Lapso — Open Issues & Feature Requests

Tracks feature requests and open issues that aren't yet part of `SPEC.md` / `PLAN.md`. Once a request is scoped and scheduled, move it into `PLAN.md` as a phase/task and mark it done here (or remove it).

Status legend: `open` (not started) · `in progress` · `done`

---

## Epics

### A. Self-contained Docker image, published via GitHub → pull-to-deploy

**Status:** merged to `main` in `v1.0.0` (`feature/docker-publish`) — see "Not yet done" below, still pending a real GitHub Actions run and the host cutover
**Requested by:** Diego, 2026-08-23

Package the app and the web server together as a single Docker image, built and published from GitHub, so redeploying is `docker compose pull && docker compose up -d` on the host instead of the current local-build-and-`rsync` flow (see `deploy/README.md`). Also sets up a natural place to later attach a database/backend service alongside the app container.

**Current state (baseline this epic changes):** no `Dockerfile` in the repo yet; `deploy/docker-compose.yml` runs stock `nginx:alpine` and bind-mounts a locally-built `dist/` and `deploy/nginx.conf` from the host — the image itself has no app code baked in, and there's no GitHub Actions workflow or container registry involved today. No git remote is configured on this local repo yet either, so pushing to GitHub is itself a prerequisite step, not assumed.

**Sub-tasks:**

- [x] Push this repo to a GitHub remote — done earlier this session (`git@github.com:DirgoSalga/lapso.git`).
- [x] Write a multi-stage `Dockerfile`: `node:22-alpine` build stage (`npm ci && npm run build`), `nginx:alpine` runtime stage that `COPY`s `dist/` and `deploy/nginx.conf` in — no host bind-mounts for app content. Added `.dockerignore` alongside it.
- [x] GitHub Actions workflow (`.github/workflows/docker-publish.yml`): builds on push to `main`, on `vX.Y.Z` tags, and manually (`workflow_dispatch`); pushes to `ghcr.io/dirgosalga/lapso` tagged `latest` (on `main`), `X.Y.Z` (on a matching git tag), and `sha-<short-sha>` (always, for rollback).
- [x] Decided: GHCR package made **public** (no secrets in a static fasting timer, avoids needing a PAT on the host). **Manual one-time step still needed:** the first workflow run creates the package as private by default — flip it to public in the GitHub package settings (documented in `deploy/README.md`); no `gh` CLI available in this session to do it automatically.
- [x] Updated `deploy/docker-compose.yml` to `image: ghcr.io/dirgosalga/lapso:latest`, dropped the `volumes:` bind mounts; Traefik labels untouched.
- [x] Rewrote `deploy/README.md`: new layout (no `nginx.conf` on the host anymore), publish/tagging docs, `docker compose pull && docker compose up -d` redeploy steps, and a rollback recipe (pin an older `sha-`/`X.Y.Z` tag).
- [x] Out of scope for now, kept the door open: no database/backend service added; `docker-compose.yml` still supports adding a second service on the same `proxy` network later without restructuring.

**Not yet done / needs the user or a real GitHub Actions run:**
- The workflow itself has not run yet — pushing `main` to GitHub is the next step, right after this merge. The `Dockerfile` has not been build-tested anywhere yet (local Docker daemon needs `sudo`, which needs an interactive password this session couldn't supply).
- The manual "make the GHCR package public" step above.
- The host (`ds-hetz-bird-01`) still runs the old bind-mounted `nginx:alpine` container from `deploy/docker-compose.yml` — switching it over means copying the new compose file up and running `docker compose pull && docker compose up -d` there (see `deploy/README.md`).

---

## Features

### 1. Show projected completion time

**Status:** done — merged to `main` in `v0.2.0` (`feature/completion-time`)
**Requested by:** Diego, 2026-08-23

Show the clock time the fast will complete (i.e. `startedAt`/entry time + goal duration), not just the elapsed duration.

- Display during duration entry, as the goal duration is being chosen (before the fast starts).
- Display during an active fast, near the top, next to/near the "fasting since HH:MM" eyebrow (see `SPEC.md` §5.4 layout).
- Needs to recompute if the goal duration is changed mid-fast (Settings) — should stay derived, not stored, per the spec's one invariant (`SPEC.md` §1: persist only `startedAt`).
- Implemented: `completesAt()` in `src/core/clock.ts`; wired into the idle duration-entry form ("Done around HH:MM") and the active-fast eyebrow ("fasting since HH:MM · done HH:MM") in `src/ui/Timer.tsx`.

### 2. Tap elapsed time to toggle to remaining time

**Status:** done — merged to `main` in `v0.3.0` (`feature/tap-remaining-time`)
**Requested by:** Diego, 2026-08-23

During an active fast, tapping/clicking the big timer readout (currently elapsed time, e.g. `14:22:07`) toggles it to show remaining time until goal instead (and back on a second tap).

- Applies to the main timer numerals inside the ring (`SPEC.md` §5.4 layout, §5.5 ring).
- Consider whether the toggle state should persist across reloads/sessions or always reset to "elapsed" — decided: does not persist. Resets to elapsed whenever a fast starts or ends (in-memory React state only, nothing written to storage).
- Does not affect the ring's progress arc or overtime ring, only the numeral readout.
- Implemented: `.readout-time` is now a real `<button>` (was a `<div>`) for tap/click + keyboard access, with an `aria-label` announcing which mode is showing. Remaining time is `max(0, goalMs - elapsedMs)`, clamped at zero past goal (same clamp `formatElapsedClock`/`formatDuration` already use elsewhere).
