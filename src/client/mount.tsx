/**
 * DOM mounting for the dsh-wallpaper UI: the wallpaper layer root and the
 * 壁纸设计 drawer root, both appended to <body> as fixed-position containers
 * (no shell column involved — the layer sits behind the app at z-index -1,
 * the drawer floats on the right edge at z-index 900). Failure policy: DOM
 * mounting problems are logged, never thrown — an external plugin must not
 * take the GUI down.
 * @module dsh-wallpaper/client/mount
 */

import { createRoot } from 'react-dom/client'
import type { WallpaperApi } from './api.ts'
import type { PanelController } from './controller.ts'
import type { SettingsStore } from './state.ts'
import { WallpaperLayer } from './WallpaperLayer.tsx'
import { WallpaperPanel } from './WallpaperPanel.tsx'

/** Stable container markers (for debugging and cleanup). */
export const LAYER_SELECTOR = '[data-dsh-wallpaper-layer]'
export const PANEL_SELECTOR = '[data-dsh-wallpaper-panel]'

/**
 * Mount the layer and the panel React trees into <body>.
 * @param store - the shared settings store.
 * @param api - the API client.
 * @param controller - the drawer open/close controller.
 * @returns disposer unmounting both trees and removing the containers.
 */
export function mountWallpaperUI(store: SettingsStore, api: WallpaperApi, controller: PanelController): () => void {
  const layerContainer = document.createElement('div')
  layerContainer.dataset.dshWallpaperLayer = ''
  const panelContainer = document.createElement('div')
  panelContainer.dataset.dshWallpaperPanel = ''

  document.body.appendChild(layerContainer)
  document.body.appendChild(panelContainer)

  const layerRoot = createRoot(layerContainer)
  const panelRoot = createRoot(panelContainer)
  layerRoot.render(<WallpaperLayer store={store} api={api} />)
  panelRoot.render(<WallpaperPanel store={store} api={api} controller={controller} />)

  return () => {
    layerRoot.unmount()
    panelRoot.unmount()
    layerContainer.remove()
    panelContainer.remove()
  }
}
