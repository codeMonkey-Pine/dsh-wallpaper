/**
 * dsh-wallpaper styles: one stylesheet injected into <head> at plugin mount.
 * Component classes are plain strings (prefixed `wp-`); colors and surfaces
 * ride the app's own theme tokens (--dsw-alias-*) so the panel matches the
 * current light/dark theme. The tag is removed on plugin dispose.
 * @module dsh-wallpaper/client/styles
 */

/** The stylesheet id (also the style-tag data attribute). */
export const STYLE_ID = 'dsh-wallpaper'

/** Full stylesheet text. */
export const STYLESHEET = `
/* ---- sidebar entry row ---- */
.wp-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-s-14);
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
}
.wp-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.wp-entry[data-active] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);
}
.wp-entry-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 16px;
  height: 16px;
}
.wp-entry-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- right-side design drawer ---- */
.wp-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
  display: flex;
  flex-direction: column;
  width: 372px;
  max-width: calc(100vw - 48px);
  background: var(--dsw-alias-bg-layer-2);
  border-left: 1px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-shadow-lv3);
  transform: translateX(100%);
  transition: transform 220ms var(--ds-ease-in-out);
  box-sizing: border-box;
}
.wp-drawer[data-open] {
  transform: translateX(0);
}
@media (prefers-reduced-motion: reduce) {
  .wp-drawer { transition: none; }
}
.wp-drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 14px 12px 18px;
  flex: none;
}
.wp-drawer-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font: var(--dsw-font-m-18);
  color: var(--dsw-alias-label-primary);
}
.wp-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}
.wp-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.wp-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---- sections and controls ---- */
.wp-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wp-section-title {
  margin: 0;
  font: var(--dsw-font-xs-strong-13);
  color: var(--dsw-alias-label-tertiary);
}
.wp-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}
.wp-label {
  flex: 1;
  min-width: 0;
  font: var(--dsw-font-s-14);
  color: var(--dsw-alias-label-primary);
}
.wp-value {
  flex: none;
  min-width: 40px;
  text-align: right;
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-tertiary);
}
.wp-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--dsw-alias-button-primary-fill);
}
.wp-select {
  flex: none;
  max-width: 160px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-13);
  cursor: pointer;
}
.wp-color {
  flex: none;
  width: 32px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.wp-radio-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.wp-radio {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-13);
  cursor: pointer;
}
.wp-radio[data-checked] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary);
}
.wp-switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
  padding: 0;
  transition: background 150ms var(--ds-ease-in-out);
}
.wp-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-static-neutral-00);
  transition: transform 150ms var(--ds-ease-in-out);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.wp-switch[data-on] {
  background: var(--dsw-alias-button-primary-fill);
}
.wp-switch[data-on]::after {
  transform: translateX(14px);
}

/* ---- wallpaper library grid ---- */
.wp-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary);
}
.wp-status-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
}
.wp-status-dot[data-error] {
  background: var(--dsw-alias-state-error-primary);
}
.wp-hint {
  margin: 0;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-tertiary);
  line-height: 18px;
  overflow-wrap: anywhere;
}
.wp-search {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-13);
  outline: none;
  box-sizing: border-box;
}
.wp-search:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.wp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wp-button {
  flex: none;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-13);
  cursor: pointer;
}
.wp-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.wp-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.wp-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.wp-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  overflow: hidden;
  text-align: left;
}
.wp-card[data-selected] {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}
.wp-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--dsw-alias-bg-layer-3);
  overflow: hidden;
}
.wp-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.wp-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
.wp-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  pointer-events: none;
}
.wp-badge-current {
  background: var(--dsw-alias-button-primary-fill);
}
.wp-card-title {
  padding: 0 6px 6px;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- wallpaper layer ---- */
.wp-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.wp-layer[data-click-through='false'] {
  pointer-events: auto;
}
.wp-media {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 600ms var(--ds-ease-in-out);
}
.wp-media[data-visible] {
  opacity: 1;
}
.wp-media[data-anim='none'] {
  transition: none;
}
@keyframes wp-slide-in {
  from { transform: translateX(3%); }
  to { transform: translateX(0); }
}
.wp-media[data-anim='slide'] {
  animation: wp-slide-in 600ms var(--ds-ease-in-out);
}
.wp-layer-inner {
  position: absolute;
  inset: 0;
}
.wp-media img,
.wp-media video {
  width: 100%;
  height: 100%;
  display: block;
}
.wp-media iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
.wp-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.wp-type-note {
  position: absolute;
  right: 10px;
  bottom: 10px;
  max-width: min(420px, calc(100% - 20px));
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  pointer-events: none;
}
.wp-empty-note {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-s-14);
  text-align: center;
  padding: 24px;
  box-sizing: border-box;
}
`

/** Inject the stylesheet once; returns the disposer removing the tag. */
export function injectStyles(): () => void {
  if (document.head.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) {
    return () => undefined
  }
  const tag = document.createElement('style')
  tag.dataset.plugin = STYLE_ID
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = STYLESHEET
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}
