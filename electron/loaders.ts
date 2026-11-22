import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { LoaderRelease, LoaderType } from '../shared/types'
import { fetchJson, fetchText, downloadFile, fileExists, writeJson } from './net'
import { gamePaths } from './paths'
import { ensureVanillaInstalled } from './mojang'
import { installMojangJava, pickJava } from './java'
import type { TaskCtx } from './task'

const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader'
const QUILT_META = 'https://meta.quiltmc.org/v3/versions/loader'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'

function mcJavaMajor(mcVersion: string): number {
  const parts = mcVersion.split('.').map(Number)
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21
  if (minor >= 17) return 17
  return 8
}

export async function listLoaderVersions(loader: LoaderType, mcVersion: string): Promise<LoaderRelease[]> {
  if (loader === 'fabric' || loader === 'quilt') {
    const base = loader === 'fabric' ? FABRIC_META : QUILT_META
    const data = await fetchJson<{ loader?: { version?: string; stable?: boolean }; build?: number }[]>(
      `${base}/${mcVersion}`,
    )
    return data
      .map((item) => ({ version: item.loader?.version ?? '', stable: Boolean(item.loader?.stable) }))
      .filter((item) => item.version)
  }

  if (loader === 'forge') {
    const xml = await fetchText(`${FORGE_MAVEN}/maven-metadata.xml`)
    const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    let recommended: string | null = null
    try {
      const promo = await fetchJson<{ promos: Record<string, string> }>(
        'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
      )
      recommended = promo.promos[`${mcVersion}-recommended`] ?? null
    } catch {
      recommended = null
    }
    const filtered = all
      .filter((version) => version.startsWith(`${mcVersion}-`))
      .map((version) => {
        const build = version.slice(mcVersion.length + 1)
        return { version: build, stable: recommended !== null && build === recommended }
      })
    return filtered.sort((a, b) => (a.stable === b.stable ? b.version.localeCompare(a.version, undefined, { numeric: true }) : a.stable ? -1 : 1))
  }

  if (loader === 'neoforge') {
    const xml = await fetchText(`${NEOFORGE_MAVEN}/maven-metadata.xml`)
    const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    const parts = mcVersion.split('.').map(Number)
    const prefix = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : `${parts[1] ?? 0}.0`
    const filtered = all
      .filter((version) => version.startsWith(`${prefix}.`))
      .map((version) => ({ version, stable: !version.includes('beta') }))
    return filtered.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
  }

  return []
}

async function runInstaller(
  javaPath: string,
  installerPath: string,
  gameDir: string,
  ctx: TaskCtx,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerPath, '--installClient'], {
      cwd: gameDir,
      windowsHide: true,
    })
    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      text.split(/\r?\n/).forEach((line) => line.trim() && ctx.log(line.trim(), 'game'))
    })
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      text.split(/\r?\n/).forEach((line) => line.trim() && ctx.log(line.trim(), 'warn'))
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? -1))
  })
}

async function ensureJava(gameDir: string, mcVersion: string, ctx: TaskCtx): Promise<string> {
  const required = mcJavaMajor(mcVersion)
  const java = await pickJava(gameDir, '', required)
  if (java && java.major >= required) return java.path
  ctx.log(`安装器需要 Java ${required}，自动下载 Mojang 运行时`)
  return installMojangJava(required, gameDir, ctx)
}

export async function installLoader(
  loader: LoaderType,
  mcVersion: string,
  loaderVersion: string,
  gameDir: string,
  ctx: TaskCtx,
): Promise<string> {
  const paths = gamePaths(gameDir)
  await fsp.mkdir(paths.versions, { recursive: true })

  if (loader === 'fabric' || loader === 'quilt') {
    const base = loader === 'fabric' ? FABRIC_META : QUILT_META
    ctx.log(`获取 ${loader} 安装配置`)
    const profile = await fetchJson<{ id: string }>(`${base}/${mcVersion}/${loaderVersion}/profile/json`)
    const id = profile.id
    const dir = path.join(paths.versions, id)
    await fsp.mkdir(dir, { recursive: true })
    await writeJson(path.join(dir, `${id}.json`), profile)
    await ensureVanillaInstalled(gameDir, mcVersion, ctx)
    ctx.log(`${id} 已写入`)
    return id
  }

  const javaPath = await ensureJava(gameDir, mcVersion, ctx)
  await fsp.mkdir(gameDir, { recursive: true })
  const profilesFile = path.join(gameDir, 'launcher_profiles.json')
  if (!(await fileExists(profilesFile))) {
    await fsp.writeFile(profilesFile, JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: '' }, null, 2))
  }

  let installerUrl = ''
  let installerName = ''
  if (loader === 'forge') {
    const full = `${mcVersion}-${loaderVersion}`
    installerUrl = `${FORGE_MAVEN}/${full}/forge-${full}-installer.jar`
    installerName = `forge-${full}-installer.jar`
  } else {
    installerUrl = `${NEOFORGE_MAVEN}/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
    installerName = `neoforge-${loaderVersion}-installer.jar`
  }

  const cacheDir = path.join(gameDir, '.qidonqi-cache')
  const installerPath = path.join(cacheDir, installerName)
  ctx.log(`下载安装器 ${installerName}`)
  await downloadFile(installerUrl, installerPath)
  ctx.progress('installer', 0, 1, installerName)

  const before = await fsp.readdir(paths.versions).catch(() => [] as string[])
  ctx.log('运行安装器（首次会较慢，无需手动操作）')
  const code = await runInstaller(javaPath, installerPath, gameDir, ctx)
  if (code !== 0) throw new Error(`安装器退出码 ${code}，请查看日志`)

  const after = await fsp.readdir(paths.versions).catch(() => [] as string[])
  const created = after.filter((name) => !before.includes(name))
  const expected = after.find((name) =>
    loader === 'forge' ? name === `${mcVersion}-forge-${loaderVersion}` || name.includes(`${mcVersion}-forge`) : name.includes('neoforge'),
  )
  ctx.log(`安装完成：${created.join('、') || expected || '已写入版本目录'}`)
  return expected ?? created[0] ?? ''
}
