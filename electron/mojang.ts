import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type { RemoteVersion, VersionType } from '../shared/types'
import { downloadFile, fetchJson, fileExists, runPool, writeJson } from './net'
import { ASSET_BASE, MANIFEST_URL, gamePaths } from './paths'
import type { TaskCtx } from './task'

export const CURRENT_OS = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'
const CURRENT_ARCH = process.arch === 'x64' ? 'x86' : process.arch

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export interface Library {
  name: string
  url?: string
  rules?: Rule[]
  downloads?: {
    artifact?: { path: string; url: string; size?: number; sha1?: string }
    classifiers?: Record<string, { path: string; url: string; size?: number }>
  }
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
}

export interface ArgumentEntry {
  rules?: Rule[]
  value: string | string[]
}

export interface VersionJson {
  id: string
  type: VersionType | string
  mainClass: string
  inheritsFrom?: string
  minecraftArguments?: string
  arguments?: { game?: (string | ArgumentEntry)[]; jvm?: (string | ArgumentEntry)[] }
  libraries?: Library[]
  assetIndex?: { id: string; url: string; totalSize?: number }
  assets?: string
  javaVersion?: { component: string; majorVersion: number }
  downloads?: {
    client?: { url: string; size: number; sha1?: string }
    server?: { url: string; size: number }
  }
  releaseTime?: string
}

export interface ManifestResponse {
  latest: { release: string; snapshot: string }
  versions: RemoteVersion[]
}

let manifestCache: { at: number; data: ManifestResponse } | null = null

export async function fetchManifest(force = false): Promise<ManifestResponse> {
  if (!force && manifestCache && Date.now() - manifestCache.at < 5 * 60 * 1000) return manifestCache.data
  const data = await fetchJson<ManifestResponse>(MANIFEST_URL)
  manifestCache = { at: Date.now(), data }
  return data
}

export async function fetchRemoteVersions(force = false): Promise<RemoteVersion[]> {
  const manifest = await fetchManifest(force)
  return manifest.versions
}

export function ruleMatches(rule: Rule, features: Record<string, boolean> = {}): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== CURRENT_OS) return false
    if (rule.os.arch && rule.os.arch !== CURRENT_ARCH) return false
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(os.release())) return false
      } catch {
        return false
      }
    }
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if ((features[key] ?? false) !== value) return false
    }
  }
  return true
}

export function rulesAllow(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === 'allow'
  }
  return allowed
}

export function mavenToPath(name: string, ext = 'jar'): string {
  const [group, artifact, version, classifier] = name.split(':')
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}

export function libraryTarget(lib: Library): { path: string; url: string; size?: number } | null {
  const artifact = lib.downloads?.artifact
  if (artifact?.url) return { path: artifact.path, url: artifact.url, size: artifact.size }
  if (lib.name && lib.url) {
    const relative = mavenToPath(lib.name)
    return { path: relative, url: `${lib.url.replace(/\/$/, '')}/${relative}` }
  }
  return null
}

export function nativeTarget(
  lib: Library,
): { path: string; url: string; size?: number } | null {
  const nativesKey = lib.natives?.[CURRENT_OS]
  if (!nativesKey) return null
  const classifier = nativesKey.replace('${arch}', process.arch === 'x64' ? '64' : '32')
  const artifact = lib.downloads?.classifiers?.[classifier]
  if (!artifact?.url) return null
  return { path: artifact.path, url: artifact.url, size: artifact.size }
}

async function getVersionMeta(url: string): Promise<VersionJson> {
  return fetchJson<VersionJson>(url)
}

export interface InstallOptions {
  gameDir: string
  versionId: string
  ctx: TaskCtx
}

export async function installVanilla({ gameDir, versionId, ctx }: InstallOptions): Promise<void> {
  const manifest = await fetchManifest()
  const entry = manifest.versions.find((v) => v.id === versionId)
  if (!entry) throw new Error(`版本清单中找不到 ${versionId}`)
  const meta = await getVersionMeta(entry.url)
  const paths = gamePaths(gameDir)
  const versionDir = path.join(paths.versions, versionId)

  await fsp.mkdir(versionDir, { recursive: true })
  await writeJson(path.join(versionDir, `${versionId}.json`), meta)

  const jobs: { url: string; dest: string; size?: number; label: string }[] = []

  if (meta.downloads?.client?.url) {
    jobs.push({
      url: meta.downloads.client.url,
      dest: path.join(versionDir, `${versionId}.jar`),
      size: meta.downloads.client.size,
      label: '客户端 jar',
    })
  }

  const nativeJars: { file: string; exclude?: string[] }[] = []
  for (const lib of meta.libraries ?? []) {
    if (!rulesAllow(lib.rules, {})) continue
    const target = libraryTarget(lib)
    if (target) {
      jobs.push({
        url: target.url,
        dest: path.join(paths.libraries, target.path),
        size: target.size,
        label: target.path,
      })
    }
    const native = nativeTarget(lib)
    if (native) {
      const file = path.join(paths.libraries, native.path)
      jobs.push({ url: native.url, dest: file, size: native.size, label: native.path })
      nativeJars.push({ file, exclude: lib.extract?.exclude })
    }
  }

  const assetJobs: { url: string; dest: string }[] = []
  if (meta.assetIndex?.url) {
    ctx.log(`读取资源索引 ${meta.assetIndex.id}`)
    const index = await fetchJson<{ objects: Record<string, { hash: string; size: number }> }>(meta.assetIndex.url)
    await writeJson(path.join(paths.assets, 'indexes', `${meta.assetIndex.id}.json`), index)
    for (const object of Object.values(index.objects)) {
      const sub = object.hash.slice(0, 2)
      assetJobs.push({
        url: `${ASSET_BASE}${sub}/${object.hash}`,
        dest: path.join(paths.assets, 'objects', sub, object.hash),
      })
    }
  }

  const everything = [...jobs, ...assetJobs.map((job) => ({ ...job, size: undefined as number | undefined, label: '资源文件' }))]
  const total = everything.length
  let done = 0

  ctx.log(`开始下载 · ${jobs.length} 个核心文件 / ${assetJobs.length} 个资源文件`)
  await runPool(everything, 16, async (job) => {
    const exists = await fileExists(job.dest)
    if (exists && (!job.size || (await fsp.stat(job.dest)).size === job.size)) {
      done += 1
      ctx.progress('download', done, total, job.label)
      return
    }
    await downloadFile(job.url, job.dest)
    done += 1
    ctx.progress('download', done, total, job.label)
  })

  const nativesDir = path.join(versionDir, 'natives')
  await fsp.rm(nativesDir, { recursive: true, force: true })
  await fsp.mkdir(nativesDir, { recursive: true })
  for (const native of nativeJars) {
    try {
      const zip = new AdmZip(native.file)
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const name = path.basename(entry.entryName)
        if (name.startsWith('META-INF')) continue
        if (native.exclude?.some((rule) => entry.entryName.startsWith(rule))) continue
        await fsp.writeFile(path.join(nativesDir, name), entry.getData())
      }
    } catch {
      ctx.log(`解压本地库失败：${path.basename(native.file)}`, 'warn')
    }
  }

  ctx.log(`${versionId} 安装完成`)
}

/**
 * 确保某个版本的基础客户端已安装（供 Fabric / 加载器继承使用）。
 */
export async function ensureVanillaInstalled(gameDir: string, versionId: string, ctx: TaskCtx): Promise<void> {
  const paths = gamePaths(gameDir)
  const versionDir = path.join(paths.versions, versionId)
  const jsonFile = path.join(versionDir, `${versionId}.json`)
  const jarFile = path.join(versionDir, `${versionId}.jar`)
  if ((await fileExists(jsonFile)) && (await fileExists(jarFile))) return
  ctx.log(`检测到缺少基础版本 ${versionId}，先安装原版`)
  await installVanilla({ gameDir, versionId, ctx })
}
