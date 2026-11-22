import fsp from 'node:fs/promises'
import path from 'node:path'
import type { InstalledVersion, LoaderType } from '../shared/types'
import { gamePaths } from './paths'
import { readJson } from './net'
import type { VersionJson } from './mojang'

function detectLoader(id: string, json: VersionJson): { loader: LoaderType; label: string } {
  const lower = id.toLowerCase()
  if (lower.startsWith('fabric-loader')) {
    const parts = id.split('-')
    return { loader: 'fabric', label: `Fabric ${parts[2] ?? ''}`.trim() }
  }
  if (lower.startsWith('quilt-loader')) {
    const parts = id.split('-')
    return { loader: 'quilt', label: `Quilt ${parts[2] ?? ''}`.trim() }
  }
  if (lower.includes('neoforge')) return { loader: 'neoforge', label: 'NeoForge' }
  if (lower.includes('forge')) return { loader: 'forge', label: 'Forge' }
  return { loader: 'vanilla', label: '原版' }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSize(full)
    else {
      const stat = await fsp.stat(full).catch(() => null)
      total += stat?.size ?? 0
    }
  }
  return total
}

export async function listInstalledVersions(gameDir: string): Promise<InstalledVersion[]> {
  const paths = gamePaths(gameDir)
  let dirs: import('node:fs').Dirent[]
  try {
    dirs = await fsp.readdir(paths.versions, { withFileTypes: true })
  } catch {
    return []
  }

  const result: InstalledVersion[] = []
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const id = dir.name
    const versionDir = path.join(paths.versions, id)
    const jsonFile = path.join(versionDir, `${id}.json`)
    try {
      const json = await readJson<VersionJson>(jsonFile)
      const stat = await fsp.stat(jsonFile).catch(() => null)
      const jarExists = await fsp
        .stat(path.join(paths.versions, json.inheritsFrom ?? id, `${json.inheritsFrom ?? id}.jar`))
        .catch(() => null)
      const { loader, label } = detectLoader(id, json)
      result.push({
        id,
        loader,
        loaderLabel: label,
        inheritsFrom: json.inheritsFrom,
        javaMajor: json.javaVersion?.majorVersion,
        installedAt: stat?.mtimeMs ?? Date.now(),
        sizeBytes: await dirSize(versionDir),
        isComplete: Boolean(jarExists),
      })
    } catch {
      // 目录里没有有效 json，跳过
    }
  }
  result.sort((a, b) => b.installedAt - a.installedAt)
  return result
}

export async function deleteVersion(gameDir: string, versionId: string): Promise<void> {
  const target = path.join(gamePaths(gameDir).versions, versionId)
  const resolved = path.resolve(target)
  const root = path.resolve(gamePaths(gameDir).versions)
  if (!resolved.startsWith(root + path.sep)) throw new Error('非法的版本路径')
  await fsp.rm(resolved, { recursive: true, force: true })
}
