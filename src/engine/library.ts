/**
 * Wallpaper Engine library scanner: discovers the Steam libraries and the
 * Wallpaper Engine install, scans the workshop content folder (431960) plus
 * the local projects folder, parses each wallpaper's project.json (falling
 * back to extension sniffing), and resolves raw asset paths for the file
 * route. Rendering fidelity notes: video wallpapers play the original webm,
 * web wallpapers load their own index.html through the raw route, image
 * wallpapers use the original image, and scene wallpapers degrade to their
 * preview image (the full scene renderer is not portable to a page).
 * @module dsh-wallpaper/engine/library
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type { LibrarySnapshot, WallpaperEntry, WallpaperType } from '../protocol.ts'

/** Steam library definition from libraryfolders.vdf. */
interface SteamLibrary {
  path: string
  workshop: string
}

/** Configured path overrides (from the host state file). */
export interface LibraryConfig {
  engineDir?: string
  steamDir?: string
}

/** One project.json's useful fields (the file carries far more). */
interface ProjectJson {
  title?: unknown
  description?: unknown
  tags?: unknown
  type?: unknown
  file?: unknown
  preview?: unknown
  general?: {
    properties?: {
      preview?: { value?: unknown }
      width?: { value?: unknown }
      height?: { value?: unknown }
      fps?: { value?: unknown }
    }
  }
}

/** Candidate steam roots, in discovery order (later entries win the last-write). */
function steamCandidates(configured: LibraryConfig): string[] {
  const candidates: string[] = []
  const push = (value: string | undefined): void => {
    if (value !== undefined && value !== '' && !candidates.includes(value)) candidates.push(value)
  }
  push(configured.steamDir)
  push(process.env.STEAM_ROOT)
  push(process.env.DSH_WALLPAPER_STEAM)
  const programFiles = process.env['ProgramFiles(x86)'] ?? process.env.ProgramFiles
  push(programFiles !== undefined ? join(programFiles, 'Steam') : undefined)
  push(process.env.ProgramFiles !== undefined ? join(process.env.ProgramFiles, 'Steam') : undefined)
  push('C:\\Steam')
  push('D:\\Steam')
  push('E:\\Steam')
  push('C:\\SteamLibrary')
  push('D:\\SteamLibrary')
  return candidates
}

/** Parse libraryfolders.vdf into the libraries it declares. */
function parseLibraryFolders(steamRoot: string): SteamLibrary[] {
  const file = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const libraries: SteamLibrary[] = []
  const pattern = /"path"\s*"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1] ?? ''
    // VDF doubles backslashes inside quoted strings; the value is a Windows path.
    const path = raw.replace(/\\\\/g, '\\')
    if (path === '') continue
    const workshop = join(path, 'steamapps', 'workshop', 'content', '431960')
    libraries.push({ path, workshop })
  }
  return libraries
}

/** Discover every steam library and the Wallpaper Engine install. */
function discoverLibraries(configured: LibraryConfig): { libraries: SteamLibrary[]; engineDir?: string } {
  const libraries: SteamLibrary[] = []
  const seen = new Set<string>()
  const pushLibrary = (path: string): void => {
    const normalized = resolve(path)
    // Windows paths differ only in case between the candidate list and the
    // VDF declarations; dedupe case-insensitively so one library is scanned once.
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) return
    seen.add(key)
    libraries.push({ path: normalized, workshop: join(normalized, 'steamapps', 'workshop', 'content', '431960') })
  }

  for (const root of steamCandidates(configured)) {
    if (!existsSync(root)) continue
    const steamApps = join(root, 'steamapps')
    if (existsSync(join(root, 'steamapps', 'libraryfolders.vdf'))) {
      // The steam root itself is a library.
      pushLibrary(root)
      for (const library of parseLibraryFolders(root)) {
        pushLibrary(library.path)
      }
    } else if (existsSync(steamApps)) {
      pushLibrary(root)
    }
  }

  // Wallpaper Engine install: the configured dir wins, then any library's
  // common folder, then the steam root's common folder.
  let engineDir: string | undefined
  if (configured.engineDir !== undefined && configured.engineDir !== '') {
    if (existsSync(configured.engineDir)) engineDir = resolve(configured.engineDir)
  }
  if (engineDir === undefined) {
    const commonCandidates: string[] = []
    for (const library of libraries) {
      commonCandidates.push(join(library.path, 'steamapps', 'common', 'wallpaper_engine'))
    }
    for (const candidate of commonCandidates) {
      if (existsSync(candidate)) {
        engineDir = candidate
        break
      }
    }
  }

  return { libraries, engineDir }
}

/** File extensions by wallpaper kind. */
const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.ogv', '.mov']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
const PREVIEW_NAMES = [
  'preview.jpg', 'preview.png', 'preview.webp', 'preview.gif',
  'thumb.jpg', 'thumb.png', 'thumbnail.jpg', 'scene.preview.png', 'screenshot.jpg',
]

/** Map a project.json `type` value to the wallpaper kind. */
function typeFromProject(value: unknown): WallpaperType | undefined {
  if (typeof value === 'number') {
    // Wallpaper Engine project types: 0 scene, 1 video, 2 web, 3 image.
    if (value === 0) return 'scene'
    if (value === 1) return 'video'
    if (value === 2) return 'web'
    if (value === 3) return 'image'
    return undefined
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized === 'scene' || normalized === 'scenes') return 'scene'
    if (normalized === 'video' || normalized === 'videos') return 'video'
    if (normalized === 'web' || normalized === 'website' || normalized === 'html') return 'web'
    if (normalized === 'image' || normalized === 'picture' || normalized === 'img') return 'image'
    return undefined
  }
  return undefined
}

/** First file in the folder matching one of the extensions. */
function findByExtension(folder: string, extensions: readonly string[]): string | undefined {
  let files: string[]
  try {
    files = readdirSync(folder)
  } catch {
    return undefined
  }
  for (const file of files) {
    if (extensions.includes(extensionOf(file))) return file
  }
  return undefined
}

/** Lowercased extension with the leading dot. */
function extensionOf(file: string): string {
  const dot = file.lastIndexOf('.')
  return dot < 0 ? '' : file.slice(dot).toLowerCase()
}

/** The first existing preview candidate. */
function findPreview(folder: string, declared?: string): string {
  if (declared !== undefined && declared !== '') {
    const candidate = resolve(folder, declared)
    if (existsSync(candidate)) return declared
  }
  for (const name of PREVIEW_NAMES) {
    if (existsSync(join(folder, name))) return name
  }
  return ''
}

/** Number-ish helper for project.json properties. */
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/** String helper for project.json fields. */
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Scan one wallpaper folder; returns null when it holds nothing usable. */
function scanFolder(folder: string, source: WallpaperEntry['source'], id: string, current: boolean): WallpaperEntry | null {
  let project: ProjectJson | undefined
  try {
    const raw = readFileSync(join(folder, 'project.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) project = parsed as ProjectJson
  } catch {
    project = undefined
  }

  const declaredType = project !== undefined ? typeFromProject(project.type) : undefined
  const declaredFile = project !== undefined ? stringValue(project.file) : undefined
  const declaredPreview = project !== undefined
    ? stringValue(project.preview) ?? stringValue(project.general?.properties?.preview?.value)
    : undefined

  let type = declaredType
  let file = declaredFile
  if (file !== undefined) {
    // The declared main file decides the kind when the type is missing.
    if (type === undefined) {
      const extension = extensionOf(file)
      if (extension === '.json' || file.toLowerCase() === 'scene.json') type = 'scene'
      else if (VIDEO_EXTENSIONS.includes(extension)) type = 'video'
      else if (extension === '.html') type = 'web'
      else if (IMAGE_EXTENSIONS.includes(extension)) type = 'image'
    }
    if (file !== 'scene.json' && !existsSync(join(folder, file))) file = undefined
  }

  // Fallback sniffing when no project.json or unusable declared file.
  if (type === undefined || file === undefined) {
    const hasScene = existsSync(join(folder, 'scene.json'))
    const video = findByExtension(folder, VIDEO_EXTENSIONS)
    const html = findByExtension(folder, ['.html'])
    const image = findByExtension(folder, IMAGE_EXTENSIONS)
    if (type === undefined) {
      if (video !== undefined) type = 'video'
      else if (html !== undefined) type = 'web'
      else if (image !== undefined) type = 'image'
      else if (hasScene) type = 'scene'
    }
    if (file === undefined) {
      if (type === 'video') file = video
      else if (type === 'web') file = html
      else if (type === 'image') file = image
      else if (type === 'scene') file = hasScene ? 'scene.json' : undefined
    }
  }
  if (type === undefined) return null

  const workshopId = source === 'workshop' ? basename(folder) : undefined
  const preview = findPreview(folder, declaredPreview)
  const properties = project?.general?.properties
  const tags = Array.isArray(project?.tags) ? project.tags.filter((tag): tag is string => typeof tag === 'string') : []

  return {
    id,
    title: stringValue(project?.title) ?? (source === 'workshop' ? `Workshop ${workshopId ?? basename(folder)}` : basename(folder)),
    type,
    source,
    folder: resolve(folder),
    file: file ?? '',
    preview,
    width: numberValue(properties?.width?.value),
    height: numberValue(properties?.height?.value),
    fps: numberValue(properties?.fps?.value),
    workshopId,
    tags,
    description: stringValue(project?.description),
    current,
  }
}

/** Extract the folder name of every wallpaper currently used by Wallpaper Engine. */
function currentWallpaperFolders(engineDir: string | undefined): Set<string> {
  const result = new Set<string>()
  if (engineDir === undefined) return result
  try {
    const raw = readFileSync(join(engineDir, 'config', 'config.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return result
    const list = (parsed as { wallpaperlist?: unknown }).wallpaperlist
    if (!Array.isArray(list)) return result
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const directory = (item as { directory?: unknown }).directory
      if (typeof directory !== 'string' || directory === '') continue
      // WE paths look like `steamworkshop\123456\...` or `projects\name\...`.
      const normalized = directory.replace(/\\/g, '/')
      const segments = normalized.split('/').filter(segment => segment !== '')
      if (segments.length >= 2) {
        const kind = segments[segments.length - 2]
        const name = segments[segments.length - 1]
        if (kind === 'steamworkshop' && /^\d+$/.test(name)) result.add(name)
        else if (kind === 'projects') result.add(name)
        else result.add(name)
      } else if (segments.length === 1) {
        result.add(segments[0] ?? '')
      }
    }
  } catch {
    // config.json missing or unparsable: current markers simply stay empty.
  }
  return result
}

/** Scan a directory of wallpaper folders. */
function scanDirectory(dir: string, source: WallpaperEntry['source'], currentFolders: Set<string>): WallpaperEntry[] {
  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
  const result: WallpaperEntry[] = []
  for (const name of entries) {
    const folder = join(dir, name)
    const id = source === 'workshop' ? `ws-${name}` : `prj-${name}`
    const entry = scanFolder(folder, source, id, currentFolders.has(name))
    if (entry !== null) result.push(entry)
  }
  return result
}

/** Wallpaper Engine library: discovery, scanning, and raw-path resolution. */
export class WallpaperLibrary {
  private readonly configured: LibraryConfig
  private cached: LibrarySnapshot | undefined
  private scanning: Promise<LibrarySnapshot> | undefined

  constructor(configured: LibraryConfig) {
    this.configured = configured
  }

  /** Re-read configured overrides (called after the state file changes). */
  setConfigured(configured: LibraryConfig): void {
    this.configured.engineDir = configured.engineDir
    this.configured.steamDir = configured.steamDir
    this.cached = undefined
  }

  /** The currently discovered engine/steam dirs (scan-independent). */
  dirs(): { engineDir?: string; steamDir?: string } {
    const { libraries, engineDir } = discoverLibraries(this.configured)
    return {
      engineDir,
      steamDir: libraries.length > 0 ? libraries[0]?.path : undefined,
    }
  }

  /** Scan (or return the cached scan when one exists). */
  scan(force = false): Promise<LibrarySnapshot> {
    if (!force && this.cached !== undefined) return Promise.resolve(this.cached)
    this.scanning ??= this.doScan().finally(() => {
      this.scanning = undefined
    })
    return this.scanning
  }

  private async doScan(): Promise<LibrarySnapshot> {
    const { libraries, engineDir } = discoverLibraries(this.configured)
    const currentFolders = currentWallpaperFolders(engineDir)
    const libraryDirs: string[] = []
    const wallpapers: WallpaperEntry[] = []
    const seenFolders = new Set<string>()

    for (const library of libraries) {
      if (!existsSync(library.workshop)) continue
      libraryDirs.push(library.workshop)
      for (const entry of scanDirectory(library.workshop, 'workshop', currentFolders)) {
        const key = process.platform === 'win32' ? entry.folder.toLowerCase() : entry.folder
        if (seenFolders.has(key)) continue
        seenFolders.add(key)
        wallpapers.push(entry)
      }
    }

    if (engineDir !== undefined) {
      const projects = join(engineDir, 'projects')
      if (existsSync(projects)) {
        libraryDirs.push(projects)
        for (const entry of scanDirectory(projects, 'projects', currentFolders)) {
          const key = process.platform === 'win32' ? entry.folder.toLowerCase() : entry.folder
          if (seenFolders.has(key)) continue
          seenFolders.add(key)
          wallpapers.push(entry)
        }
      }
    }

    wallpapers.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return a.title.localeCompare(b.title)
    })

    const snapshot: LibrarySnapshot = {
      engineDir,
      steamDir: libraries.length > 0 ? libraries[0]?.path : undefined,
      libraryDirs,
      wallpapers,
      scannedAt: Date.now(),
    }
    this.cached = snapshot
    return snapshot
  }

  /** Resolve a wallpaper id to its folder; undefined when unknown. */
  folderOf(id: string): string | undefined {
    const snapshot = this.cached
    if (snapshot === undefined) return undefined
    const entry = snapshot.wallpapers.find(item => item.id === id)
    return entry?.folder
  }

  /**
   * Resolve a raw asset request: id plus a relative path inside the wallpaper
   * folder. Returns the absolute path only when it stays inside the folder
   * (path-traversal guard). The caller re-scans when the cache is missing.
   */
  resolveRaw(id: string, relativePath: string): string | undefined {
    const folder = this.folderOf(id)
    if (folder === undefined) return undefined
    const absolute = resolve(folder, relativePath)
    if (absolute !== folder && !absolute.startsWith(folder + sep)) return undefined
    if (!existsSync(absolute)) return undefined
    return absolute
  }
}
