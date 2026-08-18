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

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WallpaperApi } from './api.ts'
import type { SettingsStore } from './state.ts'
import { rawUrl, type LibrarySnapshot, type WallpaperEntry, type WallpaperSettings } from '../protocol.ts'

/** Crossfade duration (matches the .wp-media transition). */
const FADE_MS = 600
/** The parallax scale factor (media is zoomed by this much when parallax is on). */
const PARALLAX_SCALE = 1.08
/** Scene-enhance pipeline: extra blur, opacity multiplier, and vignette alpha. */
const SCENE_ENHANCE_BLUR = 4
const SCENE_ENHANCE_OPACITY = 0.85
const SCENE_ENHANCE_VIGNETTE = 'radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.35) 100%)'

/** One wallpaper media element: image / video / web iframe / scene preview. */
function MediaElement(props: {
  entry: WallpaperEntry
  settings: WallpaperSettings
  visible: boolean
  anim: WallpaperSettings['carouselAnimation']
  onVideoMount?: (video: HTMLVideoElement | null) => void
}) {
  const { entry, settings } = props
  const fill = settings.fill
  // Scene wallpapers degrade to their preview image and always cover the
  // viewport (no letterbox). The enhance pipeline (default on) softens the
  // enlarged preview: extra blur, a lowered opacity multiplier, and a dark
  // vignette (rendered by the layer). The user's fill setting keeps applying
  // to the other wallpaper types.
  const isScene = entry.type === 'scene'
  const enhanced = isScene && settings.sceneEnhance
  const objectFit = isScene ? 'cover' : (fill === 'stretch' ? 'fill' : fill)
  const filters: string[] = []
  const totalBlur = settings.blur + (enhanced ? SCENE_ENHANCE_BLUR : 0)
  if (totalBlur > 0) filters.push(`blur(${totalBlur}px)`)
  if (settings.parallax) filters.push(`scale(${PARALLAX_SCALE})`)
  // The filter and opacity live on the media element itself, not on a wrapper:
  // Chromium composites a playing <video> (and an <iframe>) on its own layer,
  // so a filter on an ancestor is ignored and blur would silently not render.
  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block',
    opacity: (settings.opacity / 100) * (enhanced ? SCENE_ENHANCE_OPACITY : 1),
    filter: filters.length > 0 ? filters.join(' ') : undefined,
  }

  let media: React.ReactNode
  const mediaUrl = rawUrl(entry.id, entry.file)
  if (entry.type === 'video') {
    media = React.createElement('video', {
      src: mediaUrl,
      ref: props.onVideoMount,
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      style: { ...mediaStyle, objectFit },
    })
  } else if (entry.type === 'web') {
    const query: string[] = []
    if (entry.width !== undefined && entry.height !== undefined) query.push(`resolution=${entry.width}x${entry.height}`)
    if (entry.fps !== undefined) query.push(`fps=${entry.fps}`)
    if (entry.width !== undefined) query.push(`ws=${entry.width}`)
    const url = mediaUrl + (query.length > 0 ? `?${query.join('&')}` : '')
    media = React.createElement('iframe', {
      src: url,
      sandbox: 'allow-scripts allow-same-origin',
      allow: 'autoplay',
      title: entry.title,
      style: { ...mediaStyle, border: 0 },
    })
  } else {
    // image renders the source image; scene wallpapers degrade to their
    // preview image (the scene renderer is not portable to a page).
    const url = isScene
      ? (entry.preview !== '' ? rawUrl(entry.id, entry.preview) : '')
      : mediaUrl
    media = React.createElement('img', {
      src: url,
      alt: entry.title,
      draggable: false,
      style: { ...mediaStyle, objectFit, objectPosition: 'center' },
    })
  }

  const note = entry.type === 'scene' ? '该壁纸为场景类型，浏览器暂不支持动态渲染，已显示为静态预览' : undefined
  return React.createElement(
    'div',
    {
      className: 'wp-media',
      'data-visible': props.visible ? '' : undefined,
      'data-anim': props.anim,
    },
    media,
    note !== undefined ? React.createElement('div', { className: 'wp-type-note' }, note) : null,
  )
}

/** rAF-based animation loop throttled to a target fps. */
function useFpsLoop(callback: (now: number) => void, fps: WallpaperSettings['fps'] | number): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    const intervalMs = 1000 / (fps === 'auto' ? 60 : fps)
    let raf = 0
    let last = 0
    const tick = (now: number): void => {
      if (now - last >= intervalMs) {
        last = now
        callbackRef.current(now)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fps])
}

/** Theme detection: dark when the app sets data-ds-dark-theme on body. */
function isDarkTheme(): boolean {
  return document.body.dataset.dsDarkTheme !== undefined
}

/** The wallpaper layer root component. */
export function WallpaperLayer(props: { store: SettingsStore; api: WallpaperApi }) {
  const { store, api } = props
  const [settings, setSettings] = useState<WallpaperSettings>(() => store.getSnapshot())
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [displayId, setDisplayId] = useState<string | null>(null)
  const [previousId, setPreviousId] = useState<string | null>(null)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [clipPath, setClipPath] = useState<string | null>(null)

  const layerRef = useRef<HTMLDivElement | null>(null)
  const mediaRef = useRef<HTMLDivElement | null>(null)
  const playlistRef = useRef<string[]>([])
  const darkRef = useRef(isDarkTheme())
  const videoRefs = useRef<Set<HTMLVideoElement>>(new Set())

  // ------------------------------------------------------------- library
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const snapshot = await api.library(false)
        if (!alive) return
        setLibrary(snapshot)
        const desired = await api.desiredState().catch(() => undefined)
        if (!alive) return
        if (desired !== undefined) store.mergeDesired(desired)
      } catch (error) {
        if (!alive) return
        setLibraryError(error instanceof Error ? error.message : String(error))
      }
    })()
    const unsubscribe = store.subscribe(() => setSettings(store.getSnapshot()))
    return () => {
      alive = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, store])

  // ------------------------------------------------ active id resolution
  const knownIds = useCallback((): Set<string> => {
    const ids = new Set<string>()
    for (const entry of library?.wallpapers ?? []) ids.add(entry.id)
    return ids
  }, [library])

  const entryOf = useCallback((id: string | null): WallpaperEntry | undefined => {
    if (id === null) return undefined
    return library?.wallpapers.find(entry => entry.id === id)
  }, [library])

  // Carousel playlist bookkeeping.
  useEffect(() => {
    playlistRef.current = store.playlist(knownIds())
    setCarouselIndex(0)
  }, [settings.carouselIds, settings.carouselEnabled, settings.activeId, knownIds, store])

  const carouselActive = settings.carouselEnabled && playlistRef.current.length > 1
  const effectiveId: string | null = carouselActive
    ? (playlistRef.current[carouselIndex] ?? null)
    : settings.activeId

  // Carousel rotation timer.
  useEffect(() => {
    if (!carouselActive) return
    const handle = window.setInterval(() => {
      const playlist = playlistRef.current
      if (playlist.length <= 1) return
      setCarouselIndex(index => (index + 1) % playlist.length)
    }, Math.max(5, settings.carouselInterval) * 1000)
    return () => window.clearInterval(handle)
  }, [carouselActive, settings.carouselInterval])

  // Crossfade: when the effective id changes, keep the old one fading out.
  useEffect(() => {
    if (effectiveId === displayId) return
    if (displayId !== null && effectiveId !== null) setPreviousId(displayId)
    setDisplayId(effectiveId)
    if (effectiveId === null) setPreviousId(null)
    const handle = window.setTimeout(() => setPreviousId(null), FADE_MS)
    return () => window.clearTimeout(handle)
  }, [effectiveId, displayId])

  const currentEntry = entryOf(displayId)
  const previousEntry = entryOf(previousId)

  // ------------------------------------------------- transparency scope
  useEffect(() => {
    const overrides: Array<{ element: HTMLElement; property: string; value: string }> = []
    // Idempotency keyed by (element, property): the clip updater may call
    // apply repeatedly, and one element (body) carries several properties.
    const applied = new Map<HTMLElement, Set<string>>()
    const apply = (element: HTMLElement, property: string, value: string): void => {
      const props = applied.get(element)
      if (props !== undefined && props.has(property)) return
      if (props === undefined) applied.set(element, new Set([property]))
      else props.add(property)
      const original = element.style.getPropertyValue(property)
      if (original !== '') overrides.push({ element, property, value: original })
      element.style.setProperty(property, value)
    }
    const restore = (): void => {
      for (const item of overrides.splice(0)) {
        item.element.style.setProperty(item.property, item.value)
      }
    }

    if (!settings.enabled) {
      restore()
      setClipPath(null)
      return
    }

    // The app's frame, conversation root, and body paint --dsw-alias-bg-base,
    // while the sidebar paints --dsw-specific-sidebar-fill. Page scope makes
    // BOTH transparent so the wallpaper covers the whole viewport (sidebar
    // included); main scope makes only the frame transparent and clips the
    // layer to the center column. Re-run inside the periodic clip updater so
    // a late-mounting shell frame still gets the override.
    const updateClip = (): void => {
      const center = document.querySelector<HTMLElement>('[class*="centerCol"]')
      if (settings.scope === 'page') {
        apply(document.body, '--dsw-alias-bg-base', 'transparent')
        apply(document.body, '--dsw-specific-sidebar-fill', 'transparent')
      } else {
        const frame = center?.parentElement
        if (frame !== null && frame !== undefined) apply(frame, '--dsw-alias-bg-base', 'transparent')
      }
      if (settings.scope !== 'main' || center === null) {
        setClipPath(null)
        return
      }
      const rect = center.getBoundingClientRect()
      const right = window.innerWidth - rect.right
      const bottom = window.innerHeight - rect.bottom
      setClipPath(`inset(${rect.top}px ${right}px ${bottom}px ${rect.left}px)`)
    }

    updateClip()
    const handle = window.setInterval(updateClip, 500)
    window.addEventListener('resize', updateClip)
    return () => {
      window.clearInterval(handle)
      window.removeEventListener('resize', updateClip)
      restore()
      setClipPath(null)
    }
  }, [settings.enabled, settings.scope])

  // ----------------------------------------------------------- parallax
  const mouseTarget = useRef({ x: 0, y: 0 })
  const parallaxRef = useRef({ x: 0, y: 0 })
  const [parallaxOffset, setParallaxOffset] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!settings.parallax) {
      setParallaxOffset(null)
      return
    }
    const onMove = (event: MouseEvent): void => {
      mouseTarget.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [settings.parallax])

  useFpsLoop(() => {
    if (!settings.parallax) return
    const target = mouseTarget.current
    const current = parallaxRef.current
    const nextX = current.x + (target.x - current.x) * 0.08
    const nextY = current.y + (target.y - current.y) * 0.08
    parallaxRef.current = { x: nextX, y: nextY }
    setParallaxOffset({
      x: Math.round(nextX * 14 * 100) / 100,
      y: Math.round(nextY * 14 * 100) / 100,
    })
  }, settings.fps)

  // ------------------------------------------- pause on blur + video refs
  const captureVideo = useCallback((video: HTMLVideoElement | null): void => {
    if (video !== null) videoRefs.current.add(video)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onVisibility = (): void => {
      const hidden = document.hidden
      for (const video of videoRefs.current) {
        if (hidden && settings.pauseOnBlur) {
          try { video.pause() } catch { /* not loaded */ }
        } else if (!hidden) {
          void video.play().catch(() => undefined)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [settings.pauseOnBlur])

  // ------------------------------------------------------- theme linkage
  useEffect(() => {
    if (!settings.themeLink) return
    const observer = new MutationObserver(() => {
      const dark = isDarkTheme()
      if (dark !== darkRef.current) {
        darkRef.current = dark
        setSettings(store.getSnapshot())
      }
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [settings.themeLink, store])

  // ----------------------------------------------------------- rendering
  const vignetteColor = settings.themeLink
    ? (darkRef.current ? '#000000' : '#ffffff')
    : settings.vignetteColor
  const vignette = settings.vignetteIntensity > 0
    ? `radial-gradient(ellipse at center, transparent ${Math.max(20, 60 - settings.vignetteIntensity / 2)}%, ${vignetteColor} 100%)`
    : 'none'
  const vignetteOpacity = settings.vignetteIntensity / 100
  // The scene-enhance pipeline adds its own soft dark vignette on top of the
  // user's vignette (a separate layer so its alpha is independent).
  const sceneEnhanced = currentEntry?.type === 'scene' && settings.sceneEnhance

  const layerStyle: React.CSSProperties = {
    clipPath: clipPath ?? undefined,
  }

  const parallaxStyle: React.CSSProperties | undefined = settings.parallax && parallaxOffset !== null
    ? { transform: `translate(${parallaxOffset.x}px, ${parallaxOffset.y}px)` }
    : undefined

  if (!settings.enabled || effectiveId === null) {
    return React.createElement('div', {
      ref: layerRef,
      className: 'wp-layer',
      style: layerStyle,
    })
  }

  const elements: React.ReactNode[] = []
  if (previousEntry !== undefined && previousEntry.id !== displayId) {
    elements.push(React.createElement(MediaElement, {
      key: `prev-${previousEntry.id}`,
      entry: previousEntry,
      settings,
      visible: false,
      anim: 'fade',
    }))
  }
  if (currentEntry !== undefined) {
    elements.push(React.createElement(MediaElement, {
      key: `cur-${currentEntry.id}`,
      entry: currentEntry,
      settings,
      visible: true,
      anim: settings.carouselAnimation,
      onVideoMount: captureVideo,
    }))
  } else if (libraryError === null && library !== null) {
    elements.push(React.createElement('div', { className: 'wp-empty-note', key: 'empty' }, '未找到壁纸：请在「壁纸设计」面板选择一张'))
  }

  return React.createElement(
    'div',
    {
      ref: layerRef,
      className: 'wp-layer',
      'data-click-through': settings.clickThrough ? 'true' : 'false',
      style: layerStyle,
    },
    React.createElement('div', { ref: mediaRef, className: 'wp-layer-inner', style: parallaxStyle }, ...elements),
    sceneEnhanced
      ? React.createElement('div', { className: 'wp-scrim', style: { background: SCENE_ENHANCE_VIGNETTE } })
      : null,
    React.createElement('div', {
      className: 'wp-scrim',
      style: { background: vignette, opacity: vignetteOpacity },
    }),
  )
}
