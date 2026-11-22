import path from 'node:path'

export interface GamePaths {
  gameDir: string
  versions: string
  libraries: string
  assets: string
  runtime: string
  mods: string
  shaderpacks: string
  resourcepacks: string
  saves: string
  logs: string
}

export function gamePaths(gameDir: string): GamePaths {
  return {
    gameDir,
    versions: path.join(gameDir, 'versions'),
    libraries: path.join(gameDir, 'libraries'),
    assets: path.join(gameDir, 'assets'),
    runtime: path.join(gameDir, 'runtime'),
    mods: path.join(gameDir, 'mods'),
    shaderpacks: path.join(gameDir, 'shaderpacks'),
    resourcepacks: path.join(gameDir, 'resourcepacks'),
    saves: path.join(gameDir, 'saves'),
    logs: path.join(gameDir, 'logs'),
  }
}

export const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
export const ASSET_BASE = 'https://resources.download.minecraft.net/'
export const JAVA_RUNTIME_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
