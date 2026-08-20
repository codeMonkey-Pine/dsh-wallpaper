/**
 * Shared wire protocol between the dsh-wallpaper host half and the browser
 * half. Pure constants and types only — no Node or DOM imports, so the same
 * file is safe to bundle into the client.
 * @module dsh-wallpaper/protocol
 */

/** The /api/dsh-wallpaper route family. */
export const API = {
  /** GET — engine/steam dirs and scan errors. */
  status: '/api/dsh-wallpaper/status',
  /** GET — library snapshot (?refresh=1 forces a rescan). */
  library: '/api/dsh-wallpaper/library',
  /** POST — force a rescan, returns the fresh library. */
  rescan: '/api/dsh-wallpaper/rescan',
  /** POST — set engineDir/steamDir overrides, persists to the host state file. */
  config: '/api/dsh-wallpaper/config',
  /** GET/POST — the agent-set desired state (id/opacity/scope). */
  state: '/api/dsh-wallpaper/state',
  /** GET — raw wallpaper file: /api/dsh-wallpaper/raw/<id>/<relative path>. */
  raw: '/api/dsh-wallpaper/raw',
} as const

/** Wallpaper kind, mirroring Wallpaper Engine's project types. */
export type WallpaperType = 'scene' | 'video' | 'web' | 'image'

/** Where the wallpaper lives in the Wallpaper Engine library. */
export type WallpaperSource = 'workshop' | 'projects'

/** One entry of the scanned Wallpaper Engine library. */
export interface WallpaperEntry {
  /** Stable id: `ws-<workshopId>` or `prj-<projectName>`. */
  id: string
  title: string
  type: WallpaperType
  source: WallpaperSource
  /** Absolute folder path (host side only; never rendered). */
  folder: string
  /** Main content file name (scene.json / video.webm / index.html / image.jpg). */
  file: string
  /** Preview image path relative to the wallpaper folder ('' when none). */
  preview: string
  /** Media width/height/fps from project.json (best effort). */
  width?: number
  height?: number
  fps?: number
  /** Workshop id when source is 'workshop'. */
  workshopId?: string
  tags: string[]
  description?: string
  /** True when Wallpaper Engine's config.json currently lists this wallpaper. */
  current: boolean
}

/** The scanned library plus the discovered Wallpaper Engine paths. */
export interface LibrarySnapshot {
  engineDir?: string
  steamDir?: string
  /** Every directory that was scanned for wallpaper folders. */
  libraryDirs: string[]
  scanError?: string
  wallpapers: WallpaperEntry[]
  scannedAt: number
}

/** The wallpaper scope: the whole page, or the main (center) content column. */
export type Scope = 'page' | 'main'

/** How the wallpaper media fits its area. */
export type FillMode = 'cover' | 'contain' | 'stretch'

/** Carousel transition animation. */
export type CarouselAnimation = 'fade' | 'slide' | 'none'

/** Agent-set desired state, persisted on the host and merged by the browser half. */
export interface DesiredState {
  id?: string
  opacity?: number
  scope?: Scope
}

/** Host state file (~/.dsh/dsh-wallpaper.json) contents. */
export interface HostState {
  engineDir?: string
  steamDir?: string
  desired: DesiredState
}

/** Browser-side wallpaper settings, persisted to localStorage (dsh.wallpaper.v1). */
export interface WallpaperSettings {
  enabled: boolean
  activeId: string | null
  /** 0-100. */
  opacity: number
  scope: Scope
  fill: FillMode
  /** 0-20 px. */
  blur: number
  vignetteColor: string
  /** 0-100. */
  vignetteIntensity: number
  fps: 'auto' | 60 | 30 | 10
  pauseOnBlur: boolean
  parallax: boolean
  clickThrough: boolean
  carouselEnabled: boolean
  /** Seconds between carousel switches. */
  carouselInterval: number
  carouselAnimation: CarouselAnimation
  /** Ordered carousel playlist (ids). */
  carouselIds: string[]
  themeLink: boolean
  /** Scene preview soften pipeline: cover + blur + lowered opacity + vignette. */
  sceneEnhance: boolean
}

/** Default browser settings. */
export const DEFAULT_SETTINGS: WallpaperSettings = {
  enabled: true,
  activeId: null,
  opacity: 70,
  scope: 'main',
  fill: 'cover',
  blur: 0,
  vignetteColor: '#000000',
  vignetteIntensity: 0,
  fps: 'auto',
  pauseOnBlur: true,
  parallax: true,
  clickThrough: true,
  carouselEnabled: false,
  carouselInterval: 60,
  carouselAnimation: 'fade',
  carouselIds: [],
  themeLink: true,
  sceneEnhance: true,
}

/** localStorage key for the browser settings. */
export const SETTINGS_KEY = 'dsh.wallpaper.v1'

/**
 * Cache-busting version for media URLs. Bump whenever the host's media
 * serving behavior changes (e.g. the suffix byte-range fix): browsers keep
 * stale Range responses (206 partial caches, max-age 3600) from the old host
 * in the HTTP cache, and reusing them leaves a video stuck at readyState 0 —
 * the exact "black screen after restart" report. A versioned URL forces every
 * media request down a fresh cache key.
 */
export const MEDIA_CACHE_VERSION = '2'

/** Build the raw-file URL for one wallpaper asset. */
export function rawUrl(id: string, relativePath: string): string {
  const path = relativePath.split('/').map(encodeURIComponent).join('/')
  return `${API.raw}/${encodeURIComponent(id)}/${path}?v=${MEDIA_CACHE_VERSION}`
}
