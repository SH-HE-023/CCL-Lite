import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ModrinthProject, ModrinthProjectType, ModrinthVersion } from '../shared/types'
import { installModpack } from './modpack'
import { downloadFile, fetchJson } from './net'
import { gamePaths } from './paths'
import type { TaskCtx } from './task'

const API = 'https://api.modrinth.com/v2'

export async function searchModrinth(options: {
  projectType: ModrinthProjectType
  query: string
  gameVersion?: string
  loader?: string
  category?: string
}): Promise<ModrinthProject[]> {
  const facets: string[][] = [[`project_type:${options.projectType}`]]
  if (options.gameVersion) facets.push([`versions:${options.gameVersion}`])
  if (options.loader && options.projectType === 'mod') facets.push([`categories:${options.loader}`])
  if (options.category) facets.push([`categories:${options.category}`])

  const params = new URLSearchParams({
    query: options.query,
    limit: '24',
    index: options.query ? 'relevance' : 'downloads',
    facets: JSON.stringify(facets),
  })

  const data = await fetchJson<{
    hits: {
      project_id: string
      slug: string
      title: string
      description: string
      icon_url: string | null
      downloads: number
      categories: string[]
      versions: string[]
    }[]
  }>(`${API}/search?${params.toString()}`)

  return data.hits.map((hit) => ({
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url,
    downloads: hit.downloads,
    categories: hit.categories,
    versions: hit.versions,
    loaders: hit.categories.filter((c) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c)),
  }))
}

export async function listModrinthVersions(
  projectId: string,
  gameVersion?: string,
  loader?: string,
): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams()
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
  if (loader) params.set('loaders', JSON.stringify([loader]))
  const data = await fetchJson<
    {
      id: string
      name: string
      version_number: string
      game_versions: string[]
      loaders: string[]
      downloads: number
      files: { url: string; filename: string; size: number; primary: boolean }[]
    }[]
  >(`${API}/project/${projectId}/version?${params.toString()}`)

  return data.map((version) => {
    const file = version.files.find((f) => f.primary) ?? version.files[0]
    return {
      id: version.id,
      name: version.name,
      versionNumber: version.version_number,
      gameVersion: version.game_versions.join(', '),
      loaders: version.loaders,
      downloads: version.downloads,
      fileName: file?.filename ?? 'download.jar',
      fileUrl: file?.url ?? '',
      fileSize: file?.size ?? 0,
    }
  })
}

export async function installModrinthVersion(
  projectType: ModrinthProjectType,
  version: ModrinthVersion,
  gameDir: string,
  ctx: TaskCtx,
  unpack = false,
): Promise<void> {
  if (projectType === 'modpack' && unpack) {
    await installModpack(version, gameDir, ctx)
    return
  }
  if (!version.fileUrl) throw new Error('该项目没有可下载的文件')
  const paths = gamePaths(gameDir)
  const targetDir =
    projectType === 'modpack'
      ? path.join(gameDir, 'modpacks')
      : projectType === 'shader'
        ? paths.shaderpacks
      : projectType === 'resourcepack'
        ? paths.resourcepacks
        : projectType === 'datapack'
          ? path.join(gameDir, 'datapacks')
          : paths.mods

  await fsp.mkdir(targetDir, { recursive: true })
  const dest = path.join(targetDir, version.fileName)
  ctx.log(`下载 ${version.fileName}`)
  ctx.progress('download', 0, 1, version.fileName)
  await downloadFile(version.fileUrl, dest)
  ctx.progress('download', 1, 1, version.fileName)
  ctx.log(`已安装到 ${path.relative(gameDir, dest)}`)
}
