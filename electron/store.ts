import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Account, Settings } from '../shared/types'

export interface Store {
  settings: Settings
  accounts: Account[]
  currentAccountId: string | null
}

function defaultSettings(): Settings {
  return {
    gameDir: path.join(app.getPath('appData'), 'qidonqi', 'minecraft'),
    javaPath: '',
    memoryMB: 4096,
    jvmArgs: '',
    isolatedVersions: false,
    taskPriority: 'normal',
    cpuThreads: 0,
    networkLimitKB: 0,
    windowWidth: 1200,
    windowHeight: 780,
    launcherVisibility: 'keep',
    fileSource: 'official',
    versionSource: 'official',
    communitySource: 'modrinth',
    fileNameFormat: 'original',
    modStyle: 'flat',
    sslVerify: true,
    announcements: [
      '欢迎使用 CCL 启动器 · 当前为 0.1.0 开源精简版',
      '原版 1.21.x 与 26.x 全量版本可直接从 Mojang 官方源安装',
      'Fabric / Quilt / Forge / NeoForge 加载器已接入下载页',
      '模组 / 光影 / 整合包可在下载页检索安装',
      '离线账户即建即用，本版不含正版登录与联机功能',
    ].join('\n'),
    accentPrimary: '#C6F24E',
    accentSecondary: '#F0F1E8',
  }
}

function storeFile(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

let cached: Store | null = null

export function loadStore(): Store {
  if (cached) return cached
  const file = storeFile()
  let raw: Partial<Store> = {}
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Store>
  } catch {
    raw = {}
  }
  const store: Store = {
    settings: { ...defaultSettings(), ...(raw.settings ?? {}) },
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    currentAccountId: raw.currentAccountId ?? null,
  }
  cached = store
  return store
}

export function saveStore(store: Store): void {
  cached = store
  const file = storeFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

export function updateStore(mutator: (store: Store) => void): Store {
  const store = loadStore()
  mutator(store)
  saveStore(store)
  return store
}
