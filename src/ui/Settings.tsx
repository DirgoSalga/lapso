// Placeholder only -- the real Settings screen (default goal, milestone
// percents, notifications, theme, motion, export/import, delete all) is
// PLAN.md Phase 7. This exists now so the router (Phase 6) has all three
// routes wired and #/settings is reachable rather than a dead link.
export function Settings() {
  return (
    <main className="shell">
      <div className="eyebrow-row">
        <a className="eyebrow-link" href="#/">
          &larr; back
        </a>
        <p className="eyebrow">settings</p>
      </div>
      <p className="empty-state">Settings are coming soon.</p>
    </main>
  )
}
