/**
 * Browser-side settings store: the wallpaper settings persisted to
 * localStorage (`dsh.wallpaper.v1`), with host-desired-state merging on
 * boot. A tiny subscribe/getSnapshot/update class — no framework machinery,
 * so both the panel React tree and the layer React tree read the same source.
 * @module dsh-wallpaper/client/state
 */

import { DEFAULT_SETTINGS, SETTINGS_KEY, type DesiredState, type WallpaperSettings } from '../protocol.ts'

/** Merge a partial settings object with defaults, clamping ranges. */
function sanitize(patch: Partial<WallpaperSettings>): WallpaperSettings {
  const merged: WallpaperSettings = { ...DEFAULT_SETTINGS, ...patch }
  merged.opacity = Math.max(0, Math.min(100, Math.round(Number.isFinite(merged.opacity) ? merged.opacity : DEFAULT_SETTINGS.opacity)))
  merged.blur = Math.max(0, Math.min(20, Math.round(Number.isFinite(merged.blur) ? merged.blur : DEFAULT_SETTINGS.blur)))
  merged.vignetteIntensity = Math.max(0, Math.min(100, Math.round(Number.isFinite(merged.vignetteIntensity) ? merged.vignetteIntensity : DEFAULT_SETTINGS.vignetteIntensity)))
  merged.carouselInterval = Math.max(5, Math.min(3600, Math.round(Number.isFinite(merged.carouselInterval) ? merged.carouselInterval : DEFAULT_SETTINGS.carouselInterval)))
  if (merged.scope !== 'page' && merged.scope !== 'main') merged.scope = DEFAULT_SETTINGS.scope
  if (merged.fill !== 'cover' && merged.fill !== 'contain' && merged.fill !== 'stretch') merged.fill = DEFAULT_SETTINGS.fill
  if (merged.fps !== 'auto' && merged.fps !== 60 && merged.fps !== 30 && merged.fps !== 10) merged.fps = DEFAULT_SETTINGS.fps
  if (merged.carouselAnimation !== 'fade' && merged.carouselAnimation !== 'slide' && merged.carouselAnimation !== 'none') merged.carouselAnimation = DEFAULT_SETTINGS.carouselAnimation
  if (!Array.isArray(merged.carouselIds)) merged.carouselIds = []
  if (!/^#[0-9a-fA-F]{6}$/.test(merged.vignetteColor)) merged.vignetteColor = DEFAULT_SETTINGS.vignetteColor
  return merged
}

/** Load settings from localStorage (invalid JSON falls back to defaults). */
function loadPersisted(): WallpaperSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS }
    return sanitize(parsed as Partial<WallpaperSettings>)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** The settings store. */
export class SettingsStore {
  private settings: WallpaperSettings
  private listeners = new Set<() => void>()
  /** True once the host desired state has been merged on boot. */
  private hostMerged = false

  constructor() {
    this.settings = loadPersisted()
  }

  getSnapshot(): WallpaperSettings {
    return this.settings
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch {
      // Storage full or blocked: the in-memory settings still apply this session.
    }
    for (const listener of this.listeners) listener()
  }

  update(patch: Partial<WallpaperSettings>): void {
    this.settings = sanitize({ ...this.settings, ...patch })
    this.persist()
  }

  /** Merge the host desired state (agent channel) on boot; user picks win later. */
  mergeDesired(desired: DesiredState): void {
    if (this.hostMerged) return
    this.hostMerged = true
    const patch: Partial<WallpaperSettings> = {}
    if (desired.id !== undefined && this.settings.activeId === null) patch.activeId = desired.id
    if (desired.opacity !== undefined && this.settings.opacity === DEFAULT_SETTINGS.opacity) patch.opacity = desired.opacity
    if (desired.scope !== undefined && this.settings.scope === DEFAULT_SETTINGS.scope) patch.scope = desired.scope
    if (Object.keys(patch).length === 0) return
    this.settings = sanitize({ ...this.settings, ...patch })
    this.persist()
  }

  /** The effective carousel playlist: the saved ids that exist, or the active wallpaper. */
  playlist(knownIds: ReadonlySet<string>): string[] {
    const saved = this.settings.carouselIds.filter(id => knownIds.has(id))
    if (saved.length > 0) return saved
    if (this.settings.activeId !== null && knownIds.has(this.settings.activeId)) return [this.settings.activeId]
    return []
  }
}
