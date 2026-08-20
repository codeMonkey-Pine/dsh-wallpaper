/**
 * The /api/dsh-wallpaper route family: library status/list, rescan, path
 * overrides, the agent-set desired state, and the raw wallpaper asset file
 * server (with a loopback-only trust fence, a path-traversal guard, and Range
 * support so <video> seeking works). Every route mirrors dsh-ssh's fence:
 * LAN-exposed dsh web deployments must not serve local wallpaper files to
 * strangers.
 * @module dsh-wallpaper/routes
 */

import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { WallpaperLibrary } from './engine/library.ts'
import { API, type DesiredState, type HostState } from './protocol.ts'

/** Cap on JSON request bodies (path overrides and desired state are small). */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** MIME types for the wallpaper asset extensions WE ships. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mpd': 'application/dash+xml',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.glb': 'model/gltf-binary',
  '.obj': 'text/plain',
  '.mtl': 'text/plain',
}

/** Loopback literal check plus browser same-origin markers (mirrors dsh-ssh). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body (undefined when too large or unparsable). */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** URL query helper (first value, decoded). */
function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/** Validate a desired-state patch (unknown keys are ignored). */
function sanitizeDesiredPatch(body: Record<string, unknown> | undefined): Partial<DesiredState> {
  const patch: Partial<DesiredState> = {}
  if (body === undefined) return patch
  if (typeof body.id === 'string' && body.id !== '' && /^[A-Za-z0-9._-]+$/.test(body.id)) patch.id = body.id
  if (typeof body.opacity === 'number' && Number.isFinite(body.opacity)) {
    patch.opacity = Math.max(0, Math.min(100, Math.round(body.opacity)))
  }
  if (body.scope === 'page' || body.scope === 'main') patch.scope = body.scope
  return patch
}

/** Route family dependencies. */
export interface WallpaperRoutesDeps {
  library: WallpaperLibrary
  /** Read the current host state. */
  getState: () => HostState
  /** Persist a merged host state. */
  saveState: (state: HostState) => void
}

/**
 * Build every /api/dsh-wallpaper route (exact paths plus the raw prefix).
 * @param deps - library scanner and host state access.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(deps: WallpaperRoutesDeps): WebRoute[] {
  const { library } = deps

  /** Fence + method guard. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed: ${req.method}` })
      return false
    }
    return true
  }

  /** One snapshot response with the current dirs. */
  const snapshotJson = async (res: ServerResponse, force: boolean): Promise<void> => {
    const snapshot = await library.scan(force)
    writeJson(res, 200, snapshot)
  }

  const routes: WebRoute[] = [
    // ----------------------------------------------------------- status
    {
      kind: 'exact',
      path: API.status,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const snapshot = await library.scan(false)
        writeJson(res, 200, {
          engineDir: snapshot.engineDir,
          steamDir: snapshot.steamDir,
          libraryDirs: snapshot.libraryDirs,
          scanError: snapshot.scanError,
          scannedAt: snapshot.scannedAt,
          wallpaperCount: snapshot.wallpapers.length,
        })
      },
    },
    // ---------------------------------------------------------- library
    {
      kind: 'exact',
      path: API.library,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const url = new URL(req.url ?? '/', 'http://localhost')
        await snapshotJson(res, queryParam(url, 'refresh') === '1')
      },
    },
    // ---------------------------------------------------------- rescan
    {
      kind: 'exact',
      path: API.rescan,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        await snapshotJson(res, true)
      },
    },
    // ---------------------------------------------------------- config
    {
      kind: 'exact',
      path: API.config,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const state = deps.getState()
        const next = { ...state }
        if (typeof body.engineDir === 'string') next.engineDir = body.engineDir
        if (typeof body.steamDir === 'string') next.steamDir = body.steamDir
        deps.saveState(next)
        library.setConfigured({ engineDir: next.engineDir, steamDir: next.steamDir })
        await snapshotJson(res, true)
      },
    },
    // ----------------------------------------------------------- state
    {
      kind: 'exact',
      path: API.state,
      handler: async (req, res) => {
        const method = req.method ?? 'GET'
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (method === 'GET') {
          writeJson(res, 200, { desired: deps.getState().desired })
          return
        }
        if (method !== 'POST') {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
          return
        }
        const body = await readJsonBody(req)
        const state = deps.getState()
        const desired = { ...state.desired, ...sanitizeDesiredPatch(body) }
        deps.saveState({ ...state, desired })
        writeJson(res, 200, { desired })
      },
    },
    // -------------------------------------------------------------- raw
    {
      kind: 'prefix',
      path: API.raw,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const url = new URL(req.url ?? '/', 'http://localhost')
        const segments = url.pathname
          .slice(API.raw.length)
          .split('/')
          .filter(segment => segment !== '')
          .map(segment => safeDecode(segment))
        if (segments.length < 2 || segments[0] === undefined) {
          writeJson(res, 400, { error: 'expected /api/dsh-wallpaper/raw/<id>/<path>' })
          return
        }
        const id = segments[0]
        const relative = segments.slice(1).join('/')
        if (relative === '' || relative.includes('..') || relative.startsWith('/')) {
          writeJson(res, 400, { error: 'invalid asset path' })
          return
        }
        // Ensure a scan exists so the id resolves.
        const snapshot = await library.scan(false)
        if (!snapshot.wallpapers.some(entry => entry.id === id)) {
          writeJson(res, 404, { error: `wallpaper '${id}' not found` })
          return
        }
        const absolute = library.resolveRaw(id, relative)
        if (absolute === undefined) {
          writeJson(res, 404, { error: `asset '${relative}' not found` })
          return
        }
        serveFile(req, res, absolute, relative)
      },
    },
  ]

  return routes
}

/** URL-decode one path segment, tolerating malformed escapes. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Content type for one asset path. */
function contentTypeOf(path: string): string {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/** Whether an asset should be cached aggressively (media) or revalidated (html). */
function cacheControlOf(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.html' || extension === '.htm' || extension === '.json') return 'no-cache'
  return 'private, max-age=3600'
}

/** Serve one file with Range support (video seeking). */
function serveFile(req: IncomingMessage, res: ServerResponse, absolute: string, displayPath: string): void {
  let size: number
  try {
    size = statSync(absolute).size
  } catch {
    writeJson(res, 404, { error: `asset '${displayPath}' not found` })
    return
  }
  const contentType = contentTypeOf(absolute)
  const cacheControl = cacheControlOf(absolute)
  const range = req.headers.range

  if (range === undefined) {
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': String(size),
      'accept-ranges': 'bytes',
      'cache-control': cacheControl,
      'referrer-policy': 'no-referrer',
    })
    const stream = createReadStream(absolute)
    stream.on('error', () => { try { res.destroy() } catch { /* closed */ } })
    // When the client aborts (e.g. the video element seeks and re-requests),
    // destroy the read stream — otherwise the server keeps reading the whole
    // multi-hundred-MB file into a dead socket, saturating disk I/O and
    // stalling every other request (the "network timeout" on wallpaper switch).
    res.on('close', () => { if (!res.writableEnded) stream.destroy() })
    stream.pipe(res)
    return
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (match === null) {
    res.writeHead(416, { 'content-range': `bytes */${String(size)}` })
    res.end()
    return
  }
  // Resolve the byte range. `bytes=-N` is a SUFFIX request ("the last N
  // bytes") — video players use it to read the moov atom from the END of
  // large files; returning the first N bytes instead leaves the video stuck
  // at readyState 0 (black screen).
  let start: number
  let end: number
  if ((match[1] === '' || match[1] === undefined) && match[2] !== '' && match[2] !== undefined) {
    const suffix = Number(match[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = match[1] === '' || match[1] === undefined ? 0 : Number(match[1])
    end = match[2] === '' || match[2] === undefined ? size - 1 : Number(match[2])
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    res.writeHead(416, { 'content-range': `bytes */${String(size)}` })
    res.end()
    return
  }
  res.writeHead(206, {
    'content-type': contentType,
    'content-length': String(end - start + 1),
    'content-range': `bytes ${start}-${end}/${String(size)}`,
    'accept-ranges': 'bytes',
    'cache-control': cacheControl,
    'referrer-policy': 'no-referrer',
  })
  const stream = createReadStream(absolute, { start, end })
  stream.on('error', () => { try { res.destroy() } catch { /* closed */ } })
  res.on('close', () => { if (!res.writableEnded) stream.destroy() })
  stream.pipe(res)
}
