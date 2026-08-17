/**
 * dsh-wallpaper — host half. Mounts the Wallpaper Engine library scanner
 * (Steam workshop 431960 + local projects), the /api/dsh-wallpaper route
 * family (library, rescan, path overrides, desired state, raw asset files
 * with Range support), the agent tools (wallpaper_scan / wallpaper_list /
 * wallpaper_set / wallpaper_config), and a system-prompt announcement. The
 * browser half (./client) renders the 壁纸设计 panel and the page background.
 * @module dsh-wallpaper
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { WallpaperLibrary } from './engine/library.ts'
import { loadState, saveState } from './engine/state.ts'
import { makeRoutes } from './routes.ts'
import { wallpaperConfigTool, wallpaperListTool, wallpaperScanTool, wallpaperSetTool } from './tools.ts'

/** Stable cordis plugin name. */
export const name = 'wallpaper'

/** Services required before the wallpaper surfaces can mount. */
export const inject = ['webServer', 'tools', 'systemPrompt']

/** Plugin config (plain interface — the loader passes config through unvalidated). */
export interface Config {
  /** When true (default), a system-prompt section announces the plugin and its tools. */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, tools, prompt section). */
  enabled?: boolean
}

/** Schema default, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULT_ANNOUNCE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const WALLPAPER_GUIDANCE = '本机已安装 dsh-wallpaper 插件（Wallpaper Engine 壁纸联动）：扫描本地 Wallpaper Engine 壁纸库（Steam 创意工坊 431960 + 本地 projects），把下载的壁纸设为 DSH Web GUI 的页面背景（图片 / 视频 / 网页壁纸按原样渲染，场景壁纸降级为预览图）。能力：wallpaper_scan 重新扫描壁纸库；wallpaper_list 列出壁纸（id / 标题 / 类型 / 来源 / 当前壁纸 / 分辨率）；wallpaper_set 把某张壁纸设为 GUI 背景（id / 不透明度 0-100 / 作用范围 page=整页 main=主内容区），浏览器下次加载时应用，用户可在「壁纸设计」面板覆盖；wallpaper_config 指定非默认的 Steam 根目录或 Wallpaper Engine 安装目录（覆盖持久化到 ~/.dsh/dsh-wallpaper.json）。GUI 侧「壁纸设计」面板支持不透明度、作用范围、填充模式、高斯模糊、暗角遮罩、帧率限制、失焦暂停、鼠标视差、点击穿透、多壁纸轮播与主题联动。限制：壁纸只作用于本机 GUI 页面（loopback-only），不改变 Windows 桌面壁纸；场景壁纸的粒子/特效渲染无法移植到网页，降级为预览图；视频壁纸直接播放原文件。用户提到「壁纸 / wallpaper / 壁纸设计」时即指本插件，请据此协作。'

/**
 * Mount the scanner, routes, tools, and announcement.
 * @param ctx - host plugin context carrying webServer/tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  const state = loadState()
  const library = new WallpaperLibrary({ engineDir: state.engineDir, steamDir: state.steamDir })

  const resolve = (): { announceToAgent: boolean; enabled: boolean } => ({
    announceToAgent: config?.announceToAgent ?? DEFAULT_ANNOUNCE,
    enabled: config?.enabled ?? true,
  })

  const routes = makeRoutes({
    library,
    getState: () => loadState(),
    saveState,
  })
  const tools = [
    wallpaperScanTool({ library, getState: () => loadState(), saveState }),
    wallpaperListTool({ library, getState: () => loadState(), saveState }),
    wallpaperSetTool({ library, getState: () => loadState(), saveState }),
    wallpaperConfigTool({ library, getState: () => loadState(), saveState }),
  ]

  let disposeSection: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined
  let disposeTools: (() => void) | undefined

  // Register (or drop) every surface to match the current source. Each group
  // is kept under one disposer: re-registering first tears the old one down
  // so duplicate-name registrations never throw.
  const sync = (): void => {
    if (disposeSection !== undefined) { disposeSection(); disposeSection = undefined }
    if (disposeRoutes !== undefined) { disposeRoutes(); disposeRoutes = undefined }
    if (disposeTools !== undefined) { disposeTools(); disposeTools = undefined }
    const value = resolve()
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-wallpaper',
        order: SECTION_ORDER,
        text: WALLPAPER_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-wallpaper: routes',
    )
    disposeTools = ctx.effect(
      () => {
        const disposers = tools.map(tool => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-wallpaper: tools',
    )
  }

  sync()
}
