import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { JavaInfo } from '../shared/types'
import { downloadFile, fetchJson, runPool } from './net'
import { JAVA_RUNTIME_URL, gamePaths } from './paths'
import type { TaskCtx } from './task'

const execFileAsync = promisify(execFile)

const JAVA_BIN = process.platform === 'win32' ? 'java.exe' : 'java'

const COMPONENT_BY_MAJOR: Record<number, string> = {
  8: 'jre-legacy',
  16: 'java-runtime-alpha',
  17: 'java-runtime-gamma',
  21: 'java-runtime-delta',
}

function componentFor(major: number): string {
  if (COMPONENT_BY_MAJOR[major]) return COMPONENT_BY_MAJOR[major]
  return major >= 21 ? 'java-runtime-delta' : 'java-runtime-gamma'
}

async function readVersionOf(javaPath: string): Promise<JavaInfo | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], { timeout: 8000 })
    const output = `${stdout}\n${stderr}`
    const match = output.match(/version\s+"([^"]+)"/)
    const raw = match?.[1] ?? ''
    let major = Number(raw.split('.')[0])
    if (raw.startsWith('1.')) major = Number(raw.split('.')[1])
    const arch = /64-Bit|arm64|x86_64|aarch64/i.test(output) ? '64' : '32'
    return { path: javaPath, version: raw || '未知', major: Number.isFinite(major) ? major : 0, arch }
  } catch {
    return null
  }
}

async function listJavaIn(baseDir: string, depth = 2): Promise<string[]> {
  const found: string[] = []
  async function walk(dir: string, level: number) {
    if (level > depth) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === JAVA_BIN.toLowerCase()) found.push(full)
      else if (entry.isDirectory()) await walk(full, level + 1)
    }
  }
  await walk(baseDir, 0)
  return found
}

async function candidateDirs(): Promise<string[]> {
  const dirs: string[] = []
  if (process.platform === 'win32') {
    const programFiles = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['ProgramW6432']]
      .filter(Boolean)
      .map(String)
    for (const base of programFiles) {
      dirs.push(path.join(base, 'Java'), path.join(base, 'Eclipse Adoptium'), path.join(base, 'Eclipse Foundation'))
      dirs.push(path.join(base, 'Microsoft'), path.join(base, 'Zulu'), path.join(base, 'BellSoft'), path.join(base, 'Amazon Corretto'))
      dirs.push(path.join(base, 'Common Files', 'Oracle', 'Java', 'javapath'))
    }
    dirs.push(path.join(os.homedir(), '.jdks'), path.join(os.homedir(), 'scoop', 'apps'))
  } else if (process.platform === 'darwin') {
    dirs.push('/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt', '/usr/local/opt')
  } else {
    dirs.push('/usr/lib/jvm', '/opt/java', '/usr/local/java')
  }
  return dirs
}

let cachedJava: JavaInfo[] | null = null

export async function detectJava(gameDir: string, preferred = '', force = false): Promise<JavaInfo[]> {
  if (cachedJava && !force) return cachedJava
  const results: JavaInfo[] = []
  const seen = new Set<string>()

  const runtimesDir = gamePaths(gameDir).runtime
  const local = await listJavaIn(runtimesDir, 4)

  const candidates = [
    ...(preferred ? [preferred] : []),
    ...(process.env['JAVA_HOME'] ? [path.join(process.env['JAVA_HOME'], 'bin', JAVA_BIN)] : []),
    ...local,
  ]

  for (const dir of await candidateDirs()) {
    candidates.push(...(await listJavaIn(dir, 3)))
  }

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate)
    if (seen.has(normalized.toLowerCase())) continue
    seen.add(normalized.toLowerCase())
    if (!(await fsp.stat(normalized).catch(() => null))) continue
    const info = await readVersionOf(normalized)
    if (info) results.push(info)
  }

  // PATH 中的 java
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', ['java'])
    for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
      const info = await readVersionOf(line.trim())
      if (info && !results.some((item) => item.path.toLowerCase() === info.path.toLowerCase())) results.push(info)
    }
  } catch {
    // 没有 PATH java，忽略
  }

  results.sort((a, b) => b.major - a.major)
  cachedJava = results
  return results
}

export async function pickJava(gameDir: string, settingsJavaPath: string, requiredMajor: number): Promise<JavaInfo | null> {
  const javas = await detectJava(gameDir, settingsJavaPath)
  if (settingsJavaPath) {
    const hit = javas.find((item) => item.path.toLowerCase() === settingsJavaPath.toLowerCase())
    if (hit) return hit
    const manual = await readVersionOf(settingsJavaPath)
    if (manual) return manual
  }
  const exact = javas.find((item) => item.major === requiredMajor)
  if (exact) return exact
  const newer = javas.filter((item) => item.major >= requiredMajor).sort((a, b) => a.major - b.major)
  if (newer.length > 0) return newer[0]
  return javas[0] ?? null
}

interface RuntimeIndex {
  [platform: string]: {
    [component: string]: { manifest: { url: string }; version: { name: string } }[]
  }
}

interface RuntimeManifest {
  files: Record<
    string,
    | { type: 'directory' }
    | { type: 'link'; target: string }
    | { type: 'file'; executable?: boolean; downloads?: { raw?: { url: string; size: number } } }
  >
}

function platformKey(): string {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return 'linux'
}

export function runtimeJavaPath(gameDir: string, component: string): string {
  return path.join(gamePaths(gameDir).runtime, component, 'bin', JAVA_BIN)
}

export async function installMojangJava(
  major: number,
  gameDir: string,
  ctx: TaskCtx,
  componentOverride?: string,
): Promise<string> {
  const component = componentOverride || componentFor(major)
  const index = await fetchJson<RuntimeIndex>(JAVA_RUNTIME_URL)
  const platform = platformKey()
  const entries = index[platform]?.[component]
  if (!entries || entries.length === 0) throw new Error(` Mojang 运行库中没有 ${component} (${platform})`)
  const manifest = await fetchJson<RuntimeManifest>(entries[0].manifest.url)

  const root = path.join(gamePaths(gameDir).runtime, component)
  const files = Object.entries(manifest.files)
  const downloads = files.filter(([, item]) => item.type === 'file' && item.downloads?.raw)
  ctx.log(`下载 Java 运行时 ${entries[0].version.name} · ${downloads.length} 个文件`)

  let done = 0
  await runPool(files, 8, async ([relative, item]) => {
    const dest = path.join(root, relative)
    if (item.type === 'directory') {
      await fsp.mkdir(dest, { recursive: true })
      return
    }
    if (item.type !== 'file' || !item.downloads?.raw) return
    const exists = await fsp.stat(dest).catch(() => null)
    if (!exists || exists.size !== item.downloads.raw.size) {
      await downloadFile(item.downloads.raw.url, dest)
    }
    if (item.executable && process.platform !== 'win32') {
      await fsp.chmod(dest, 0o755).catch(() => undefined)
    }
    done += 1
    ctx.progress('java', done, downloads.length, component)
  })

  const javaPath = path.join(root, 'bin', JAVA_BIN)
  if (!(await fsp.stat(javaPath).catch(() => null))) throw new Error('运行时下载完成但未找到 java 可执行文件')
  cachedJava = null
  ctx.log(`Java 运行时就绪：${javaPath}`)
  return javaPath
}
