import { useEffect, useState } from 'react'
import { clampGoalHours, DOCTOR_NOTE_THRESHOLD_HOURS, MAX_GOAL_HOURS } from '../core/clock'
import {
  getPermissionState,
  isIosNonStandalone,
  isNotificationSupported,
  requestNotificationPermission,
} from '../core/notify'
import {
  deleteAll,
  dismissEvictionNotice,
  exportJson,
  importHistoryOnly,
  importJson,
  isEvictionNoticeDismissed,
  loadSettings,
  previewImport,
  saveSettings,
  subscribe,
  type ImportPreview,
} from '../core/storage'
import type { Settings as SettingsData } from '../core/types'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

// Optional affordance (PLAN.md Phase 8): browsers that support installing
// hold the native prompt back until called explicitly, so without this the
// only way in is a browser menu the user has to already know about.
function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setDeferredPrompt(null)
  }

  return { available: deferredPrompt !== null, promptInstall }
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>(() => loadSettings())
  const [evictionDismissed, setEvictionDismissed] = useState(() => isEvictionNoticeDismissed())
  const { available: installAvailable, promptInstall } = useInstallPrompt()

  useEffect(
    () =>
      subscribe(() => {
        setSettings(loadSettings())
        setEvictionDismissed(isEvictionNoticeDismissed())
      }),
    [],
  )

  function updateSettings(patch: Partial<SettingsData>) {
    saveSettings({ ...loadSettings(), ...patch })
  }

  return (
    <main className="shell shell-wide">
      <div className="eyebrow-row">
        <a className="eyebrow-link" href="#/">
          &larr; back
        </a>
        <p className="eyebrow">settings</p>
      </div>

      {!evictionDismissed && (
        <div className="banner" role="status">
          <p>
            Safari and some browsers can clear site data, including your history, after about a week without
            opening this app. Export regularly to keep a backup.
          </p>
          <button type="button" onClick={dismissEvictionNotice}>
            Got it
          </button>
        </div>
      )}

      {installAvailable && (
        <button type="button" className="btn-toggle" onClick={() => void promptInstall()}>
          Install Lapso
        </button>
      )}

      <DefaultGoalSection settings={settings} updateSettings={updateSettings} />
      <MilestonePercentsSection settings={settings} updateSettings={updateSettings} />
      <NotificationsSection settings={settings} updateSettings={updateSettings} />
      <ThemeSection settings={settings} updateSettings={updateSettings} />
      <MotionSection settings={settings} updateSettings={updateSettings} />
      <DataSection />
    </main>
  )
}

interface SectionProps {
  settings: SettingsData
  updateSettings: (patch: Partial<SettingsData>) => void
}

function DefaultGoalSection({ settings, updateSettings }: SectionProps) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Default goal</h2>
      <label className="field">
        <span>Hours</span>
        <input
          type="number"
          min={1}
          max={MAX_GOAL_HOURS}
          step={0.5}
          value={settings.defaultGoalHours}
          onChange={(e) => updateSettings({ defaultGoalHours: clampGoalHours(Number(e.target.value)) })}
        />
      </label>
      {settings.defaultGoalHours > DOCTOR_NOTE_THRESHOLD_HOURS && (
        <p className="note">Consider discussing extended fasting with a doctor.</p>
      )}
    </section>
  )
}

function MilestonePercentsSection({ settings, updateSettings }: SectionProps) {
  const [draft, setDraft] = useState('')

  function removePercent(pct: number) {
    updateSettings({ milestonePercents: settings.milestonePercents.filter((p) => p !== pct) })
  }

  function addPercent() {
    const pct = Math.round(Number(draft))
    if (!Number.isFinite(pct) || pct < 1 || pct > 99) {
      setDraft('')
      return
    }
    const next = [...new Set([...settings.milestonePercents, pct])].sort((a, b) => a - b)
    updateSettings({ milestonePercents: next })
    setDraft('')
  }

  return (
    <section className="settings-section">
      <h2 className="settings-heading">Milestones</h2>
      <ul className="percent-chips">
        {settings.milestonePercents.map((pct) => (
          <li key={pct} className="percent-chip">
            <span>{pct}%</span>
            <button type="button" aria-label={`Remove ${pct}%`} onClick={() => removePercent(pct)}>
              &times;
            </button>
          </li>
        ))}
      </ul>
      <div className="percent-add">
        <input
          type="number"
          min={1}
          max={99}
          placeholder="Add %"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addPercent()
          }}
        />
        <button type="button" onClick={addPercent}>
          Add
        </button>
      </div>
    </section>
  )
}

function NotificationsSection({ settings, updateSettings }: SectionProps) {
  const [permission, setPermission] = useState(() => getPermissionState())

  if (!isNotificationSupported()) {
    return (
      <section className="settings-section">
        <h2 className="settings-heading">Notifications</h2>
        <p className="note">Notifications aren&rsquo;t supported in this browser.</p>
      </section>
    )
  }

  if (isIosNonStandalone()) {
    return (
      <section className="settings-section">
        <h2 className="settings-heading">Notifications</h2>
        <p className="note">Add Lapso to your Home Screen to enable notifications on iOS.</p>
      </section>
    )
  }

  const handleToggle = async () => {
    if (settings.notificationsEnabled) {
      updateSettings({ notificationsEnabled: false })
      return
    }
    const result = await requestNotificationPermission()
    setPermission(result === 'unsupported' ? getPermissionState() : result)
    updateSettings({ notificationsEnabled: result === 'granted' })
  }

  return (
    <section className="settings-section">
      <h2 className="settings-heading">Notifications</h2>
      {permission === 'denied' ? (
        <p className="note">
          Notifications are blocked for this site. Re-enable them from your browser&rsquo;s site settings, then
          reload this page.
        </p>
      ) : (
        <button type="button" className="btn-toggle" onClick={() => void handleToggle()}>
          {settings.notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
        </button>
      )}
    </section>
  )
}

const THEME_OPTIONS: { value: SettingsData['theme']; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
]

function ThemeSection({ settings, updateSettings }: SectionProps) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Theme</h2>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={settings.theme === opt.value}
            className={settings.theme === opt.value ? 'segmented-option active' : 'segmented-option'}
            onClick={() => updateSettings({ theme: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  )
}

const MOTION_OPTIONS: { value: SettingsData['reduceMotion']; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'always', label: 'Always reduce' },
]

function MotionSection({ settings, updateSettings }: SectionProps) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Motion</h2>
      <div className="segmented" role="radiogroup" aria-label="Motion">
        {MOTION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={settings.reduceMotion === opt.value}
            className={settings.reduceMotion === opt.value ? 'segmented-option active' : 'segmented-option'}
            onClick={() => updateSettings({ reduceMotion: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function DataSection() {
  const [importPreview, setImportPreview] = useState<{ text: string; preview: ImportPreview } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)

  function handleExport() {
    const json = exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lapso-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    const text = await file.text()
    const result = previewImport(text)
    if (result.ok) {
      setImportError(null)
      setImportPreview({ text, preview: result.preview })
    } else {
      setImportPreview(null)
      setImportError(result.reason)
    }
  }

  function handleReplace() {
    if (!importPreview) return
    importJson(importPreview.text)
    setImportPreview(null)
  }

  function handleHistoryOnly() {
    if (!importPreview) return
    importHistoryOnly(importPreview.text)
    setImportPreview(null)
  }

  function handleDelete() {
    deleteAll()
    setDeleteConfirming(false)
    window.location.hash = '#/'
  }

  return (
    <section className="settings-section">
      <h2 className="settings-heading">Data</h2>

      <div className="data-actions">
        <button type="button" className="btn-toggle" onClick={handleExport}>
          Export data
        </button>
        <label className="btn-toggle btn-file">
          Import data
          <input type="file" accept="application/json" onChange={(e) => void handleFileChange(e)} />
        </label>
      </div>

      {importError && <p className="note">That file couldn&rsquo;t be read: {importError}.</p>}

      {importPreview && (
        <div className="banner" role="status">
          <p>
            {importPreview.preview.fastsCount} fast{importPreview.preview.fastsCount === 1 ? '' : 's'},{' '}
            {formatBytes(importPreview.preview.sizeBytes)}, schema v{importPreview.preview.schemaVersion} &mdash;
            replace your current data?
          </p>
          {importPreview.preview.supported ? (
            <button type="button" onClick={handleReplace}>
              Replace all data
            </button>
          ) : (
            <>
              <p>This file uses a newer format than this version of Lapso understands.</p>
              <button type="button" onClick={handleHistoryOnly}>
                Import history only
              </button>
            </>
          )}
          <button type="button" onClick={() => setImportPreview(null)}>
            Cancel
          </button>
        </div>
      )}

      <h2 className="settings-heading settings-heading-danger">Delete all data</h2>
      {!deleteConfirming ? (
        <button type="button" className="btn-danger" onClick={() => setDeleteConfirming(true)}>
          Delete all data
        </button>
      ) : (
        <div className="banner" role="alert">
          <p>This permanently deletes your active fast, history, and settings. This can&rsquo;t be undone.</p>
          <button type="button" className="btn-danger" onClick={handleDelete}>
            Yes, delete everything
          </button>
          <button type="button" onClick={() => setDeleteConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  )
}
