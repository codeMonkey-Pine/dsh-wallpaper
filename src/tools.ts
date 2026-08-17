/**
 * Agent tools for dsh-wallpaper: the DSH-native counterpart of the panel UI.
 * wallpaper_scan rescans the Wallpaper Engine library, wallpaper_list lists
 * the scanned wallpapers, wallpaper_set applies a wallpaper (or opacity/scope)
 * through the host desired state that the browser half merges on boot, and
 * wallpaper_config points the scanner at a non-default Steam / Wallpaper
 * Engine install.
 * @module dsh-wallpaper/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { WallpaperLibrary } from './engine/library.ts'
import type { DesiredState, HostState, LibrarySnapshot } from './protocol.ts'

/** One text content block (the only render shape these tools emit). */
function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** Compact wallpaper table render. */
function renderWallpapers(snapshot: LibrarySnapshot): string {
  if (snapshot.wallpapers.length === 0) {
    const dirs = snapshot.libraryDirs.length > 0 ? snapshot.libraryDirs.join('\n') : 'none discovered'
    return `no wallpapers found\nscanned directories:\n${dirs}\nengineDir: ${snapshot.engineDir ?? 'not found'}\nsteamDir: ${snapshot.steamDir ?? 'not found'}`
  }
  const rows = snapshot.wallpapers.map(entry => [
    entry.id,
    entry.title,
    entry.type,
    entry.source,
    entry.current ? 'current' : '-',
    `${entry.width ?? '?'}x${entry.height ?? '?'}`,
  ].join(' | '))
  return [
    'id | title | type | source | current | size',
    '--- | --- | --- | --- | --- | ---',
    ...rows,
  ].join('\n')
}

/** Summarize one scan. */
function renderScanSummary(snapshot: LibrarySnapshot): string {
  const lines = [
    `scanned ${snapshot.wallpapers.length} wallpaper(s)`,
    `engineDir: ${snapshot.engineDir ?? 'not found'}`,
    `steamDir: ${snapshot.steamDir ?? 'not found'}`,
  ]
  if (snapshot.libraryDirs.length > 0) lines.push(`directories:\n${snapshot.libraryDirs.join('\n')}`)
  if (snapshot.scanError !== undefined) lines.push(`scanError: ${snapshot.scanError}`)
  return lines.join('\n')
}

/** Tool dependencies: the scanner and host state access. */
export interface WallpaperToolsDeps {
  library: WallpaperLibrary
  getState: () => HostState
  saveState: (state: HostState) => void
}

/** The wallpaper-scan tool. */
export function wallpaperScanTool(deps: WallpaperToolsDeps) {
  return defineTool({
    name: 'wallpaper_scan',
    description: 'Rescan the local Wallpaper Engine library (Steam workshop 431960 + local projects) and report the discovered wallpaper count and paths. ' +
      'Triggers: wallpaper, wallpaper engine, scan wallpapers, 壁纸, 扫描壁纸.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'integer', required: true },
          engineDir: { type: 'string' },
          steamDir: { type: 'string' },
          directories: { type: 'array', items: { type: 'string' }, required: true },
          scanError: { type: 'string' },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value: { summary?: string }) => text(value.summary ?? 'scan complete'),
    },
    async execute() {
      const snapshot = await deps.library.scan(true)
      return {
        count: snapshot.wallpapers.length,
        engineDir: snapshot.engineDir,
        steamDir: snapshot.steamDir,
        directories: snapshot.libraryDirs,
        scanError: snapshot.scanError,
        summary: renderScanSummary(snapshot),
      }
    },
  })
}

/** The wallpaper-list tool. */
export function wallpaperListTool(deps: WallpaperToolsDeps) {
  return defineTool({
    name: 'wallpaper_list',
    description: 'List the wallpapers in the local Wallpaper Engine library (id, title, type, source, current, size). ' +
      'Use wallpaper_set <id> to apply one to the web GUI background. Triggers: 壁纸列表, list wallpapers.',
    parameters: {
      query: { type: 'string', description: 'Optional case-insensitive filter against title, id, and tags.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                type: { type: 'string', enum: ['scene', 'video', 'web', 'image'], required: true },
                source: { type: 'string', enum: ['workshop', 'projects'], required: true },
                current: { type: 'boolean', required: true },
                width: { type: 'integer' },
                height: { type: 'integer' },
                preview: { type: 'string', required: true },
              },
            },
          },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value: { summary?: string }) => text(value.summary ?? ''),
    },
    async execute(args: { query?: string }) {
      const snapshot = await deps.library.scan(false)
      const query = (args.query ?? '').trim().toLowerCase()
      const entries = query === ''
        ? snapshot.wallpapers
        : snapshot.wallpapers.filter(entry =>
            entry.title.toLowerCase().includes(query)
            || entry.id.toLowerCase().includes(query)
            || entry.tags.some(tag => tag.toLowerCase().includes(query)))
      return {
        entries: entries.map(entry => ({
          id: entry.id,
          title: entry.title,
          type: entry.type,
          source: entry.source,
          current: entry.current,
          width: entry.width,
          height: entry.height,
          preview: entry.preview,
        })),
        summary: renderWallpapers({ ...snapshot, wallpapers: entries }),
      }
    },
  })
}

/** The wallpaper-set tool (agent channel into the GUI). */
export function wallpaperSetTool(deps: WallpaperToolsDeps) {
  return defineTool({
    name: 'wallpaper_set',
    description: 'Apply a wallpaper to the dsh web GUI background through the host desired state: set the active wallpaper id, opacity (0-100), and/or scope (page = whole page, main = center content column). ' +
      'The browser applies the desired state on load; the user can override it from the 壁纸设计 panel. Triggers: 设置壁纸, apply wallpaper, change wallpaper.',
    parameters: {
      id: { type: 'string', description: 'Wallpaper id from wallpaper_list (ws-<id> or prj-<name>).' },
      opacity: { type: 'integer', description: 'Wallpaper opacity 0-100.' },
      scope: { type: 'string', enum: ['page', 'main'], description: 'page = whole page, main = center content column only.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          desired: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              opacity: { type: 'integer' },
              scope: { type: 'string', enum: ['page', 'main'] },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (_args, value: { ok: boolean; desired?: Partial<DesiredState>; error?: string }) => {
        if (!value.ok) return text(`wallpaper_set failed: ${value.error ?? 'unknown error'}`)
        const desired = value.desired ?? {}
        const parts = ['applied desired state:']
        if (desired.id !== undefined) parts.push(`id: ${desired.id}`)
        if (desired.opacity !== undefined) parts.push(`opacity: ${desired.opacity}`)
        if (desired.scope !== undefined) parts.push(`scope: ${desired.scope}`)
        parts.push('(the web GUI picks this up on its next boot or refresh)')
        return text(parts.join('\n'))
      },
    },
    async execute(args: { id?: string; opacity?: number; scope?: 'page' | 'main' }) {
      const state = deps.getState()
      const desired: DesiredState = { ...state.desired }
      if (args.id !== undefined) {
        const snapshot = await deps.library.scan(false)
        const known = snapshot.wallpapers.some(entry => entry.id === args.id)
        if (!known) {
          return {
            ok: false,
            desired,
            error: `wallpaper '${args.id}' not in the library (run wallpaper_scan first)`,
          }
        }
        desired.id = args.id
      }
      if (args.opacity !== undefined) desired.opacity = Math.max(0, Math.min(100, Math.round(args.opacity)))
      if (args.scope === 'page' || args.scope === 'main') desired.scope = args.scope
      deps.saveState({ ...state, desired })
      return { ok: true, desired }
    },
  })
}

/** The wallpaper-config tool (path overrides). */
export function wallpaperConfigTool(deps: WallpaperToolsDeps) {
  return defineTool({
    name: 'wallpaper_config',
    description: 'Point the Wallpaper Engine scanner at a non-default Steam root or Wallpaper Engine install directory. ' +
      'The override persists to the host state file and takes effect immediately. Triggers: wallpaper path, 壁纸目录, configure wallpaper engine.',
    parameters: {
      engineDir: { type: 'string', description: 'Wallpaper Engine install directory (contains projects/ and config/).' },
      steamDir: { type: 'string', description: 'Steam root directory (contains steamapps/libraryfolders.vdf).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          engineDir: { type: 'string' },
          steamDir: { type: 'string' },
          count: { type: 'integer' },
          error: { type: 'string' },
        },
      },
      render: (_args, value: { ok: boolean; engineDir?: string; steamDir?: string; count?: number; error?: string }) => {
        if (!value.ok) return text(`wallpaper_config failed: ${value.error ?? 'unknown error'}`)
        return text(`scanner configured (${value.count ?? 0} wallpapers)\nengineDir: ${value.engineDir ?? '-'}\nsteamDir: ${value.steamDir ?? '-'}`)
      },
    },
    async execute(args: { engineDir?: string; steamDir?: string }) {
      const state = deps.getState()
      const next = { ...state }
      if (typeof args.engineDir === 'string' && args.engineDir !== '') next.engineDir = args.engineDir
      if (typeof args.steamDir === 'string' && args.steamDir !== '') next.steamDir = args.steamDir
      if (next.engineDir === state.engineDir && next.steamDir === state.steamDir) {
        return { ok: false, error: 'nothing to change (pass engineDir and/or steamDir)' }
      }
      deps.saveState(next)
      deps.library.setConfigured({ engineDir: next.engineDir, steamDir: next.steamDir })
      const snapshot = await deps.library.scan(true)
      return {
        ok: true,
        engineDir: snapshot.engineDir,
        steamDir: snapshot.steamDir,
        count: snapshot.wallpapers.length,
      }
    },
  })
}
