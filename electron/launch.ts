import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import type { Account, Settings } from '../shared/types'
import { gamePaths } from './paths'
import {
  ensureVanillaInstalled,
  libraryTarget,
  nativeTarget,
  rulesAllow,
  type ArgumentEntry,
  type Library,
  type VersionJson,
} from './mojang'
import { fileExists, readJson } from './net'
import { installMojangJava, pickJava } from './java'
import type { TaskCtx } from './task'

let runningChild: ChildProcess | null = null

export function getRunningChild(): ChildProcess | null {
  return runningChild
}

export function killGame(): boolean {
  if (!runningChild) return false
  try {
    runningChild.kill()
    return true
  } catch {
    return false
  }
}

interface VersionChain {
  json: VersionJson
  rootId: string
}

function mergeVersion(parent: VersionJson, child: VersionJson): VersionJson {
  return {
    ...parent,
    ...child,
    id: child.id,
    mainClass: child.mainClass || parent.mainClass,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    assets: child.assets ?? parent.assets,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    downloads: { ...parent.downloads, ...child.downloads },
    libraries: [...(parent.libraries ?? []), ...(child.libraries ?? [])],
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])],
    },
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
  }
}

async function loadChain(gameDir: string, versionId: string): Promise<VersionChain> {
  const file = path.join(gamePaths(gameDir).versions, versionId, `${versionId}.json`)
  if (!(await fileExists(file))) throw new Error(`版本 ${versionId} 尚未安装`)
  const json = await readJson<VersionJson>(file)
  if (json.inheritsFrom) {
    const parent = await loadChain(gameDir, json.inheritsFrom)
    return { json: mergeVersion(parent.json, json), rootId: parent.rootId }
  }
  return { json, rootId: versionId }
}

function resolveEntries(
  entries: (string | ArgumentEntry)[] | undefined,
  features: Record<string, boolean>,
): string[] {
  const out: string[] = []
  for (const entry of entries ?? []) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    if (!rulesAllow(entry.rules, features)) continue
    if (Array.isArray(entry.value)) out.push(...entry.value)
    else out.push(entry.value)
  }
  return out
}

function substitute(value: string, vars: Record<string, string>): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => vars[key] ?? '')
}

async function ensureNatives(gameDir: string, versionId: string, libs: Library[], ctx: TaskCtx): Promise<string> {
  const nativesDir = path.join(gamePaths(gameDir).versions, versionId, 'natives')
  await fsp.mkdir(nativesDir, { recursive: true })
  const natives = libs.map(nativeTarget).filter((item): item is { path: string; url: string; size?: number } => Boolean(item))
  if (natives.length === 0) return nativesDir

  for (const native of natives) {
    const archive = path.join(gamePaths(gameDir).libraries, native.path)
    if (!(await fileExists(archive))) continue
    try {
      const zip = new AdmZip(archive)
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const name = path.basename(entry.entryName)
        if (name.startsWith('META-INF')) continue
        const dest = path.join(nativesDir, name)
        if (!(await fileExists(dest))) await fsp.writeFile(dest, entry.getData())
      }
    } catch {
      ctx.log(`本地库解压失败：${path.basename(archive)}`, 'warn')
    }
  }
  return nativesDir
}

export interface LaunchOptions {
  gameDir: string
  settings: Settings
  account: Account
  versionId: string
  ctx: TaskCtx
}

export async function launchGame({ gameDir, settings, account, versionId, ctx }: LaunchOptions) {
  const paths = gamePaths(gameDir)
  const chain = await loadChain(gameDir, versionId)
  const json = chain.json

  const jarFile = path.join(paths.versions, chain.rootId, `${chain.rootId}.jar`)
  if (!(await fileExists(jarFile))) {
    ctx.log(`基础客户端缺失，尝试补装 ${chain.rootId}`, 'warn')
    await ensureVanillaInstalled(gameDir, chain.rootId, ctx)
  }
  if (!(await fileExists(jarFile))) throw new Error('客户端 jar 缺失，请重新安装该版本')

  const libs = (json.libraries ?? []).filter((lib) => rulesAllow(lib.rules, {}))
  const classpathEntries: string[] = []
  for (const lib of libs) {
    const target = libraryTarget(lib)
    if (!target) continue
    const file = path.join(paths.libraries, target.path)
    if (await fileExists(file)) classpathEntries.push(file)
    else ctx.log(`缺少库文件 ${target.path}，请重新安装版本`, 'warn')
  }
  classpathEntries.push(jarFile)

  const nativesDir = await ensureNatives(gameDir, versionId, libs, ctx)

  const requiredMajor = json.javaVersion?.majorVersion ?? 8
  let java = await pickJava(gameDir, settings.javaPath, requiredMajor)
  if (!java) {
    ctx.log(`未找到 Java ${requiredMajor}，自动下载 Mojang 运行时`)
    const javaPath = await installMojangJava(requiredMajor, gameDir, ctx, json.javaVersion?.component)
    java = { path: javaPath, version: String(requiredMajor), major: requiredMajor, arch: '64' }
  }
  if (java.major && json.javaVersion && java.major < json.javaVersion.majorVersion) {
    ctx.log(`当前 Java ${java.major} 低于游戏要求的 ${json.javaVersion.majorVersion}，将尝试自动下载`, 'warn')
    const javaPath = await installMojangJava(json.javaVersion.majorVersion, gameDir, ctx, json.javaVersion.component)
    java = { path: javaPath, version: String(json.javaVersion.majorVersion), major: json.javaVersion.majorVersion, arch: '64' }
  }

  await fsp.mkdir(paths.gameDir, { recursive: true })
  // 部分安装器需要 launcher_profiles.json
  const profiles = path.join(paths.gameDir, 'launcher_profiles.json')
  if (!(await fileExists(profiles))) {
    await fsp.writeFile(profiles, JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: '' }, null, 2))
  }

  const sep = process.platform === 'win32' ? ';' : ':'
  const indexId = json.assetIndex?.id ?? json.assets ?? 'legacy'
  const vars: Record<string, string> = {
    auth_player_name: account.name,
    version_name: versionId,
    game_directory: paths.gameDir,
    assets_root: paths.assets,
    game_assets: path.join(paths.assets),
    assets_index_name: indexId,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: account.accessToken,
    auth_session: `token:${account.accessToken}:${account.uuid}`,
    user_type: 'legacy',
    user_properties: '{}',
    version_type: String(json.type ?? 'release'),
    natives_directory: nativesDir,
    launcher_name: 'Qidonqi',
    launcher_version: app.getVersion(),
    classpath: classpathEntries.join(sep),
    classpath_separator: sep,
    library_directory: paths.libraries,
    resolution_width: '854',
    resolution_height: '480',
    clientid: '',
    auth_xuid: '',
  }

  const features = { is_demo_user: false, has_custom_resolution: false, has_quick_plays_support: false }
  let jvmArgs = resolveEntries(json.arguments?.jvm, features)
  let gameArgs = resolveEntries(json.arguments?.game, features)

  if (json.minecraftArguments) {
    gameArgs = json.minecraftArguments.split(/\s+/).filter(Boolean)
    if (jvmArgs.length === 0) {
      jvmArgs = ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
    }
  }

  const memory = Math.max(1024, settings.memoryMB)
  const extraJvm = ['-Xmx' + memory + 'M', `-Xms${Math.min(1024, memory)}M`]
  if (settings.cpuThreads > 0) extraJvm.push(`-XX:ActiveProcessorCount=${Math.min(settings.cpuThreads, 128)}`)
  if (settings.jvmArgs.trim()) extraJvm.push(...settings.jvmArgs.trim().split(/\s+/))
  if (requiredMajor <= 16) extraJvm.push('-Dlog4j2.formatMsgNoLookups=true')

  const resolvedJvm = jvmArgs.map((arg) => substitute(arg, vars))
  const resolvedGame = gameArgs.map((arg) => substitute(arg, vars))
  const args = [...extraJvm, ...resolvedJvm, json.mainClass, ...resolvedGame]

  ctx.log(`启动 ${versionId} · Java ${java.path}`)
  ctx.progress('launch', 0, 1, '启动游戏进程')

  const child = spawn(java.path, args, {
    cwd: paths.gameDir,
    env: { ...process.env },
    windowsHide: false,
  })
  runningChild = child

  const handleLine = (line: string, stream: 'stdout' | 'stderr') => {
    if (!line.trim()) return
    ctx.log(line, stream === 'stderr' ? 'warn' : 'game')
  }

  child.stdout?.on('data', (data: Buffer) => {
    data.toString('utf8').split(/\r?\n/).forEach((line) => handleLine(line, 'stdout'))
  })
  child.stderr?.on('data', (data: Buffer) => {
    data.toString('utf8').split(/\r?\n/).forEach((line) => handleLine(line, 'stderr'))
  })

  child.on('error', (error) => {
    ctx.log(`启动失败：${error.message}`, 'error')
    runningChild = null
  })

  child.on('exit', (code) => {
    ctx.log(`游戏进程退出，代码 ${code ?? '未知'}`, code === 0 ? 'info' : 'warn')
    runningChild = null
  })

  return { pid: child.pid ?? 0, child }
}

export function isRunning(): boolean {
  return runningChild !== null
}

export function readLatestLog(gameDir: string): string {
  try {
    return fs.readFileSync(path.join(gamePaths(gameDir).logs, 'latest.log'), 'utf8')
  } catch {
    return ''
  }
}
