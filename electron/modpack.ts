import fsp from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type { LoaderType, ModrinthVersion } from '../shared/types'
import { downloadFile, fileExists } from './net'
import { ensureVanillaInstalled } from './mojang'
import { installLoader } from './loaders'
import type { TaskCtx } from './task'

interface PackFile {
  path: string
  env?: { client?: string; server?: string }
  downloads?: string[]
  fileSize?: number
}

interface PackIndex {
  name?: string
  versionId?: string
  dependencies?: Record<string, string>
  files?: PackFile[]
}

const LOADER_KEYS: { key: string; type: LoaderType }[] = [
  { key: 'fabric-loader', type: 'fabric' },
  { key: 'quilt-loader', type: 'quilt' },
  { key: 'forge', type: 'forge' },
  { key: 'neoforge', type: 'neoforge' },
]

/** 解包安装 Modrinth 整合包：装原版 → 装加载器 → 铺模组与配置覆盖 */
export async function installModpack(version: ModrinthVersion, gameDir: string, ctx: TaskCtx): Promise<void> {
  if (!version.fileUrl) throw new Error('整合包没有可下载的文件')

  const cacheDir = path.join(gameDir, '.qidonqi-cache')
  await fsp.mkdir(cacheDir, { recursive: true })
  const packPath = path.join(cacheDir, version.fileName)
  ctx.log(`下载整合包 ${version.fileName}`)
  ctx.progress('pack', 0, 1, version.fileName)
  await downloadFile(version.fileUrl, packPath)

  const zip = new AdmZip(packPath)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error('不是有效的 Modrinth 整合包（缺少 modrinth.index.json）')
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as PackIndex

  const deps = index.dependencies ?? {}
  const mcVersion = deps.minecraft
  if (!mcVersion) throw new Error('整合包没有声明 Minecraft 版本')

  const loader = LOADER_KEYS.map((item) => ({ type: item.type, version: deps[item.key] })).find(
    (item) => item.version,
  )
  ctx.log(`整合包 ${index.name ?? version.name} · ${mcVersion}${loader ? ` · ${loader.type} ${loader.version}` : ''}`)

  ctx.progress('version', 0, 1, mcVersion)
  await ensureVanillaInstalled(gameDir, mcVersion, ctx)
  ctx.progress('version', 1, 1, mcVersion)

  if (loader?.version) {
    ctx.progress('loader', 0, 1, loader.type)
    await installLoader(loader.type, mcVersion, loader.version, gameDir, ctx)
    ctx.progress('loader', 1, 1, loader.type)
  }

  const files = (index.files ?? []).filter(
    (file) => file.env?.client !== 'unsupported' && file.downloads && file.downloads.length > 0,
  )
  ctx.log(`铺设 ${files.length} 个整合包文件`)
  let done = 0
  for (const file of files) {
    const target = path.join(gameDir, file.path)
    if (!(await fileExists(target))) {
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await downloadFile(file.downloads![0], target)
    }
    done += 1
    ctx.progress('files', done, files.length, file.path)
  }

  const overrideEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.startsWith('overrides/'))
  for (const entry of overrideEntries) {
    const rel = entry.entryName.slice('overrides/'.length)
    if (!rel) continue
    const target = path.join(gameDir, rel)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.writeFile(target, entry.getData())
  }

  ctx.log(`整合包安装完成：${overrideEntries.length} 个配置覆盖，启动页选择 ${mcVersion} 进入`)
}
