# Lapso: Build Specification

**Lapso** (Spanish, "a span of time"). Package name `lapso`, display name `Lapso` in the manifest, cache prefix `lapso-shell-v1`.

A single-page, offline-capable web app that tracks one fasting interval at a time, visualises progress toward a user-defined goal, keeps a history, and sends milestone notifications. No backend, no accounts, no analytics.

Read this whole document before writing code. Sections 1 to 4 define behaviour, 5 defines the look, 6 to 9 define the hard parts, 10 defines "done".

---

## 1. Core principle

**Never persist elapsed time. Persist the start timestamp only.**

Everything else is derived on each render from `Date.now() - startedAt`. This single decision makes refreshes, closed tabs, device sleep, timezone travel and daylight saving transitions correct for free, because epoch milliseconds are location independent and monotonic in practice.

Any code that increments a counter is a bug. Any code that stores `elapsedMs` is a bug.

---

## 2. Stack and constraints

| Choice | Value |
| --- | --- |
| Build tool | Vite |
| Language | TypeScript, strict mode |
| Framework | React 18 (optional but recommended for the settings and history views) |
| Styling | Plain CSS with custom properties. No Tailwind, no CSS-in-JS. |
| Persistence | `localStorage`, schema versioned |
| Charts | Hand-rolled SVG. Do not add a charting library. |
| Dependencies | Keep the runtime dependency count at or below three. |
| Hosting target | Static bundle. Azure Static Web Apps, Cloudflare Pages or GitHub Pages all work unchanged. |
| Browser support | Evergreen Chrome, Edge, Firefox, Safari 16.4 and later. |

The app must fully function with the network unavailable after first load.

---

## 3. Data model

### 3.1 Types

```ts
type Phase = 'idle' | 'fasting' | 'goal-reached' | 'overtime';

interface ActiveFast {
  id: string;              // crypto.randomUUID()
  startedAt: number;       // epoch ms
  goalHours: number;       // e.g. 16
  firedMilestones: string[]; // 'p50' | 'p90' | 'goal' | 'ot1' | 'ot2' ...
}

interface CompletedFast {
  id: string;
  startedAt: number;
  endedAt: number;
  goalHours: number;
  note?: string;
}

interface Settings {
  schemaVersion: number;        // starts at 1
  defaultGoalHours: number;     // default 16
  milestonePercents: number[];  // default [50, 90], user editable, values 1 to 99
  notificationsEnabled: boolean;
  overtimeNotifyHours: number;  // default 1, notify each N hours past goal, max 3 times
  theme: 'auto' | 'day' | 'night';
  reduceMotion: 'auto' | 'always';
}
```

### 3.2 Storage keys

- `fast.active` : `ActiveFast | null`
- `fast.history` : `CompletedFast[]`, newest last
- `fast.settings` : `Settings`

### 3.3 Rules

1. Wrap every read in `try/catch` and JSON-parse defensively. Corrupt data must never white-screen the app. On parse failure, quarantine the raw string under `fast.corrupt.<timestamp>` and continue with defaults.
2. Write a `migrate(settings)` function keyed on `schemaVersion` from day one, even though version 1 is the only version. It will be needed.
3. Listen for the `storage` window event so two open tabs stay consistent. When another tab starts or ends a fast, this tab reflects it without a reload.
4. Ship **Export data** and **Import data** buttons that read and write the three keys as one JSON file. This is not a nice-to-have. Safari's storage policy can evict `localStorage` after roughly seven days without site interaction, and a browser data clear takes the history silently. Show a one-time dismissible note explaining this in Settings.
5. IndexedDB is unnecessary below a few thousand history entries. Do not use it.

---

## 4. Derived state and the clock

One pure module, `src/core/clock.ts`, exports a single function. Nothing else in the app is allowed to compute progress.

```ts
interface Derived {
  now: number;
  elapsedMs: number;
  goalMs: number;
  progress: number;       // 0 to 1, clamped, relative to goal
  phase: Phase;
  overtimeMs: number;     // 0 before goal
  overtimeHours: number;
  lapIndex: number;       // floor(overtimeHours)
  lapProgress: number;    // overtimeHours % 1
  intensity: number;      // 0 to 1, see 4.2
  dueMilestones: string[];// passed but not yet in firedMilestones
}
```

### 4.1 Render loop

- Drive the ring with `requestAnimationFrame`, recomputing from `Date.now()` on every frame. Never accumulate deltas.
- Drive the text readout with a separate `setInterval` at 1000 ms to avoid rebuilding strings 60 times a second.
- Listen for `visibilitychange` and force an immediate recompute on return, because background tabs are throttled hard and the ring will otherwise animate from a stale position.
- Stop the rAF loop entirely while `document.hidden` is true.

### 4.2 Intensity, and why it is capped

```ts
const INTENSITY_CAP_HOURS = 2;
intensity = Math.min(overtimeHours, INTENSITY_CAP_HOURS) / INTENSITY_CAP_HOURS;
```

All beyond-goal visual escalation is a function of `intensity` and therefore plateaus two hours past the goal. This is a deliberate product requirement, not a performance shortcut. See section 9.

---

## 5. Visual design

### 5.1 Direction

The subject is a kiln, not a video game. A kiln is cold graphite, comes up to temperature slowly, glows, and then **holds** temperature. It does not escalate forever and it does not celebrate with confetti. Every visual decision below follows from that image, including the fact that the reward for going long is a steady, calm glow rather than an increasingly loud one.

Reject: dark background with one acid accent, confetti bursts, trophy iconography, flame emoji.

### 5.2 Tokens

Surfaces heat up along with the ring. The page background interpolates as `progress` rises, so the whole screen, not just the meter, registers the state.

```css
:root {
  --porcelain: #E9EDF0;  /* cold surface, faintly blue */
  --bisque:    #F0E3D2;  /* surface at goal */
  --graphite:  #2A2E35;  /* primary text, cold ring */
  --slate:     #6B7785;  /* secondary text, ring track */
  --glow:      #F2A03D;  /* mid heat */
  --ember:     #BF4A17;  /* at and beyond goal */
}
```

Night theme inverts surfaces to `#181B20` and `#241D18` and keeps the same heat ramp.

Interpolate the ring stroke in OKLCH, not sRGB, or the midpoint turns muddy:

- cold `oklch(0.55 0.03 250)`
- mid `oklch(0.78 0.15 70)`
- goal `oklch(0.58 0.17 42)`

### 5.3 Type

| Role | Face | Notes |
| --- | --- | --- |
| Timer numerals | Fraunces (variable) | Enable `font-variant-numeric: tabular-nums`. If the loaded face lacks `tnum`, render each digit in a fixed-width span instead, or the layout will jitter every second. |
| UI and body | IBM Plex Sans | Sentence case throughout. |
| Timestamps, data | IBM Plex Mono | Small, `--slate`. |

**Signature element.** Fraunces exposes `wght`, `opsz` and `SOFT` variable axes. Map them to progress:

```css
.timer {
  font-variation-settings:
    'wght' calc(300 + 400 * var(--p)),
    'SOFT' calc(0 + 100 * var(--p)),
    'opsz' calc(24 + 120 * var(--p));
}
```

The numerals themselves thicken and soften as the fast progresses. This is the one bold move in the design. Everything else stays quiet so that it lands. Under reduced motion, snap the axes to three fixed steps per phase instead of animating continuously.

### 5.4 Layout

```
+------------------------------------------+
|  fasting since 20:14        [settings]   |   eyebrow, mono, --slate
|                                          |
|            .--------------.              |
|          /                  \            |
|         |     14:22:07       |           |   Fraunces, variable axes
|         |    goal 16h        |           |   IBM Plex Sans, --slate
|          \                  /            |
|            '--------------'              |
|                                          |
|              [ End fast ]                |   always visible, never hidden
|                                          |
|  ----------------------------------      |
|  recent   16h02  15h48  16h30  17h11     |   sparkline row, neutral
+------------------------------------------+
```

Single column, max width 420 px, vertically centred. This is a phone-first surface. Settings and History are separate routes, not modals stacked over the ring.

### 5.5 The ring

SVG, `viewBox="0 0 240 240"`, centre 120,120.

- **Track**: `r=100`, `stroke-width=12`, `--slate` at 18 percent opacity.
- **Progress arc**: same geometry, `stroke-linecap: round`, stroke set to a `<linearGradient>` whose stops are driven by the OKLCH ramp above.

```js
const C = 2 * Math.PI * 100;          // 628.3185
el.style.strokeDasharray  = `${C}`;
el.style.strokeDashoffset = `${C * (1 - progress)}`;
```

Rotate the group `-90deg` about the centre so the fill starts at twelve o'clock.

- **Milestone ticks**: 6 px radial marks at `angle = 360 * pct / 100 - 90` for each configured percent. Filled once passed.
- **Overtime ring**: a second, thinner arc at `r=116`, `stroke-width=4`, in `--ember`, whose `progress` is `lapProgress`. Each completed lap leaves a small persistent dot at twelve o'clock, so three dots reads as three hours past goal at a glance.
- **Ambient glow**: an SVG `<feGaussianBlur>` on a duplicate of the arc, opacity driven by `intensity`. No canvas particle system. It was in an earlier sketch and it is cut, because it fights the kiln direction and costs battery.

### 5.6 Motion

- Ring position is continuous, never eased per frame, or it will lag behind truth.
- One orchestrated moment at goal: a 900 ms temperature swell where the background reaches `--bisque`, the arc reaches `--ember`, and `navigator.vibrate?.([40, 60, 40])` fires. It happens exactly once per fast.
- Under `prefers-reduced-motion: reduce` or `settings.reduceMotion === 'always'`: no swell, no glow pulse, no axis animation. The ring still updates, because that is information rather than decoration.

---

## 6. Notifications

Be honest with the user about what is achievable without a server. Do not promise delivery you cannot make.

### 6.1 What works

**Page open, foreground or backgrounded but alive.** Fully reliable. On each tick, compare `dueMilestones` against `firedMilestones`, fire the difference, then append the fired keys and persist immediately, before the next frame. Persisting after firing is what makes a refresh non-duplicating.

### 6.2 Platform requirements

- Request permission on a user gesture only, from a **Enable notifications** control in Settings. Never on page load.
- On Android and Chrome, `new Notification()` throws. You must go through the service worker: `registration.showNotification(title, options)`. Write the code that way on all platforms.
- On iOS, `Notification.requestPermission` is only available once the site has been added to the Home Screen. Detect `navigator.standalone === false` on iOS and show an inline instruction rather than a dead button.

### 6.3 What does not work, and the compromise

When the page is fully closed, no JavaScript runs, so nothing can fire on schedule. The Notification Triggers API would have solved exactly this and never shipped as a stable feature. Periodic Background Sync has minimum intervals measured in hours and is Chromium only.

Implement the catch-up path instead: on every launch, compute `dueMilestones` and, if any are unfired, show **one consolidated in-app card**, not a burst of system notifications. Wording: "You passed your 16 hour goal 40 minutes ago." Then mark them fired.

Leave a `src/core/push.ts` stub with a comment describing the upgrade path, which is one serverless function holding VAPID keys plus a `pushsubscriptionchange` handler. Do not build it now.

### 6.4 Copy

Plain, second person, no exclamation stacking, no shame.

- 50 percent: "Half way. 8 hours in."
- 90 percent: "1 hour 36 minutes to your goal."
- goal: "16 hours reached."
- overtime: "17 hours. Still going."

---

## 7. PWA shell

- `manifest.webmanifest` with `name: "Lapso"`, `short_name: "Lapso"`, `display: standalone`, both 192 and 512 px maskable icons, `theme_color` matching `--porcelain`.
- `sw.js` registered at scope `/`. Cache-first for the app shell, network for nothing else, since there is no network dependency. Version the cache name and delete stale caches on `activate`.
- The service worker must exist even if the user declines notifications, because it is what makes the app launch offline.

---

## 8. Screens

1. **Timer** (`/`). The ring, the readout, the primary action. Idle state shows a large **Start fast** and a goal selector defaulting to `settings.defaultGoalHours`.
2. **History** (`/history`). Reverse-chronological list, mono timestamps, duration, goal. A hand-rolled SVG bar chart of the last 30 fasts, bars in the neutral `--slate` with a hairline at the goal value. No red bars for short fasts. No green bars for long ones. Colour is not a verdict here.
3. **Settings** (`/settings`). Default goal, milestone percents, notification toggle and permission state, theme, motion, export, import, and a clearly labelled **Delete all data**.

Use the History Routing API or a 40 line hash router. Do not add React Router for three routes.

---

## 9. Product guardrails (non-negotiable)

These are requirements, not suggestions. An interface whose reward curve never flattens is quietly asking for more every single time the user looks at it, and that is a bad property for something that tracks eating windows. Implement all of the following:

1. **Escalation plateaus** at `INTENSITY_CAP_HOURS = 2`. Hour six past goal looks exactly like hour two.
2. **End fast is always visible**, in every phase, at full contrast, never behind a menu, never greyed, never requiring a confirmation dialog. Use a five second undo toast instead of a confirm step.
3. **No streaks, no badges, no records.** Do not compute or display "longest fast", "current streak" or any comparison that frames a shorter fast as a failure.
4. **Goals never auto-increment.** The goal changes only when the user explicitly changes it. Do not suggest a higher goal after a long fast.
5. **No retention notifications.** The app notifies about milestones of a fast the user actively started, and about nothing else. No "you haven't fasted in three days".
6. **Neutral history.** Durations are facts. No judgement colours, no encouraging or disappointed copy attached to individual entries.
7. Cap goal input at 48 hours in the UI and show a plain note above 24 hours suggesting the user discuss extended fasting with a doctor. Do not block, do not moralise, state it once.

---

## 10. Edge cases

| Case | Required behaviour |
| --- | --- |
| Forgot to press start | Editable start time. Picker limited to the past 48 hours, never the future. |
| Accidental start | Undo toast for 5 seconds, removes the fast entirely with no history entry. |
| System clock changed | Persist `lastSeenNow` each tick. If `Date.now() < lastSeenNow - 60000`, show a non-blocking banner offering to correct or end the fast. |
| Absurd duration | Above 168 hours, stop the ring, freeze the readout, and prompt the user to end or correct. Almost certainly a forgotten fast. |
| Two tabs | `storage` event syncs both. Last write wins. |
| Storage evicted | Empty state explains what happened and points at Import. |
| DST transition | Nothing to do, epoch maths is unaffected. Add a unit test proving it. |
| Notification permission denied | Milestones still render in-app. The toggle explains the browser-level state and how to reverse it. |

---

## 11. Accessibility floor

- Ring carries `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`, and an `aria-valuetext` reading "14 hours 22 minutes of a 16 hour goal".
- Milestones announce through an `aria-live="polite"` region.
- All text meets WCAG AA against its surface at every point in the heat ramp. Check the mid-ramp values specifically, they are the ones that fail.
- Keyboard reachable with a visible focus ring. Touch targets 44 px and up.

---

## 12. File layout

```
src/
  core/
    clock.ts        // pure, fully unit tested
    storage.ts      // load, save, migrate, export, import
    milestones.ts   // key generation and dedupe
    notify.ts       // permission, service worker dispatch
    push.ts         // stub only
  ui/
    Ring.tsx
    Timer.tsx
    History.tsx
    Chart.tsx
    Settings.tsx
  styles/
    tokens.css
    app.css
  main.tsx
public/
  sw.js
  manifest.webmanifest
```

---

## 13. Build order

1. `clock.ts` plus its unit tests. No UI at all.
2. `storage.ts`, start and end a fast from the console, verify survival across refresh and browser restart.
3. Static ring at fixed progress values, then wire it to the clock.
4. Phases, heat ramp, variable font axes, goal swell.
5. Milestones and notifications, including the catch-up path.
6. History and chart.
7. Settings, export, import.
8. Service worker and manifest, then verify airplane-mode launch.

---

## 14. Acceptance tests

- [ ] Start a fast, hard-refresh at 30 seconds. Readout continues from 30, not 0.
- [ ] Start a fast, close the browser entirely, reopen two hours later. Readout shows 2 hours.
- [ ] `clock.ts` returns identical results across a DST boundary.
- [ ] Milestone fires exactly once across three consecutive refreshes.
- [ ] Two tabs open, end the fast in one, the other returns to idle without a reload.
- [ ] Airplane mode, cold launch from the installed icon, app runs.
- [ ] `prefers-reduced-motion: reduce` removes all animation while the ring still tracks time.
- [ ] Six hours past goal is visually identical to two hours past goal.
- [ ] End fast is reachable by keyboard in one tab from page load, in every phase.
- [ ] Corrupt `fast.active` JSON does not prevent the app from loading.
