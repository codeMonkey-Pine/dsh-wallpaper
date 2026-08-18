window.__ModuleLoader__.load({
	id: "dsh-wallpaper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/protocol.ts
		/**
		* Shared wire protocol between the dsh-wallpaper host half and the browser
		* half. Pure constants and types only — no Node or DOM imports, so the same
		* file is safe to bundle into the client.
		* @module dsh-wallpaper/protocol
		*/
		/** The /api/dsh-wallpaper route family. */
		const API = {
			/** GET — engine/steam dirs and scan errors. */
			status: "/api/dsh-wallpaper/status",
			/** GET — library snapshot (?refresh=1 forces a rescan). */
			library: "/api/dsh-wallpaper/library",
			/** POST — force a rescan, returns the fresh library. */
			rescan: "/api/dsh-wallpaper/rescan",
			/** POST — set engineDir/steamDir overrides, persists to the host state file. */
			config: "/api/dsh-wallpaper/config",
			/** GET/POST — the agent-set desired state (id/opacity/scope). */
			state: "/api/dsh-wallpaper/state",
			/** GET — raw wallpaper file: /api/dsh-wallpaper/raw/<id>/<relative path>. */
			raw: "/api/dsh-wallpaper/raw"
		};
		/** Default browser settings. */
		const DEFAULT_SETTINGS = {
			enabled: true,
			activeId: null,
			opacity: 70,
			scope: "main",
			fill: "cover",
			blur: 0,
			vignetteColor: "#000000",
			vignetteIntensity: 0,
			fps: "auto",
			pauseOnBlur: true,
			parallax: true,
			clickThrough: true,
			carouselEnabled: false,
			carouselInterval: 60,
			carouselAnimation: "fade",
			carouselIds: [],
			themeLink: true,
			sceneEnhance: true
		};
		/** localStorage key for the browser settings. */
		const SETTINGS_KEY = "dsh.wallpaper.v1";
		/** Build the raw-file URL for one wallpaper asset. */
		function rawUrl(id, relativePath) {
			const path = relativePath.split("/").map(encodeURIComponent).join("/");
			return `${API.raw}/${encodeURIComponent(id)}/${path}`;
		}
		//#endregion
		//#region src/client/api.ts
		/**
		* Browser-side API client for the /api/dsh-wallpaper route family. Plain
		* same-origin fetch; the only data access path the panel and the layer use.
		* @module dsh-wallpaper/client/api
		*/
		/** Error carrying the route's JSON error message. */
		var WallpaperApiError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "WallpaperApiError";
			}
		};
		/** Parse a JSON response or throw a WallpaperApiError. */
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new WallpaperApiError(`HTTP ${response.status}: invalid JSON response`);
			}
			if (!response.ok) throw new WallpaperApiError(typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
			return body;
		}
		/** The browser half's data entry point. */
		var WallpaperApi = class {
			async library(refresh = false) {
				const suffix = refresh ? "?refresh=1" : "";
				return readJson(await fetch(API.library + suffix));
			}
			async rescan() {
				return readJson(await fetch(API.rescan, { method: "POST" }));
			}
			async status() {
				return readJson(await fetch(API.status));
			}
			async setPaths(patch) {
				return readJson(await fetch(API.config, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch)
				}));
			}
			async desiredState() {
				return (await readJson(await fetch(API.state))).desired;
			}
			async setDesired(patch) {
				return (await readJson(await fetch(API.state, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch)
				}))).desired;
			}
		};
		//#endregion
		//#region src/client/controller.ts
		/** The drawer open/close controller. */
		var PanelController = class {
			panelOpen = false;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return { panelOpen: this.panelOpen };
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			toggle() {
				this.panelOpen = !this.panelOpen;
				this.emit();
			}
			open() {
				if (this.panelOpen) return;
				this.panelOpen = true;
				this.emit();
			}
			close() {
				if (!this.panelOpen) return;
				this.panelOpen = false;
				this.emit();
			}
			emit() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/sidebar-entry.ts
		/** Other family plugins' entry selectors (kept in stable relative order). */
		const FAMILY_SELECTORS = "[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-wallpaper-entry]";
		/** The sidebar column (AppFrame grid item). */
		function sidebarColumn() {
			return document.querySelector("[class*=\"sidebarCol\"]") ?? void 0;
		}
		/**
		* The real sidebar nav root: the direct child of the column that owns the
		* nav content. Preferred in order: the logo-row owner (matches the family
		* plugins' anchor), then the owner of the New Session button, then the
		* column's first child, then the column itself. Resolved fresh on every
		* placement attempt, because early in boot the column may still be empty.
		*/
		function sidebarRoot() {
			const column = sidebarColumn();
			if (column === void 0) return void 0;
			const logoOwner = column.querySelector("[class*=\"logoRow\"]")?.parentElement;
			if (logoOwner !== void 0 && logoOwner !== null && logoOwner !== column) return logoOwner;
			const button = column.querySelector("button[class*=\"newSession\"]");
			if (button !== null) {
				let owner = button;
				while (owner.parentElement !== column && owner.parentElement !== null) owner = owner.parentElement;
				return owner;
			}
			return column.firstElementChild ?? column;
		}
		/** The New Session button: the sidebar's primary control. */
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** Build the entry row (a detached button; inserted once the shell is up). */
		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshWallpaperEntry = "";
			entry.className = "wp-entry";
			entry.setAttribute("aria-label", "壁纸设计");
			entry.setAttribute("title", "壁纸设计 — 从 Wallpaper Engine 壁纸库设置页面背景");
			entry.innerHTML = "<span class=\"wp-entry-icon\"><svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"2\" y=\"3\" width=\"12\" height=\"10\" rx=\"1.5\"/><circle cx=\"5.6\" cy=\"6.6\" r=\"1.1\"/><path d=\"M3.2 12l3.4-3.4 2.2 2.2 2-2 2.4 2.4\"/></svg></span><span class=\"wp-entry-label\">壁纸设计</span>";
			entry.addEventListener("click", () => {
				controller.toggle();
			});
			return entry;
		}
		/** Insert the entry after the New Session control (or after the family block). */
		function placeEntry(root, entry) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement === root) return true;
			let owner = button;
			while (owner.parentElement !== root && owner.parentElement !== null) owner = owner.parentElement;
			const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches(FAMILY_SELECTORS));
			let anchor = family.length > 0 ? family[family.length - 1]?.nextElementSibling ?? null : owner.nextElementSibling;
			if (anchor !== null && anchor.parentNode !== root) anchor = null;
			root.insertBefore(entry, anchor);
			return true;
		}
		/**
		* Mount the sidebar entry, waiting for the shell to render and self-healing
		* on later React re-renders.
		* @param controller - the panel controller the entry toggles.
		* @returns disposer removing the entry and its observers.
		*/
		function mountSidebarEntry(controller) {
			const entry = createEntry(controller);
			const tryPlace = () => {
				if (entry.isConnected && sidebarColumn() === void 0) entry.remove();
				const root = sidebarRoot();
				if (root === void 0) return;
				if (entry.parentElement === root) return;
				try {
					placeEntry(root, entry);
				} catch {}
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const syncActive = () => {
				if (controller.getSnapshot().panelOpen) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = controller.subscribe(syncActive);
			syncActive();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				unsubscribe();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/state.ts
		/**
		* Browser-side settings store: the wallpaper settings persisted to
		* localStorage (`dsh.wallpaper.v1`), with host-desired-state merging on
		* boot. A tiny subscribe/getSnapshot/update class — no framework machinery,
		* so both the panel React tree and the layer React tree read the same source.
		* @module dsh-wallpaper/client/state
		*/
		/** Merge a partial settings object with defaults, clamping ranges. */
		function sanitize(patch) {
			const merged = {
				...DEFAULT_SETTINGS,
				...patch
			};
			merged.opacity = Math.max(0, Math.min(100, Math.round(Number.isFinite(merged.opacity) ? merged.opacity : DEFAULT_SETTINGS.opacity)));
			merged.blur = Math.max(0, Math.min(20, Math.round(Number.isFinite(merged.blur) ? merged.blur : DEFAULT_SETTINGS.blur)));
			merged.vignetteIntensity = Math.max(0, Math.min(100, Math.round(Number.isFinite(merged.vignetteIntensity) ? merged.vignetteIntensity : DEFAULT_SETTINGS.vignetteIntensity)));
			merged.carouselInterval = Math.max(5, Math.min(3600, Math.round(Number.isFinite(merged.carouselInterval) ? merged.carouselInterval : DEFAULT_SETTINGS.carouselInterval)));
			if (merged.scope !== "page" && merged.scope !== "main") merged.scope = DEFAULT_SETTINGS.scope;
			if (merged.fill !== "cover" && merged.fill !== "contain" && merged.fill !== "stretch") merged.fill = DEFAULT_SETTINGS.fill;
			if (merged.fps !== "auto" && merged.fps !== 60 && merged.fps !== 30 && merged.fps !== 10) merged.fps = DEFAULT_SETTINGS.fps;
			if (merged.carouselAnimation !== "fade" && merged.carouselAnimation !== "slide" && merged.carouselAnimation !== "none") merged.carouselAnimation = DEFAULT_SETTINGS.carouselAnimation;
			if (!Array.isArray(merged.carouselIds)) merged.carouselIds = [];
			if (!/^#[0-9a-fA-F]{6}$/.test(merged.vignetteColor)) merged.vignetteColor = DEFAULT_SETTINGS.vignetteColor;
			return merged;
		}
		/** Load settings from localStorage (invalid JSON falls back to defaults). */
		function loadPersisted() {
			try {
				const raw = localStorage.getItem(SETTINGS_KEY);
				if (raw === null) return { ...DEFAULT_SETTINGS };
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SETTINGS };
				return sanitize(parsed);
			} catch {
				return { ...DEFAULT_SETTINGS };
			}
		}
		/** The settings store. */
		var SettingsStore = class {
			settings;
			listeners = /* @__PURE__ */ new Set();
			/** True once the host desired state has been merged on boot. */
			hostMerged = false;
			constructor() {
				this.settings = loadPersisted();
			}
			getSnapshot() {
				return this.settings;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			persist() {
				try {
					localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
				} catch {}
				for (const listener of this.listeners) listener();
			}
			update(patch) {
				this.settings = sanitize({
					...this.settings,
					...patch
				});
				this.persist();
			}
			/** Merge the host desired state (agent channel) on boot; user picks win later. */
			mergeDesired(desired) {
				if (this.hostMerged) return;
				this.hostMerged = true;
				const patch = {};
				if (desired.id !== void 0 && this.settings.activeId === null) patch.activeId = desired.id;
				if (desired.opacity !== void 0 && this.settings.opacity === DEFAULT_SETTINGS.opacity) patch.opacity = desired.opacity;
				if (desired.scope !== void 0 && this.settings.scope === DEFAULT_SETTINGS.scope) patch.scope = desired.scope;
				if (Object.keys(patch).length === 0) return;
				this.settings = sanitize({
					...this.settings,
					...patch
				});
				this.persist();
			}
			/** The effective carousel playlist: the saved ids that exist, or the active wallpaper. */
			playlist(knownIds) {
				const saved = this.settings.carouselIds.filter((id) => knownIds.has(id));
				if (saved.length > 0) return saved;
				if (this.settings.activeId !== null && knownIds.has(this.settings.activeId)) return [this.settings.activeId];
				return [];
			}
		};
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-wallpaper styles: one stylesheet injected into <head> at plugin mount.
		* Component classes are plain strings (prefixed `wp-`); colors and surfaces
		* ride the app's own theme tokens (--dsw-alias-*) so the panel matches the
		* current light/dark theme. The tag is removed on plugin dispose.
		* @module dsh-wallpaper/client/styles
		*/
		/** The stylesheet id (also the style-tag data attribute). */
		const STYLE_ID = "dsh-wallpaper";
		/** Full stylesheet text. */
		const STYLESHEET = `
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
`;
		/** Inject the stylesheet once; returns the disposer removing the tag. */
		function injectStyles() {
			if (document.head.querySelector(`style[data-plugin-css="dsh-wallpaper"]`) !== null) return () => void 0;
			const tag = document.createElement("style");
			tag.dataset.plugin = STYLE_ID;
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = STYLESHEET;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}
		//#endregion
		//#region src/client/WallpaperLayer.tsx
		/**
		* The page-background wallpaper layer: a fixed, full-viewport element behind
		* the app (z-index -1) that renders the active wallpaper the way Wallpaper
		* Engine does — images cover, videos autoplay muted loop, web wallpapers run
		* their own index.html in an iframe (with the WE query params ws/fps/
		* resolution), and scene wallpapers degrade to their preview image. Applies
		* the settings (opacity, scope, fill, blur, vignette, fps, parallax,
		* click-through, carousel, theme linkage) and owns the transparency overrides
		* that reveal the wallpaper behind the app's own background.
		* @module dsh-wallpaper/client/WallpaperLayer
		*/
		/** Crossfade duration (matches the .wp-media transition). */
		const FADE_MS = 600;
		/** The parallax scale factor (media is zoomed by this much when parallax is on). */
		const PARALLAX_SCALE = 1.08;
		/** Scene-enhance pipeline: extra blur, opacity multiplier, and vignette alpha. */
		const SCENE_ENHANCE_BLUR = 4;
		const SCENE_ENHANCE_OPACITY = .85;
		const SCENE_ENHANCE_VIGNETTE = "radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.35) 100%)";
		/**
		* Canvas-backed video renderer: the source <video> plays hidden and every new
		* frame is copied into a <canvas> that carries the CSS filter. Chromium drops
		* blur/drop-shadow filters on a playing <video> whenever a new frame is
		* composited (crbug.com/40123694), so a canvas raster — an ordinary layer, not
		* the video compositor — is the only reliable way to blur video wallpaper
		* frames. The canvas is a replaced element, so object-fit still crops it; the
		* hidden video keeps playback (autoplay, pause-on-blur) in one place.
		*/
		function VideoMedia(props) {
			const videoRef = (0, react.useRef)(null);
			const canvasRef = (0, react.useRef)(null);
			const rafRef = (0, react.useRef)(0);
			const lastTimeRef = (0, react.useRef)(-1);
			(0, react.useEffect)(() => {
				const video = videoRef.current;
				const canvas = canvasRef.current;
				if (video === null || canvas === null) return;
				const context = canvas.getContext("2d");
				if (context === null) return;
				const draw = () => {
					rafRef.current = requestAnimationFrame(draw);
					if (video.readyState < 2 || video.videoWidth === 0) return;
					const width = video.videoWidth;
					const height = video.videoHeight;
					if (canvas.width !== width || canvas.height !== height) {
						canvas.width = width;
						canvas.height = height;
					}
					if (video.currentTime === lastTimeRef.current) return;
					lastTimeRef.current = video.currentTime;
					context.drawImage(video, 0, 0, width, height);
				};
				rafRef.current = requestAnimationFrame(draw);
				return () => cancelAnimationFrame(rafRef.current);
			}, []);
			return react.default.createElement(react.default.Fragment, null, react.default.createElement("canvas", {
				ref: canvasRef,
				style: props.style
			}), react.default.createElement("video", {
				ref: (node) => {
					videoRef.current = node;
					if (props.onVideoMount !== void 0) props.onVideoMount(node);
				},
				src: props.url,
				autoPlay: true,
				muted: true,
				loop: true,
				playsInline: true,
				style: { display: "none" }
			}));
		}
		/** One wallpaper media element: image / video / web iframe / scene preview. */
		function MediaElement(props) {
			const { entry, settings } = props;
			const fill = settings.fill;
			const isScene = entry.type === "scene";
			const enhanced = isScene && settings.sceneEnhance;
			const objectFit = isScene ? "cover" : fill === "stretch" ? "fill" : fill;
			const filters = [];
			const totalBlur = settings.blur + (enhanced ? SCENE_ENHANCE_BLUR : 0);
			if (totalBlur > 0) filters.push(`blur(${totalBlur}px)`);
			const mediaStyle = {
				width: "100%",
				height: "100%",
				display: "block",
				opacity: settings.opacity / 100 * (enhanced ? SCENE_ENHANCE_OPACITY : 1),
				filter: filters.length > 0 ? filters.join(" ") : void 0,
				transform: settings.parallax ? `scale(${PARALLAX_SCALE})` : void 0
			};
			let media;
			const mediaUrl = rawUrl(entry.id, entry.file);
			if (entry.type === "video") media = totalBlur > 0 ? react.default.createElement(VideoMedia, {
				url: mediaUrl,
				style: {
					...mediaStyle,
					objectFit
				},
				onVideoMount: props.onVideoMount
			}) : react.default.createElement("video", {
				src: mediaUrl,
				ref: props.onVideoMount,
				autoPlay: true,
				muted: true,
				loop: true,
				playsInline: true,
				style: {
					...mediaStyle,
					objectFit
				}
			});
			else if (entry.type === "web") {
				const query = [];
				if (entry.width !== void 0 && entry.height !== void 0) query.push(`resolution=${entry.width}x${entry.height}`);
				if (entry.fps !== void 0) query.push(`fps=${entry.fps}`);
				if (entry.width !== void 0) query.push(`ws=${entry.width}`);
				const url = mediaUrl + (query.length > 0 ? `?${query.join("&")}` : "");
				media = react.default.createElement("iframe", {
					src: url,
					sandbox: "allow-scripts allow-same-origin",
					allow: "autoplay",
					title: entry.title,
					style: {
						...mediaStyle,
						border: 0
					}
				});
			} else {
				const url = isScene ? entry.preview !== "" ? rawUrl(entry.id, entry.preview) : "" : mediaUrl;
				media = react.default.createElement("img", {
					src: url,
					alt: entry.title,
					draggable: false,
					style: {
						...mediaStyle,
						objectFit,
						objectPosition: "center"
					}
				});
			}
			const note = entry.type === "scene" ? "该壁纸为场景类型，浏览器暂不支持动态渲染，已显示为静态预览" : void 0;
			return react.default.createElement("div", {
				className: "wp-media",
				"data-visible": props.visible ? "" : void 0,
				"data-anim": props.anim
			}, media, note !== void 0 ? react.default.createElement("div", { className: "wp-type-note" }, note) : null);
		}
		/** rAF-based animation loop throttled to a target fps. */
		function useFpsLoop(callback, fps) {
			const callbackRef = (0, react.useRef)(callback);
			callbackRef.current = callback;
			(0, react.useEffect)(() => {
				const intervalMs = 1e3 / (fps === "auto" ? 60 : fps);
				let raf = 0;
				let last = 0;
				const tick = (now) => {
					if (now - last >= intervalMs) {
						last = now;
						callbackRef.current(now);
					}
					raf = requestAnimationFrame(tick);
				};
				raf = requestAnimationFrame(tick);
				return () => cancelAnimationFrame(raf);
			}, [fps]);
		}
		/** Theme detection: dark when the app sets data-ds-dark-theme on body. */
		function isDarkTheme() {
			return document.body.dataset.dsDarkTheme !== void 0;
		}
		/** The wallpaper layer root component. */
		function WallpaperLayer(props) {
			const { store, api } = props;
			const [settings, setSettings] = (0, react.useState)(() => store.getSnapshot());
			const [library, setLibrary] = (0, react.useState)(null);
			const [libraryError, setLibraryError] = (0, react.useState)(null);
			const [displayId, setDisplayId] = (0, react.useState)(null);
			const [previousId, setPreviousId] = (0, react.useState)(null);
			const [carouselIndex, setCarouselIndex] = (0, react.useState)(0);
			const [clipPath, setClipPath] = (0, react.useState)(null);
			const layerRef = (0, react.useRef)(null);
			const mediaRef = (0, react.useRef)(null);
			const playlistRef = (0, react.useRef)([]);
			const darkRef = (0, react.useRef)(isDarkTheme());
			const videoRefs = (0, react.useRef)(/* @__PURE__ */ new Set());
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					try {
						const snapshot = await api.library(false);
						if (!alive) return;
						setLibrary(snapshot);
						const desired = await api.desiredState().catch(() => void 0);
						if (!alive) return;
						if (desired !== void 0) store.mergeDesired(desired);
					} catch (error) {
						if (!alive) return;
						setLibraryError(error instanceof Error ? error.message : String(error));
					}
				})();
				const unsubscribe = store.subscribe(() => setSettings(store.getSnapshot()));
				return () => {
					alive = false;
					unsubscribe();
				};
			}, [api, store]);
			const knownIds = (0, react.useCallback)(() => {
				const ids = /* @__PURE__ */ new Set();
				for (const entry of library?.wallpapers ?? []) ids.add(entry.id);
				return ids;
			}, [library]);
			const entryOf = (0, react.useCallback)((id) => {
				if (id === null) return void 0;
				return library?.wallpapers.find((entry) => entry.id === id);
			}, [library]);
			(0, react.useEffect)(() => {
				playlistRef.current = store.playlist(knownIds());
				setCarouselIndex(0);
			}, [
				settings.carouselIds,
				settings.carouselEnabled,
				settings.activeId,
				knownIds,
				store
			]);
			const carouselActive = settings.carouselEnabled && playlistRef.current.length > 1;
			const effectiveId = carouselActive ? playlistRef.current[carouselIndex] ?? null : settings.activeId;
			(0, react.useEffect)(() => {
				if (!carouselActive) return;
				const handle = window.setInterval(() => {
					const playlist = playlistRef.current;
					if (playlist.length <= 1) return;
					setCarouselIndex((index) => (index + 1) % playlist.length);
				}, Math.max(5, settings.carouselInterval) * 1e3);
				return () => window.clearInterval(handle);
			}, [carouselActive, settings.carouselInterval]);
			(0, react.useEffect)(() => {
				if (effectiveId === displayId) return;
				if (displayId !== null && effectiveId !== null) setPreviousId(displayId);
				setDisplayId(effectiveId);
				if (effectiveId === null) setPreviousId(null);
				const handle = window.setTimeout(() => setPreviousId(null), FADE_MS);
				return () => window.clearTimeout(handle);
			}, [effectiveId, displayId]);
			const currentEntry = entryOf(displayId);
			const previousEntry = entryOf(previousId);
			(0, react.useEffect)(() => {
				const overrides = [];
				const applied = /* @__PURE__ */ new Map();
				const apply = (element, property, value) => {
					const props = applied.get(element);
					if (props !== void 0 && props.has(property)) return;
					if (props === void 0) applied.set(element, new Set([property]));
					else props.add(property);
					const original = element.style.getPropertyValue(property);
					if (original !== "") overrides.push({
						element,
						property,
						value: original
					});
					element.style.setProperty(property, value);
				};
				const restore = () => {
					for (const item of overrides.splice(0)) item.element.style.setProperty(item.property, item.value);
				};
				if (!settings.enabled) {
					restore();
					setClipPath(null);
					return;
				}
				const updateClip = () => {
					const center = document.querySelector("[class*=\"centerCol\"]");
					if (settings.scope === "page") {
						apply(document.body, "--dsw-alias-bg-base", "transparent");
						apply(document.body, "--dsw-specific-sidebar-fill", "transparent");
					} else {
						const frame = center?.parentElement;
						if (frame !== null && frame !== void 0) apply(frame, "--dsw-alias-bg-base", "transparent");
					}
					if (settings.scope !== "main" || center === null) {
						setClipPath(null);
						return;
					}
					const rect = center.getBoundingClientRect();
					const right = window.innerWidth - rect.right;
					const bottom = window.innerHeight - rect.bottom;
					setClipPath(`inset(${rect.top}px ${right}px ${bottom}px ${rect.left}px)`);
				};
				updateClip();
				const handle = window.setInterval(updateClip, 500);
				window.addEventListener("resize", updateClip);
				return () => {
					window.clearInterval(handle);
					window.removeEventListener("resize", updateClip);
					restore();
					setClipPath(null);
				};
			}, [settings.enabled, settings.scope]);
			const mouseTarget = (0, react.useRef)({
				x: 0,
				y: 0
			});
			const parallaxRef = (0, react.useRef)({
				x: 0,
				y: 0
			});
			const [parallaxOffset, setParallaxOffset] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!settings.parallax) {
					setParallaxOffset(null);
					return;
				}
				const onMove = (event) => {
					mouseTarget.current = {
						x: event.clientX / window.innerWidth * 2 - 1,
						y: event.clientY / window.innerHeight * 2 - 1
					};
				};
				window.addEventListener("mousemove", onMove);
				return () => window.removeEventListener("mousemove", onMove);
			}, [settings.parallax]);
			useFpsLoop(() => {
				if (!settings.parallax) return;
				const target = mouseTarget.current;
				const current = parallaxRef.current;
				const nextX = current.x + (target.x - current.x) * .08;
				const nextY = current.y + (target.y - current.y) * .08;
				parallaxRef.current = {
					x: nextX,
					y: nextY
				};
				setParallaxOffset({
					x: Math.round(nextX * 14 * 100) / 100,
					y: Math.round(nextY * 14 * 100) / 100
				});
			}, settings.fps);
			const captureVideo = (0, react.useCallback)((video) => {
				if (video !== null) videoRefs.current.add(video);
			}, []);
			(0, react.useEffect)(() => {
				const onVisibility = () => {
					const hidden = document.hidden;
					for (const video of videoRefs.current) if (hidden && settings.pauseOnBlur) try {
						video.pause();
					} catch {}
					else if (!hidden) video.play().catch(() => void 0);
				};
				document.addEventListener("visibilitychange", onVisibility);
				return () => document.removeEventListener("visibilitychange", onVisibility);
			}, [settings.pauseOnBlur]);
			(0, react.useEffect)(() => {
				if (!settings.themeLink) return;
				const observer = new MutationObserver(() => {
					const dark = isDarkTheme();
					if (dark !== darkRef.current) {
						darkRef.current = dark;
						setSettings(store.getSnapshot());
					}
				});
				observer.observe(document.body, {
					attributes: true,
					attributeFilter: ["data-ds-dark-theme"]
				});
				return () => observer.disconnect();
			}, [settings.themeLink, store]);
			const vignetteColor = settings.themeLink ? darkRef.current ? "#000000" : "#ffffff" : settings.vignetteColor;
			const vignette = settings.vignetteIntensity > 0 ? `radial-gradient(ellipse at center, transparent ${Math.max(20, 60 - settings.vignetteIntensity / 2)}%, ${vignetteColor} 100%)` : "none";
			const vignetteOpacity = settings.vignetteIntensity / 100;
			const sceneEnhanced = currentEntry?.type === "scene" && settings.sceneEnhance;
			const layerStyle = { clipPath: clipPath ?? void 0 };
			const parallaxStyle = settings.parallax && parallaxOffset !== null ? { transform: `translate(${parallaxOffset.x}px, ${parallaxOffset.y}px)` } : void 0;
			if (!settings.enabled || effectiveId === null) return react.default.createElement("div", {
				ref: layerRef,
				className: "wp-layer",
				style: layerStyle
			});
			const elements = [];
			if (previousEntry !== void 0 && previousEntry.id !== displayId) elements.push(react.default.createElement(MediaElement, {
				key: `prev-${previousEntry.id}`,
				entry: previousEntry,
				settings,
				visible: false,
				anim: "fade"
			}));
			if (currentEntry !== void 0) elements.push(react.default.createElement(MediaElement, {
				key: `cur-${currentEntry.id}`,
				entry: currentEntry,
				settings,
				visible: true,
				anim: settings.carouselAnimation,
				onVideoMount: captureVideo
			}));
			else if (libraryError === null && library !== null) elements.push(react.default.createElement("div", {
				className: "wp-empty-note",
				key: "empty"
			}, "未找到壁纸：请在「壁纸设计」面板选择一张"));
			return react.default.createElement("div", {
				ref: layerRef,
				className: "wp-layer",
				"data-click-through": settings.clickThrough ? "true" : "false",
				style: layerStyle
			}, react.default.createElement("div", {
				ref: mediaRef,
				className: "wp-layer-inner",
				style: parallaxStyle
			}, ...elements), sceneEnhanced ? react.default.createElement("div", {
				className: "wp-scrim",
				style: { background: SCENE_ENHANCE_VIGNETTE }
			}) : null, react.default.createElement("div", {
				className: "wp-scrim",
				style: {
					background: vignette,
					opacity: vignetteOpacity
				}
			}));
		}
		//#endregion
		//#region src/client/WallpaperPanel.tsx
		/**
		* The 壁纸设计 panel: the right-side drawer UI for picking a Wallpaper Engine
		* wallpaper and tuning every rendering option (opacity, scope, fill, blur,
		* vignette, fps, pause-on-blur, parallax, click-through, carousel, theme
		* linkage) plus the library source status and path overrides.
		* @module dsh-wallpaper/client/WallpaperPanel
		*/
		/** Subscribe a component to the settings store. */
		function useSettings(store) {
			const [settings, setSettings] = (0, react.useState)(() => store.getSnapshot());
			(0, react.useEffect)(() => store.subscribe(() => setSettings(store.getSnapshot())), [store]);
			return settings;
		}
		/** Type badge label (scene wallpapers are visibly marked as static previews). */
		const TYPE_LABEL = {
			scene: "场景·预览",
			video: "视频",
			web: "网页",
			image: "图片"
		};
		/** One wallpaper card. */
		function WallpaperCard(props) {
			const { entry, selected, carouselMember, carouselMode, onPick } = props;
			const preview = entry.preview !== "" ? rawUrl(entry.id, entry.preview) : entry.type === "image" && entry.file !== "" ? rawUrl(entry.id, entry.file) : null;
			const badge = carouselMode && carouselMember ? "轮播" : entry.current ? "当前" : TYPE_LABEL[entry.type];
			const badgeClass = entry.current ? "wp-badge wp-badge-current" : "wp-badge";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "wp-card",
				"data-selected": selected ? "" : void 0,
				onClick: onPick,
				title: entry.title,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "wp-thumb",
					children: [preview !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: preview,
						alt: entry.title,
						loading: "lazy",
						draggable: false
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "wp-thumb-empty",
						children: TYPE_LABEL[entry.type]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: badgeClass,
						children: badge
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "wp-card-title",
					children: entry.title
				})]
			});
		}
		/** One labeled control row with a switch. */
		function SwitchRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wp-control-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "wp-label",
					children: props.label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "wp-switch",
					"data-on": props.checked ? "" : void 0,
					"aria-pressed": props.checked,
					onClick: () => props.onChange(!props.checked)
				})]
			});
		}
		/** The panel root. */
		function WallpaperPanel(props) {
			const { store, api, controller } = props;
			const settings = useSettings(store);
			const [panelOpen, setPanelOpen] = (0, react.useState)(() => controller.getSnapshot().panelOpen);
			const [library, setLibrary] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [engineDir, setEngineDir] = (0, react.useState)("");
			const [steamDir, setSteamDir] = (0, react.useState)("");
			(0, react.useEffect)(() => controller.subscribe(() => setPanelOpen(controller.getSnapshot().panelOpen)), [controller]);
			const load = (0, react.useCallback)(async (force) => {
				setLoading(true);
				setError(null);
				try {
					const snapshot = await api.library(force);
					setLibrary(snapshot);
					setEngineDir(snapshot.engineDir ?? "");
					setSteamDir(snapshot.steamDir ?? "");
				} catch (loadError) {
					setError(loadError instanceof Error ? loadError.message : String(loadError));
				} finally {
					setLoading(false);
				}
			}, [api]);
			(0, react.useEffect)(() => {
				load(false);
			}, [load]);
			const entries = (0, react.useMemo)(() => {
				const list = library?.wallpapers ?? [];
				const trimmed = query.trim().toLowerCase();
				if (trimmed === "") return list;
				return list.filter((entry) => entry.title.toLowerCase().includes(trimmed) || entry.id.toLowerCase().includes(trimmed) || entry.tags.some((tag) => tag.toLowerCase().includes(trimmed)));
			}, [library, query]);
			const carouselMode = settings.carouselEnabled;
			const inCarousel = (id) => settings.carouselIds.includes(id);
			const selectedOf = (id) => carouselMode ? inCarousel(id) : settings.activeId === id;
			const onPick = (entry) => {
				if (carouselMode) {
					const next = inCarousel(entry.id) ? settings.carouselIds.filter((id) => id !== entry.id) : [...settings.carouselIds, entry.id];
					store.update({ carouselIds: next });
					if (settings.activeId === null) store.update({ activeId: entry.id });
				} else store.update({ activeId: entry.id });
			};
			const savePaths = async () => {
				setLoading(true);
				setError(null);
				try {
					const snapshot = await api.setPaths({
						engineDir: engineDir.trim() === "" ? "" : engineDir.trim(),
						steamDir: steamDir.trim() === "" ? "" : steamDir.trim()
					});
					setLibrary(snapshot);
					setEngineDir(snapshot.engineDir ?? "");
					setSteamDir(snapshot.steamDir ?? "");
				} catch (pathError) {
					setError(pathError instanceof Error ? pathError.message : String(pathError));
				} finally {
					setLoading(false);
				}
			};
			const source = library ? library.wallpapers.length > 0 ? `已发现 ${library.wallpapers.length} 张壁纸` : library.scanError ?? "未发现壁纸（请检查路径）" : "扫描中…";
			const activeEntry = library?.wallpapers.find((entry) => entry.id === settings.activeId);
			const sceneNote = settings.enabled && activeEntry?.type === "scene" ? "该壁纸为场景类型，浏览器暂不支持动态渲染，已显示为静态预览" : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wp-drawer",
				"data-open": panelOpen ? "" : void 0,
				role: "dialog",
				"aria-label": "壁纸设计",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "wp-drawer-header",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "wp-drawer-title",
						children: "壁纸设计"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "wp-close",
						"aria-label": "关闭",
						onClick: () => controller.close(),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							viewBox: "0 0 16 16",
							width: "16",
							height: "16",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.5",
							strokeLinecap: "round",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 4l8 8M12 4l-8 8" })
						})
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "wp-drawer-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "wp-section-title",
									children: "壁纸库"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-status",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "wp-status-dot",
										"data-error": error !== null ? "" : void 0
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error ?? source })]
								}),
								library?.engineDir === void 0 && error === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "wp-hint",
									children: "未找到 Wallpaper Engine：请在下方指定 Steam 根目录或 WE 安装目录（例如 C:\\Program Files (x86)\\Steam）。"
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-toolbar",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "wp-search",
										type: "search",
										placeholder: "搜索壁纸…",
										value: query,
										onChange: (event) => setQuery(event.target.value)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "wp-button",
										disabled: loading,
										onClick: () => void load(true),
										children: loading ? "…" : "重新扫描"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "wp-grid",
									children: entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WallpaperCard, {
										entry,
										selected: selectedOf(entry.id),
										carouselMember: carouselMode && inCarousel(entry.id),
										carouselMode,
										onPick: () => onPick(entry)
									}, entry.id))
								}),
								entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "wp-hint",
									children: "没有匹配的壁纸。"
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
										className: "wp-hint",
										style: { cursor: "pointer" },
										children: "壁纸来源路径…"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "wp-search",
										type: "text",
										placeholder: "Steam 根目录（可选）",
										value: steamDir,
										onChange: (event) => setSteamDir(event.target.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "wp-search",
										type: "text",
										placeholder: "Wallpaper Engine 安装目录（可选）",
										value: engineDir,
										onChange: (event) => setEngineDir(event.target.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "wp-button",
										disabled: loading,
										onClick: () => void savePaths(),
										children: "保存并重新扫描"
									})
								] })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "wp-section-title",
									children: "基础"
								}),
								sceneNote !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "wp-hint",
									style: { color: "var(--dsw-alias-label-secondary)" },
									children: sceneNote
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: "启用壁纸",
									checked: settings.enabled,
									onChange: (next) => store.update({ enabled: next })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-control-row",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "wp-label",
											children: "不透明度"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "wp-range",
											type: "range",
											min: 0,
											max: 100,
											value: settings.opacity,
											onChange: (event) => store.update({ opacity: Number(event.target.value) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "wp-value",
											children: [settings.opacity, "%"]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-control-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "wp-label",
										children: "作用范围"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "wp-radio-group",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "wp-radio",
											"data-checked": settings.scope === "page" ? "" : void 0,
											onClick: () => store.update({ scope: "page" }),
											children: "整页"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "wp-radio",
											"data-checked": settings.scope === "main" ? "" : void 0,
											onClick: () => store.update({ scope: "main" }),
											children: "主内容区"
										})]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-control-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "wp-label",
										children: "填充模式"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "wp-select",
										value: settings.fill,
										onChange: (event) => store.update({ fill: event.target.value }),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "cover",
												children: "覆盖（填满裁剪）"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "contain",
												children: "适应（完整显示）"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "stretch",
												children: "拉伸（铺满变形）"
											})
										]
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "wp-section-title",
									children: "效果"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: "场景壁纸优化",
									checked: settings.sceneEnhance,
									onChange: (next) => store.update({ sceneEnhance: next })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "wp-hint",
									children: "仅影响场景壁纸：铺满全屏并叠加 4px 柔化模糊、轻微降不透明度与暗角；关闭后恢复普通 cover。"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-control-row",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "wp-label",
											children: "高斯模糊"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "wp-range",
											type: "range",
											min: 0,
											max: 20,
											value: settings.blur,
											onChange: (event) => store.update({ blur: Number(event.target.value) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "wp-value",
											children: [settings.blur, "px"]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-control-row",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "wp-label",
											children: "暗角遮罩"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "wp-color",
											type: "color",
											value: settings.vignetteColor,
											disabled: settings.themeLink,
											title: settings.themeLink ? "主题联动已开启：遮罩色随主题自动调整" : "遮罩颜色",
											onChange: (event) => store.update({ vignetteColor: event.target.value })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "wp-range",
											type: "range",
											min: 0,
											max: 100,
											value: settings.vignetteIntensity,
											onChange: (event) => store.update({ vignetteIntensity: Number(event.target.value) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "wp-value",
											children: [settings.vignetteIntensity, "%"]
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "wp-section-title",
									children: "性能"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wp-control-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "wp-label",
										children: "帧率限制"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "wp-select",
										value: settings.fps,
										onChange: (event) => store.update({ fps: event.target.value }),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "auto",
												children: "自动（60）"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "60",
												children: "60 FPS"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "30",
												children: "30 FPS"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "10",
												children: "10 FPS"
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: "失焦暂停（视频）",
									checked: settings.pauseOnBlur,
									onChange: (next) => store.update({ pauseOnBlur: next })
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "wp-section-title",
									children: "交互"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: "鼠标视差",
									checked: settings.parallax,
									onChange: (next) => store.update({ parallax: next })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: "点击穿透",
									checked: settings.clickThrough,
									onChange: (next) => store.update({ clickThrough: next })
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "wp-section-title",
									children: "自动化"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
									label: "多壁纸轮播",
									checked: settings.carouselEnabled,
									onChange: (next) => store.update({ carouselEnabled: next })
								}),
								carouselMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "wp-control-row",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "wp-label",
												children: "切换间隔"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: "wp-range",
												type: "range",
												min: 5,
												max: 600,
												step: 5,
												value: settings.carouselInterval,
												onChange: (event) => store.update({ carouselInterval: Number(event.target.value) })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "wp-value",
												children: [settings.carouselInterval, "s"]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "wp-control-row",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "wp-label",
											children: "切换动画"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: "wp-select",
											value: settings.carouselAnimation,
											onChange: (event) => store.update({ carouselAnimation: event.target.value }),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "fade",
													children: "淡入淡出"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "slide",
													children: "滑动"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "none",
													children: "无"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "wp-hint",
										children: "点击上方壁纸卡片可加入 / 移出轮播列表。"
									})
								] }) : null
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "wp-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: "wp-section-title",
								children: "主题"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
								label: "主题联动（遮罩随明暗主题调整）",
								checked: settings.themeLink,
								onChange: (next) => store.update({ themeLink: next })
							})]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/**
		* DOM mounting for the dsh-wallpaper UI: the wallpaper layer root and the
		* 壁纸设计 drawer root, both appended to <body> as fixed-position containers
		* (no shell column involved — the layer sits behind the app at z-index -1,
		* the drawer floats on the right edge at z-index 900). Failure policy: DOM
		* mounting problems are logged, never thrown — an external plugin must not
		* take the GUI down.
		* @module dsh-wallpaper/client/mount
		*/
		/**
		* Mount the layer and the panel React trees into <body>.
		* @param store - the shared settings store.
		* @param api - the API client.
		* @param controller - the drawer open/close controller.
		* @returns disposer unmounting both trees and removing the containers.
		*/
		function mountWallpaperUI(store, api, controller) {
			const layerContainer = document.createElement("div");
			layerContainer.dataset.dshWallpaperLayer = "";
			const panelContainer = document.createElement("div");
			panelContainer.dataset.dshWallpaperPanel = "";
			document.body.appendChild(layerContainer);
			document.body.appendChild(panelContainer);
			const layerRoot = (0, react_dom_client.createRoot)(layerContainer);
			const panelRoot = (0, react_dom_client.createRoot)(panelContainer);
			layerRoot.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WallpaperLayer, {
				store,
				api
			}));
			panelRoot.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WallpaperPanel, {
				store,
				api,
				controller
			}));
			return () => {
				layerRoot.unmount();
				panelRoot.unmount();
				layerContainer.remove();
				panelContainer.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = ["slots"];
		/**
		* Mount the wallpaper surfaces.
		* @param ctx - client root context (the slots service gate).
		*/
		function apply(ctx) {
			const disposers = [];
			try {
				disposers.push(injectStyles());
				const store = new SettingsStore();
				const controller = new PanelController();
				const api = new WallpaperApi();
				disposers.push(mountSidebarEntry(controller));
				disposers.push(mountWallpaperUI(store, api, controller));
			} catch (error) {
				console.warn("[dsh-wallpaper] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-wallpaper: ui mounts");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map