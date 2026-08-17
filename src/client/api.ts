/**
 * Browser-side API client for the /api/dsh-wallpaper route family. Plain
 * same-origin fetch; the only data access path the panel and the layer use.
 * @module dsh-wallpaper/client/api
 */

import { API, type DesiredState, type LibrarySnapshot } from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class WallpaperApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WallpaperApiError'
  }
}

/** Parse a JSON response or throw a WallpaperApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new WallpaperApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${response.status}`
    throw new WallpaperApiError(message)
  }
  return body as T
}

/** The browser half's data entry point. */
export class WallpaperApi {
  async library(refresh = false): Promise<LibrarySnapshot> {
    const suffix = refresh ? '?refresh=1' : ''
    const response = await fetch(API.library + suffix)
    return readJson<LibrarySnapshot>(response)
  }

  async rescan(): Promise<LibrarySnapshot> {
    const response = await fetch(API.rescan, { method: 'POST' })
    return readJson<LibrarySnapshot>(response)
  }

  async status(): Promise<{
    engineDir?: string
    steamDir?: string
    libraryDirs: string[]
    scanError?: string
    scannedAt: number
    wallpaperCount: number
  }> {
    const response = await fetch(API.status)
    return readJson<{ engineDir?: string; steamDir?: string; libraryDirs: string[]; scanError?: string; scannedAt: number; wallpaperCount: number }>(response)
  }

  async setPaths(patch: { engineDir?: string; steamDir?: string }): Promise<LibrarySnapshot> {
    const response = await fetch(API.config, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return readJson<LibrarySnapshot>(response)
  }

  async desiredState(): Promise<DesiredState> {
    const response = await fetch(API.state)
    const body = await readJson<{ desired: DesiredState }>(response)
    return body.desired
  }

  async setDesired(patch: Partial<DesiredState>): Promise<DesiredState> {
    const response = await fetch(API.state, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const body = await readJson<{ desired: DesiredState }>(response)
    return body.desired
  }
}
