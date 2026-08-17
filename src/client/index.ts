/**
 * Browser-half entry for the dsh-wallpaper plugin — runs inside the dsh web
 * GUI. Mounts the stylesheet, the 壁纸设计 sidebar entry, the right-side design
 * drawer, and the page-background wallpaper layer. All DOM work degrades to a
 * logged warning on failure (an external plugin must never take the GUI
 * down).
 *
 * Export discipline: the /client surface carries what cordis loading needs
 * (apply / inject) plus types only — all value exports stay internal.
 * @module dsh-wallpaper/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { WallpaperApi } from './api.ts'
import { PanelController } from './controller.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { SettingsStore } from './state.ts'
import { injectStyles } from './styles.ts'
import { mountWallpaperUI } from './mount.tsx'

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots']

/**
 * Mount the wallpaper surfaces.
 * @param ctx - client root context (the slots service gate).
 */
export function apply(ctx: Context): void {
  const disposers: Array<() => void> = []
  try {
    disposers.push(injectStyles())
    const store = new SettingsStore()
    const controller = new PanelController()
    const api = new WallpaperApi()
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountWallpaperUI(store, api, controller))
  } catch (error) {
    // DOM failures degrade the wallpaper UI, never the GUI.
    console.warn('[dsh-wallpaper] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-wallpaper: ui mounts')
}
