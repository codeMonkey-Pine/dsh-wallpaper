/**
 * Panel visibility controller for the 壁纸设计 drawer. A plain observable the
 * sidebar entry and the panel share (the family pattern: DOM-level extension,
 * no slot involvement).
 * @module dsh-wallpaper/client/controller
 */

export interface PanelControllerSnapshot {
  panelOpen: boolean
}

/** The drawer open/close controller. */
export class PanelController {
  private panelOpen = false
  private listeners = new Set<() => void>()

  getSnapshot(): PanelControllerSnapshot {
    return { panelOpen: this.panelOpen }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  toggle(): void {
    this.panelOpen = !this.panelOpen
    this.emit()
  }

  open(): void {
    if (this.panelOpen) return
    this.panelOpen = true
    this.emit()
  }

  close(): void {
    if (!this.panelOpen) return
    this.panelOpen = false
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
