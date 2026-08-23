# Lapso — Open Issues & Feature Requests

Tracks feature requests and open issues that aren't yet part of `SPEC.md` / `PLAN.md`. Once a request is scoped and scheduled, move it into `PLAN.md` as a phase/task and mark it done here (or remove it).

Status legend: `open` (not started) · `in progress` · `done`

---

## Epics

### A. Self-contained Docker image, published via GitHub → pull-to-deploy

**Status:** open
**Requested by:** Diego, 2026-08-23

Package the app and the web server together as a single Docker image, built and published from GitHub, so redeploying is `docker compose pull && docker compose up -d` on the host instead of the current local-build-and-`rsync` flow (see `deploy/README.md`). Also sets up a natural place to later attach a database/backend service alongside the app container.

**Current state (baseline this epic changes):** no `Dockerfile` in the repo yet; `deploy/docker-compose.yml` runs stock `nginx:alpine` and bind-mounts a locally-built `dist/` and `deploy/nginx.conf` from the host — the image itself has no app code baked in, and there's no GitHub Actions workflow or container registry involved today. No git remote is configured on this local repo yet either, so pushing to GitHub is itself a prerequisite step, not assumed.

**Sub-tasks:**

- [ ] Push this repo to a GitHub remote (none configured locally yet).
- [ ] Write a multi-stage `Dockerfile`: a Node build stage (`npm ci && npm run build`) producing `dist/`, then a runtime stage (`nginx:alpine` or similar) that `COPY`s `dist/` in and bakes in `deploy/nginx.conf` — no host bind-mounts for app content.
- [ ] GitHub Actions workflow: build the image on push to `main`/on tag, push to GitHub Container Registry (`ghcr.io/<owner>/lapso`). Decide tagging scheme (`:latest`, semver, and/or git-sha) and whether a rollback just means pulling an older tag.
- [ ] Decide image visibility (public vs. private on GHCR) and registry auth on the host (`docker login ghcr.io` with a PAT, or public image needing no auth).
- [ ] Update `deploy/docker-compose.yml` to reference `ghcr.io/<owner>/lapso:<tag>` instead of `nginx:alpine` + volume mounts; keep the existing Traefik labels as-is.
- [ ] Update `deploy/README.md` to replace the `npm run build` + `rsync` redeploy steps with `docker compose pull && docker compose up -d`.
- [ ] Out of scope for now, but keep the door open: no database/backend service yet — just don't design the image/compose file in a way that would block bolting one on later (e.g. a second service in the same `docker-compose.yml`, sharing the `proxy` network).

---

## Features

### 1. Show projected completion time

**Status:** in progress — branch `feature/completion-time`, targeting `v0.2.0`
**Requested by:** Diego, 2026-08-23

Show the clock time the fast will complete (i.e. `startedAt`/entry time + goal duration), not just the elapsed duration.

- Display during duration entry, as the goal duration is being chosen (before the fast starts).
- Display during an active fast, near the top, next to/near the "fasting since HH:MM" eyebrow (see `SPEC.md` §5.4 layout).
- Needs to recompute if the goal duration is changed mid-fast (Settings) — should stay derived, not stored, per the spec's one invariant (`SPEC.md` §1: persist only `startedAt`).
- Implemented: `completesAt()` in `src/core/clock.ts`; wired into the idle duration-entry form ("Done around HH:MM") and the active-fast eyebrow ("fasting since HH:MM · done HH:MM") in `src/ui/Timer.tsx`.

### 2. Tap elapsed time to toggle to remaining time

**Status:** open
**Requested by:** Diego, 2026-08-23

During an active fast, tapping/clicking the big timer readout (currently elapsed time, e.g. `14:22:07`) toggles it to show remaining time until goal instead (and back on a second tap).

- Applies to the main timer numerals inside the ring (`SPEC.md` §5.4 layout, §5.5 ring).
- Consider whether the toggle state should persist across reloads/sessions or always reset to "elapsed" — open question, not yet decided.
- Should not affect the ring's progress arc or overtime ring, only the numeral readout.
