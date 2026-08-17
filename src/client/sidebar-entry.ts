/**
 * Sidebar entry injection for 壁纸设计.
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into,
 * so — following the task-board / ssh precedent of DOM-level extension — the
 * entry row is injected right after the shell's New Session control (after the
 * whole family block, so sibling plugins keep a stable relative order). A
 * body-level MutationObserver re-places the row whenever a React re-render
 * displaces it (re-insertion happens in the same frame, before paint, so no
 * flicker); placement is idempotent and defensive, so a pathological shell
 * mutation can never surface as a page error.
 *
 * The row is plain DOM (no React tree) so it can never disturb the shell's
 * reconciliation; the panel it toggles is a separate React root rendered as a
 * fixed right-side drawer (see mount.tsx).
 * @module dsh-wallpaper/client/sidebar-entry
 */

import type { PanelController } from './controller.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-wallpaper-entry]'

/** Other family plugins' entry selectors (kept in stable relative order). */
const FAMILY_SELECTORS = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-wallpaper-entry]'

/** Inline icon (matches the shell's 16px nav-icon look): an image glyph. */
const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.6" cy="6.6" r="1.1"/><path d="M3.2 12l3.4-3.4 2.2 2.2 2-2 2.4 2.4"/></svg>'

/** The sidebar column (AppFrame grid item). */
function sidebarColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>('[class*="sidebarCol"]') ?? undefined
}

/**
 * The real sidebar nav root: the direct child of the column that owns the
 * nav content. Preferred in order: the logo-row owner (matches the family
 * plugins' anchor), then the owner of the New Session button, then the
 * column's first child, then the column itself. Resolved fresh on every
 * placement attempt, because early in boot the column may still be empty.
 */
function sidebarRoot(): HTMLElement | undefined {
  const column = sidebarColumn()
  if (column === undefined) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  if (logoOwner !== undefined && logoOwner !== null && logoOwner !== column) return logoOwner
  const button = column.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (button !== null) {
    let owner: HTMLElement = button
    while (owner.parentElement !== column && owner.parentElement !== null) {
      owner = owner.parentElement
    }
    return owner
  }
  return (column.firstElementChild as HTMLElement | undefined) ?? column
}

/** The New Session button: the sidebar's primary control. */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/** Build the entry row (a detached button; inserted once the shell is up). */
function createEntry(controller: PanelController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshWallpaperEntry = ''
  entry.className = 'wp-entry'
  entry.setAttribute('aria-label', '壁纸设计')
  entry.setAttribute('title', '壁纸设计 — 从 Wallpaper Engine 壁纸库设置页面背景')
  entry.innerHTML = '<span class="wp-entry-icon">' + ICON + '</span><span class="wp-entry-label">壁纸设计</span>'
  entry.addEventListener('click', () => { controller.toggle() })
  return entry
}

/** Insert the entry after the New Session control (or after the family block). */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement === root) return true
  // The New Session button may sit inside a tooltip wrapper (ui-primitives
  // Tooltip); climb to the direct child of root that OWNS it so the anchor
  // is always a root child — insertBefore would throw otherwise.
  let owner: HTMLElement = button
  while (owner.parentElement !== root && owner.parentElement !== null) {
    owner = owner.parentElement
  }
  const family = Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.matches(FAMILY_SELECTORS),
  )
  // wallpaper sits after the whole family block; when the block is empty,
  // right after the New Session control.
  let anchor: Element | null = family.length > 0
    ? (family[family.length - 1]?.nextElementSibling ?? null)
    : owner.nextElementSibling
  // Defensive: a stale anchor from a re-render race must never throw.
  if (anchor !== null && anchor.parentNode !== root) anchor = null
  root.insertBefore(entry, anchor)
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param controller - the panel controller the entry toggles.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(controller: PanelController): () => void {
  const entry = createEntry(controller)

  const tryPlace = (): void => {
    if (entry.isConnected && sidebarColumn() === undefined) {
      // The whole sidebar pane was torn down; detach the entry so it can be
      // re-inserted when a new pane mounts.
      entry.remove()
    }
    const root = sidebarRoot()
    if (root === undefined) return
    if (entry.parentElement === root) return
    // A pathological shell mutation must never surface as a page error; a
    // failed placement just waits for the next mutation to retry.
    try {
      placeEntry(root, entry)
    } catch {
      /* retried on the next mutation */
    }
  }

  // One body-level observer covers mount, whole-pane rebuilds, and the
  // self-heal case (a React re-render displacing the row mutates the DOM).
  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  // Reflect the panel's open state on the row (active highlight).
  const syncActive = (): void => {
    if (controller.getSnapshot().panelOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
  }
  const unsubscribe = controller.subscribe(syncActive)
  syncActive()

  tryPlace()

  return () => {
    waitObserver.disconnect()
    unsubscribe()
    entry.remove()
  }
}
