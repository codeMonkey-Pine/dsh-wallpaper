/**
 * Browser-side settings store: the wallpaper settings persisted to
 * localStorage (`dsh.wallpaper.v1`), the shared scanned-library state (both
 * the panel and the layer read the SAME snapshot, so a rescan in the panel is
 * immediately visible to the renderer), and host-desired-state merging on
 * boot. A tiny subscribe/getSnapshot class — no framework machinery.
 * @module dsh-wallpaper/client/state
 */

import { DEFAULT_SETTINGS, SETTINGS_KEY, type DesiredState, type LibrarySnapshot, type WallpaperSettings } from '../protocol.ts'
import type { WallpaperApi } from './api.ts'

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

/** The settings + shared library store. */
export class SettingsStore {
  private settings: WallpaperSettings
  private library: LibrarySnapshot | null = null
  private libraryError: string | null = null
  private loadingLibrary = false
  private listeners = new Set<() => void>()
  /** True once the host desired state has been merged on boot. */
  private hostMerged = false

  constructor() {
    this.settings = loadPersisted()
  }

  getSnapshot(): WallpaperSettings {
    return this.settings
  }

  /** The shared scanned library (same object the panel and the layer see). */
  getLibrary(): LibrarySnapshot | null {
    return this.library
  }

  getLibraryError(): string | null {
    return this.libraryError
  }

  isLoadingLibrary(): boolean {
    return this.loadingLibrary
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private persist(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch {
      // Storage full or blocked: the in-memory settings still apply this session.
    }
    this.notify()
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

  /** Publish a library snapshot (used by loadLibrary and the config route). */
  applyLibrary(snapshot: LibrarySnapshot, error: string | null = null): void {
    this.library = snapshot
    this.libraryError = error
    this.loadingLibrary = false
    this.notify()
  }

  /**
   * Fetch the library into the shared store. The panel's 重新扫描 and the
   * layer's boot both go through here, so a freshly scanned wallpaper is
   * immediately resolvable by the renderer.
   * @param api - the API client.
   * @param force - true to rescan on the host, false to reuse its cache.
   */
  async loadLibrary(api: WallpaperApi, force = false): Promise<void> {
    if (this.loadingLibrary) return
    this.loadingLibrary = true
    this.notify()
    try {
      const snapshot = await api.library(force)
      this.applyLibrary(snapshot)
    } catch (error) {
      this.libraryError = error instanceof Error ? error.message : String(error)
      this.loadingLibrary = false
      this.notify()
    }
  }

  /** The effective carousel playlist: the saved ids that exist, or the active wallpaper. */
  playlist(knownIds: ReadonlySet<string>): string[] {
    const saved = this.settings.carouselIds.filter(id => knownIds.has(id))
    if (saved.length > 0) return saved
    if (this.settings.activeId !== null && knownIds.has(this.settings.activeId)) return [this.settings.activeId]
    return []
  }
}
