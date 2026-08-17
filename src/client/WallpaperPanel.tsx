/**
 * The 壁纸设计 panel: the right-side drawer UI for picking a Wallpaper Engine
 * wallpaper and tuning every rendering option (opacity, scope, fill, blur,
 * vignette, fps, pause-on-blur, parallax, click-through, carousel, theme
 * linkage) plus the library source status and path overrides.
 * @module dsh-wallpaper/client/WallpaperPanel
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WallpaperApi } from './api.ts'
import type { PanelController } from './controller.ts'
import type { SettingsStore } from './state.ts'
import { rawUrl, type LibrarySnapshot, type WallpaperEntry, type WallpaperSettings } from '../protocol.ts'

/** Subscribe a component to the settings store. */
function useSettings(store: SettingsStore): WallpaperSettings {
  const [settings, setSettings] = useState<WallpaperSettings>(() => store.getSnapshot())
  useEffect(() => store.subscribe(() => setSettings(store.getSnapshot())), [store])
  return settings
}

/** Type badge label (scene wallpapers are visibly marked as static previews). */
const TYPE_LABEL: Record<WallpaperEntry['type'], string> = {
  scene: '场景·预览',
  video: '视频',
  web: '网页',
  image: '图片',
}

/** One wallpaper card. */
function WallpaperCard(props: {
  entry: WallpaperEntry
  selected: boolean
  carouselMember: boolean
  carouselMode: boolean
  onPick: () => void
}) {
  const { entry, selected, carouselMember, carouselMode, onPick } = props
  const preview = entry.preview !== ''
    ? rawUrl(entry.id, entry.preview)
    : (entry.type === 'image' && entry.file !== '' ? rawUrl(entry.id, entry.file) : null)
  const badge = carouselMode && carouselMember ? '轮播' : (entry.current ? '当前' : TYPE_LABEL[entry.type])
  const badgeClass = entry.current ? 'wp-badge wp-badge-current' : 'wp-badge'
  return (
    <button
      type="button"
      className="wp-card"
      data-selected={selected ? '' : undefined}
      onClick={onPick}
      title={entry.title}
    >
      <span className="wp-thumb">
        {preview !== null
          ? <img src={preview} alt={entry.title} loading="lazy" draggable={false} />
          : <span className="wp-thumb-empty">{TYPE_LABEL[entry.type]}</span>}
        <span className={badgeClass}>{badge}</span>
      </span>
      <span className="wp-card-title">{entry.title}</span>
    </button>
  )
}

/** One labeled control row with a switch. */
function SwitchRow(props: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="wp-control-row">
      <span className="wp-label">{props.label}</span>
      <button
        type="button"
        className="wp-switch"
        data-on={props.checked ? '' : undefined}
        aria-pressed={props.checked}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  )
}

/** The panel root. */
export function WallpaperPanel(props: { store: SettingsStore; api: WallpaperApi; controller: PanelController }) {
  const { store, api, controller } = props
  const settings = useSettings(store)
  const [panelOpen, setPanelOpen] = useState(() => controller.getSnapshot().panelOpen)
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [engineDir, setEngineDir] = useState('')
  const [steamDir, setSteamDir] = useState('')

  useEffect(() => controller.subscribe(() => setPanelOpen(controller.getSnapshot().panelOpen)), [controller])

  const load = useCallback(async (force: boolean): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const snapshot = await api.library(force)
      setLibrary(snapshot)
      setEngineDir(snapshot.engineDir ?? '')
      setSteamDir(snapshot.steamDir ?? '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load(false)
  }, [load])

  const entries = useMemo(() => {
    const list = library?.wallpapers ?? []
    const trimmed = query.trim().toLowerCase()
    if (trimmed === '') return list
    return list.filter(entry =>
      entry.title.toLowerCase().includes(trimmed)
      || entry.id.toLowerCase().includes(trimmed)
      || entry.tags.some(tag => tag.toLowerCase().includes(trimmed)))
  }, [library, query])

  const carouselMode = settings.carouselEnabled
  const inCarousel = (id: string): boolean => settings.carouselIds.includes(id)
  const selectedOf = (id: string): boolean => carouselMode ? inCarousel(id) : settings.activeId === id

  const onPick = (entry: WallpaperEntry): void => {
    if (carouselMode) {
      const next = inCarousel(entry.id)
        ? settings.carouselIds.filter(id => id !== entry.id)
        : [...settings.carouselIds, entry.id]
      store.update({ carouselIds: next })
      if (settings.activeId === null) store.update({ activeId: entry.id })
    } else {
      store.update({ activeId: entry.id })
    }
  }

  const savePaths = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const snapshot = await api.setPaths({
        engineDir: engineDir.trim() === '' ? '' : engineDir.trim(),
        steamDir: steamDir.trim() === '' ? '' : steamDir.trim(),
      })
      setLibrary(snapshot)
      setEngineDir(snapshot.engineDir ?? '')
      setSteamDir(snapshot.steamDir ?? '')
    } catch (pathError) {
      setError(pathError instanceof Error ? pathError.message : String(pathError))
    } finally {
      setLoading(false)
    }
  }

  const source = library
    ? (library.wallpapers.length > 0
        ? `已发现 ${library.wallpapers.length} 张壁纸`
        : (library.scanError ?? '未发现壁纸（请检查路径）'))
    : '扫描中…'

  // Scene wallpapers degrade to their preview image; tell the user why.
  const activeEntry = library?.wallpapers.find(entry => entry.id === settings.activeId)
  const sceneNote = settings.enabled && activeEntry?.type === 'scene'
    ? '该壁纸为场景类型，浏览器暂不支持动态渲染，已显示为静态预览'
    : null

  return (
    <div className="wp-drawer" data-open={panelOpen ? '' : undefined} role="dialog" aria-label="壁纸设计">
      <div className="wp-drawer-header">
        <h2 className="wp-drawer-title">壁纸设计</h2>
        <button type="button" className="wp-close" aria-label="关闭" onClick={() => controller.close()}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="wp-drawer-body">
        {/* ------------------------------------------------ library */}
        <section className="wp-section">
          <h3 className="wp-section-title">壁纸库</h3>
          <div className="wp-status">
            <span className="wp-status-dot" data-error={error !== null ? '' : undefined} />
            <span>{error ?? source}</span>
          </div>
          {library?.engineDir === undefined && error === null ? (
            <p className="wp-hint">未找到 Wallpaper Engine：请在下方指定 Steam 根目录或 WE 安装目录（例如 C:\Program Files (x86)\Steam）。</p>
          ) : null}
          <div className="wp-toolbar">
            <input
              className="wp-search"
              type="search"
              placeholder="搜索壁纸…"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <button type="button" className="wp-button" disabled={loading} onClick={() => void load(true)}>
              {loading ? '…' : '重新扫描'}
            </button>
          </div>
          <div className="wp-grid">
            {entries.map(entry => (
              <WallpaperCard
                key={entry.id}
                entry={entry}
                selected={selectedOf(entry.id)}
                carouselMember={carouselMode && inCarousel(entry.id)}
                carouselMode={carouselMode}
                onPick={() => onPick(entry)}
              />
            ))}
          </div>
          {entries.length === 0 ? <p className="wp-hint">没有匹配的壁纸。</p> : null}
          <details>
            <summary className="wp-hint" style={{ cursor: 'pointer' }}>壁纸来源路径…</summary>
            <input
              className="wp-search"
              type="text"
              placeholder="Steam 根目录（可选）"
              value={steamDir}
              onChange={event => setSteamDir(event.target.value)}
            />
            <input
              className="wp-search"
              type="text"
              placeholder="Wallpaper Engine 安装目录（可选）"
              value={engineDir}
              onChange={event => setEngineDir(event.target.value)}
            />
            <button type="button" className="wp-button" disabled={loading} onClick={() => void savePaths()}>保存并重新扫描</button>
          </details>
        </section>

        {/* ------------------------------------------------- basics */}
        <section className="wp-section">
          <h3 className="wp-section-title">基础</h3>
          {sceneNote !== null ? (
            <p className="wp-hint" style={{ color: 'var(--dsw-alias-label-secondary)' }}>{sceneNote}</p>
          ) : null}
          <SwitchRow label="启用壁纸" checked={settings.enabled} onChange={next => store.update({ enabled: next })} />
          <div className="wp-control-row">
            <span className="wp-label">不透明度</span>
            <input
              className="wp-range"
              type="range"
              min={0}
              max={100}
              value={settings.opacity}
              onChange={event => store.update({ opacity: Number(event.target.value) })}
            />
            <span className="wp-value">{settings.opacity}%</span>
          </div>
          <div className="wp-control-row">
            <span className="wp-label">作用范围</span>
            <span className="wp-radio-group">
              <button
                type="button"
                className="wp-radio"
                data-checked={settings.scope === 'page' ? '' : undefined}
                onClick={() => store.update({ scope: 'page' })}
              >整页</button>
              <button
                type="button"
                className="wp-radio"
                data-checked={settings.scope === 'main' ? '' : undefined}
                onClick={() => store.update({ scope: 'main' })}
              >主内容区</button>
            </span>
          </div>
          <div className="wp-control-row">
            <span className="wp-label">填充模式</span>
            <select
              className="wp-select"
              value={settings.fill}
              onChange={event => store.update({ fill: event.target.value as WallpaperSettings['fill'] })}
            >
              <option value="cover">覆盖（填满裁剪）</option>
              <option value="contain">适应（完整显示）</option>
              <option value="stretch">拉伸（铺满变形）</option>
            </select>
          </div>
        </section>

        {/* ------------------------------------------------ effects */}
        <section className="wp-section">
          <h3 className="wp-section-title">效果</h3>
          <SwitchRow
            label="场景壁纸优化"
            checked={settings.sceneEnhance}
            onChange={next => store.update({ sceneEnhance: next })}
          />
          <p className="wp-hint">仅影响场景壁纸：铺满全屏并叠加 4px 柔化模糊、轻微降不透明度与暗角；关闭后恢复普通 cover。</p>
          <div className="wp-control-row">
            <span className="wp-label">高斯模糊</span>
            <input
              className="wp-range"
              type="range"
              min={0}
              max={20}
              value={settings.blur}
              onChange={event => store.update({ blur: Number(event.target.value) })}
            />
            <span className="wp-value">{settings.blur}px</span>
          </div>
          <div className="wp-control-row">
            <span className="wp-label">暗角遮罩</span>
            <input
              className="wp-color"
              type="color"
              value={settings.vignetteColor}
              disabled={settings.themeLink}
              title={settings.themeLink ? '主题联动已开启：遮罩色随主题自动调整' : '遮罩颜色'}
              onChange={event => store.update({ vignetteColor: event.target.value })}
            />
            <input
              className="wp-range"
              type="range"
              min={0}
              max={100}
              value={settings.vignetteIntensity}
              onChange={event => store.update({ vignetteIntensity: Number(event.target.value) })}
            />
            <span className="wp-value">{settings.vignetteIntensity}%</span>
          </div>
        </section>

        {/* ---------------------------------------------- performance */}
        <section className="wp-section">
          <h3 className="wp-section-title">性能</h3>
          <div className="wp-control-row">
            <span className="wp-label">帧率限制</span>
            <select
              className="wp-select"
              value={settings.fps}
              onChange={event => store.update({ fps: event.target.value as WallpaperSettings['fps'] })}
            >
              <option value="auto">自动（60）</option>
              <option value="60">60 FPS</option>
              <option value="30">30 FPS</option>
              <option value="10">10 FPS</option>
            </select>
          </div>
          <SwitchRow label="失焦暂停（视频）" checked={settings.pauseOnBlur} onChange={next => store.update({ pauseOnBlur: next })} />
        </section>

        {/* ---------------------------------------------- interaction */}
        <section className="wp-section">
          <h3 className="wp-section-title">交互</h3>
          <SwitchRow label="鼠标视差" checked={settings.parallax} onChange={next => store.update({ parallax: next })} />
          <SwitchRow label="点击穿透" checked={settings.clickThrough} onChange={next => store.update({ clickThrough: next })} />
        </section>

        {/* --------------------------------------------- automation */}
        <section className="wp-section">
          <h3 className="wp-section-title">自动化</h3>
          <SwitchRow label="多壁纸轮播" checked={settings.carouselEnabled} onChange={next => store.update({ carouselEnabled: next })} />
          {carouselMode ? (
            <>
              <div className="wp-control-row">
                <span className="wp-label">切换间隔</span>
                <input
                  className="wp-range"
                  type="range"
                  min={5}
                  max={600}
                  step={5}
                  value={settings.carouselInterval}
                  onChange={event => store.update({ carouselInterval: Number(event.target.value) })}
                />
                <span className="wp-value">{settings.carouselInterval}s</span>
              </div>
              <div className="wp-control-row">
                <span className="wp-label">切换动画</span>
                <select
                  className="wp-select"
                  value={settings.carouselAnimation}
                  onChange={event => store.update({ carouselAnimation: event.target.value as WallpaperSettings['carouselAnimation'] })}
                >
                  <option value="fade">淡入淡出</option>
                  <option value="slide">滑动</option>
                  <option value="none">无</option>
                </select>
              </div>
              <p className="wp-hint">点击上方壁纸卡片可加入 / 移出轮播列表。</p>
            </>
          ) : null}
        </section>

        {/* --------------------------------------------------- theme */}
        <section className="wp-section">
          <h3 className="wp-section-title">主题</h3>
          <SwitchRow label="主题联动（遮罩随明暗主题调整）" checked={settings.themeLink} onChange={next => store.update({ themeLink: next })} />
        </section>
      </div>
    </div>
  )
}
