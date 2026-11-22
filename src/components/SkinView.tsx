import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { IdleAnimation, SkinViewer } from 'skinview3d'
import type { Account, SkinProfileQuery, SkinTexture } from '@shared/types'
import { api } from '../lib/utils'
import steveUrl from '../assets/skin-steve.png'

export interface SkinData {
  url: string
  model: 'classic' | 'slim'
  /** 没查到皮肤，正在用内置史蒂夫 */
  isDefault: boolean
  loading: boolean
}

const memory = new Map<string, SkinData>()

export function skinQueryOf(account?: Account | null): SkinProfileQuery | null {
  if (!account) return null
  return {
    name: account.name,
    uuid: account.uuid,
    type: account.type,
    authServerUrl: account.authServerUrl,
  }
}

function keyOf(query: SkinProfileQuery | null): string {
  if (!query) return ''
  return [query.type, query.name.toLowerCase(), query.uuid ?? '', query.authServerUrl ?? ''].join('|')
}

/** 按账户名取皮肤贴图；查不到就用内置史蒂夫 */
export function useSkin(query: SkinProfileQuery | null): SkinData {
  const key = keyOf(query)
  const [data, setData] = useState<SkinData>(
    () => memory.get(key) ?? { url: steveUrl, model: 'classic', isDefault: true, loading: Boolean(query) },
  )

  useEffect(() => {
    if (!key) {
      setData({ url: steveUrl, model: 'classic', isDefault: true, loading: false })
      return
    }
    const cached = memory.get(key)
    if (cached) {
      setData(cached)
      return
    }

    let cancelled = false
    setData({ url: steveUrl, model: 'classic', isDefault: true, loading: true })

    void api
      .skinGet(query as SkinProfileQuery)
      .then((res: SkinTexture) => {
        const next: SkinData = res.dataUrl
          ? { url: res.dataUrl, model: res.model, isDefault: false, loading: false }
          : { url: steveUrl, model: 'classic', isDefault: true, loading: false }
        memory.set(key, next)
        if (!cancelled) setData(next)
      })
      .catch(() => {
        if (!cancelled) setData({ url: steveUrl, model: 'classic', isDefault: true, loading: false })
      })

    return () => {
      cancelled = true
    }
    // query 的四个字段已经折叠进 key，用它做依赖即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return data
}

/** 3D 立绘：skinview3d 渲染真实方块身材，静止姿态 + 轻微呼吸 */
export function SkinFigure({
  skin,
  side = 'front',
  height = 330,
  className,
  style,
}: {
  skin: SkinData
  side?: 'front' | 'back'
  height?: number
  className?: string
  style?: CSSProperties
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const appliedRef = useRef<string>('')
  const width = Math.round(height * 0.62)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let viewer: SkinViewer
    try {
      viewer = new SkinViewer({
        canvas,
        width: width * dpr,
        height: height * dpr,
        skin: skin.url,
        fov: 40,
        zoom: 1.14,
        enableControls: false,
        animation: new IdleAnimation(),
      })
    } catch {
      return
    }
    appliedRef.current = skin.url
    try {
      viewer.renderer.setClearColor(0x000000, 0)
    } catch {
      /* 背景保持透明 */
    }
    viewerRef.current = viewer

    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
    // 只在挂载时建一次，之后换皮肤走 loadSkin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.playerWrapper.rotation.y = side === 'back' ? Math.PI : 0
    if (appliedRef.current === skin.url) return
    appliedRef.current = skin.url
    try {
      void viewer.loadSkin(skin.url, { model: skin.model === 'slim' ? 'slim' : 'default' })
    } catch {
      /* 贴图读不到就维持上一次 */
    }
  }, [skin.url, skin.model, side])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width,
        height,
        maxWidth: '100%',
        ...style,
      }}
    />
  )
}

/** 头像：从皮肤里裁面部（含帽子层），像素风 */
export function SkinHead({ skin, size = 104, className }: { skin: SkinData; size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    const load = (url: string): Promise<HTMLImageElement> => {
      const hit = cacheRef.current.get(url)
      if (hit) return Promise.resolve(hit)
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          cacheRef.current.set(url, img)
          resolve(img)
        }
        img.onerror = () => reject(new Error('skin image load failed'))
        img.src = url
      })
    }

    void load(skin.url)
      .then((img) => {
        if (cancelled) return
        const scale = 16
        canvas.width = 8 * scale
        canvas.height = 8 * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8 * scale, 8 * scale)
        // 旧版 64x32 皮肤的帽子区是未使用的纯黑，跳过
        if (img.naturalHeight === 64) ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8 * scale, 8 * scale)
      })
      .catch(() => {
        /* 保持空白，等默认皮肤 */
      })

    return () => {
      cancelled = true
    }
  }, [skin.url])

  return <canvas ref={canvasRef} className={className} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
}

/** 账户头像：按账户名取皮肤再裁脸 */
export function AccountHead({
  account,
  size = 36,
  className,
}: {
  account?: Account | null
  size?: number
  className?: string
}) {
  const query = useMemo(
    () => skinQueryOf(account),
    [account?.id, account?.name, account?.uuid, account?.type, account?.authServerUrl],
  )
  const skin = useSkin(query)
  return <SkinHead skin={skin} size={size} className={className} />
}

/** 组合式立绘：自己取皮肤 + 渲染 */export function SkinStage({
  account,
  side,
  height = 330,
  className,
}: {
  account?: Account | null
  side: 'front' | 'back'
  height?: number
  className?: string
}) {
  const query = useMemo(
    () => skinQueryOf(account),
    [account?.id, account?.name, account?.uuid, account?.type, account?.authServerUrl],
  )
  const skin = useSkin(query)
  return <SkinFigure skin={skin} side={side} height={height} className={className} />
}
