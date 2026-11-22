import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { SkinProfileQuery, SkinTexture } from '../shared/types'

const UA = 'Qidonqi-Launcher/0.1.0'
const JSON_TIMEOUT = 12_000
const PNG_TIMEOUT = 15_000
/** 玩家换了皮肤时，最多半小时内能看到 */
const TTL = 30 * 60 * 1000

interface CacheMeta {
  savedAt: number
  model: 'classic' | 'slim'
  missing: boolean
}

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'skins')
}

function cacheKey(query: SkinProfileQuery): string {
  const seed = [query.type, query.name.toLowerCase(), query.uuid ?? '', query.authServerUrl ?? ''].join('|')
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const slug = query.name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16) || 'player'
  return `${query.type}-${slug}-${Math.abs(hash).toString(36)}`
}

async function getJson(url: string): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controller.signal })
    if (!res.ok) return null
    const text = await res.text()
    if (!text.trim()) return null
    return JSON.parse(text)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getBinary(url: string): Promise<Buffer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PNG_TIMEOUT)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 64 ? buf : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface ResolvedTexture {
  buffer: Buffer
  model: 'classic' | 'slim'
  source: 'mojang' | 'authlib'
}

/** 从 profile 的 textures 属性里解出皮肤贴图地址与模型 */
function readTexture(profile: any): { url: string; model: 'classic' | 'slim' } | null {
  const props = Array.isArray(profile?.properties) ? profile.properties : []
  const raw = props.find((item: any) => item?.name === 'textures')?.value
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    const skin = decoded?.textures?.SKIN
    if (!skin?.url) return null
    const model = skin.metadata?.model === 'slim' ? 'slim' : 'classic'
    return { url: String(skin.url), model }
  } catch {
    return null
  }
}

async function downloadTexture(entry: { url: string; model: 'classic' | 'slim' }, source: 'mojang' | 'authlib'): Promise<ResolvedTexture | null> {
  const buffer = await getBinary(entry.url)
  if (!buffer) return null
  return { buffer, model: entry.model, source }
}

/** 微软 / 离线：走 Mojang 名字 → UUID → session server 的贴图 */
async function resolveMojang(query: SkinProfileQuery): Promise<ResolvedTexture | null> {
  // 离线账户的 UUID 是本地派生的，和 Mojang 的 UUID 不一致，只能按名字查
  let uuid = query.type === 'microsoft' ? (query.uuid ?? '').replace(/-/g, '').toLowerCase() : ''
  if (!/^[0-9a-f]{32}$/.test(uuid)) uuid = ''

  let profile = uuid ? await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`) : null
  let entry = readTexture(profile)

  if (!entry) {
    const lookup = await getJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(query.name)}`)
    const id = typeof lookup?.id === 'string' ? lookup.id : ''
    if (/^[0-9a-fA-F]{32}$/.test(id)) {
      profile = await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`)
      entry = readTexture(profile)
    }
  }

  if (!entry) return null
  return downloadTexture(entry, 'mojang')
}

/** 外置登录：走皮肤站（authlib-injector）自己的 session server */
async function resolveAuthlib(query: SkinProfileQuery): Promise<ResolvedTexture | null> {
  const root = (query.authServerUrl ?? '').replace(/\/+$/, '')
  const uuid = (query.uuid ?? '').replace(/-/g, '').toLowerCase()
  if (!root || !/^[0-9a-f]{32}$/.test(uuid)) return null
  const profile = await getJson(`${root}/sessionserver/session/minecraft/profile/${uuid}?unsigned=false`)
  const entry = readTexture(profile)
  if (!entry) return null
  return downloadTexture(entry, 'authlib')
}

async function readCache(key: string): Promise<{ meta: CacheMeta; png: Buffer } | null> {
  try {
    const [metaRaw, png] = await Promise.all([
      fsp.readFile(path.join(cacheDir(), `${key}.json`), 'utf8'),
      fsp.readFile(path.join(cacheDir(), `${key}.png`)),
    ])
    const meta = JSON.parse(metaRaw) as CacheMeta
    if (!Number.isFinite(meta.savedAt) || Date.now() - meta.savedAt > TTL) return null
    if (meta.missing) return { meta, png: Buffer.alloc(0) }
    return { meta, png }
  } catch {
    return null
  }
}

async function writeCache(key: string, meta: CacheMeta, png: Buffer | null): Promise<void> {
  try {
    await fsp.mkdir(cacheDir(), { recursive: true })
    if (png) await fsp.writeFile(path.join(cacheDir(), `${key}.png`), png)
    else await fsp.rm(path.join(cacheDir(), `${key}.png`), { force: true })
    await fsp.writeFile(path.join(cacheDir(), `${key}.json`), JSON.stringify(meta), 'utf8')
  } catch {
    /* 缓存写失败不影响预览 */
  }
}

function toResult(png: Buffer, model: 'classic' | 'slim', source: SkinTexture['source']): SkinTexture {
  return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, model, source }
}

export async function resolveSkin(query: SkinProfileQuery): Promise<SkinTexture> {
  const name = (query.name ?? '').trim()
  if (!name) return { dataUrl: null, model: 'classic', source: 'default' }

  const key = cacheKey({ ...query, name })
  const cached = await readCache(key)
  if (cached) {
    if (cached.meta.missing) return { dataUrl: null, model: cached.meta.model, source: 'default' }
    return toResult(cached.png, cached.meta.model, 'cache')
  }

  const found =
    query.type === 'authlib' ? (await resolveAuthlib(query)) ?? (await resolveMojang(query)) : await resolveMojang(query)

  if (!found) {
    await writeCache(key, { savedAt: Date.now(), model: 'classic', missing: true }, null)
    return { dataUrl: null, model: 'classic', source: 'default' }
  }

  await writeCache(key, { savedAt: Date.now(), model: found.model, missing: false }, found.buffer)
  return toResult(found.buffer, found.model, found.source)
}
