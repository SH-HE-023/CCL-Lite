export type VersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface RemoteVersion {
  id: string
  type: VersionType
  releaseTime: string
  url: string
}

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export interface InstalledVersion {
  id: string
  loader: LoaderType
  loaderLabel: string
  inheritsFrom?: string
  javaMajor?: number
  installedAt: number
  sizeBytes: number
  isComplete: boolean
}

export interface Account {
  id: string
  type: 'offline' | 'microsoft' | 'authlib'
  name: string
  uuid: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  clientId?: string
  /** 外置登录（authlib-injector）的 Yggdrasil API 根地址 */
  authServerUrl?: string
  clientToken?: string
  serverName?: string
  createdAt: number
}

/** 皮肤贴图查询：按玩家名（或已登录 UUID）向正版 / 皮肤站取 64x64 贴图 */
export interface SkinProfileQuery {
  name: string
  uuid?: string
  type: Account['type']
  authServerUrl?: string
}

export interface SkinTexture {
  /** 64x64 PNG 的 data URL；null 表示没有皮肤，由界面回退到默认史蒂夫 */
  dataUrl: string | null
  model: 'classic' | 'slim'
  source: 'mojang' | 'authlib' | 'cache' | 'default'
}

export interface Settings {
  gameDir: string
  javaPath: string
  memoryMB: number
  jvmArgs: string
  isolatedVersions: boolean
  taskPriority: 'low' | 'normal' | 'high'
  cpuThreads: number
  networkLimitKB: number
  windowWidth: number
  windowHeight: number
  launcherVisibility: 'keep' | 'minimize'
  fileSource: 'official' | 'mirror'
  versionSource: 'official' | 'mirror'
  communitySource: 'modrinth'
  fileNameFormat: 'original' | 'name-version'
  modStyle: 'flat' | 'categorized'
  sslVerify: boolean
  announcements: string
  accentPrimary: string
  accentSecondary: string
}

export interface AppState {
  settings: Settings
  accounts: Account[]
  currentAccountId: string | null
  versions: InstalledVersion[]
  platform: string
  homeDir: string
  appVersion: string
  defaultGameDir: string
  totalMemoryMB: number
  cpuCount: number
}

export interface TaskProgress {
  taskId: string
  phase: string
  current: number
  total: number
  detail?: string
}

export interface TaskLog {
  taskId: string
  level: 'info' | 'warn' | 'error' | 'game'
  message: string
}

export interface TaskDone {
  taskId: string
  ok: boolean
  message?: string
}

export interface JavaInfo {
  path: string
  version: string
  major: number
  arch: string
}

export interface LoaderRelease {
  version: string
  stable: boolean
}

export interface ModrinthProject {
  id: string
  slug: string
  title: string
  description: string
  iconUrl: string | null
  downloads: number
  categories: string[]
  versions: string[]
  loaders: string[]
}

export type ModrinthProjectType = 'mod' | 'modpack' | 'shader' | 'resourcepack' | 'datapack'

export interface ModrinthVersion {
  id: string
  name: string
  versionNumber: string
  gameVersion: string
  loaders: string[]
  downloads: number
  fileName: string
  fileUrl: string
  fileSize: number
}

export interface LaunchResult {
  pid: number
}

declare global {
  interface Window {
    qidonqi: {
      getState: () => Promise<AppState>
      saveSettings: (patch: Partial<Settings>) => Promise<AppState>
      getRemoteVersions: (force?: boolean) => Promise<RemoteVersion[]>
      installVersion: (versionId: string, taskId: string) => Promise<void>
      deleteVersion: (versionId: string) => Promise<AppState>
      launch: (versionId: string) => Promise<LaunchResult>
      killGame: () => Promise<boolean>
      isGameRunning: () => Promise<boolean>

      createOfflineAccount: (name: string) => Promise<AppState>
      removeAccount: (accountId: string) => Promise<AppState>
      setCurrentAccount: (accountId: string) => Promise<AppState>

      skinGet: (query: SkinProfileQuery) => Promise<SkinTexture>

      listLoaders: (loader: LoaderType, mcVersion: string) => Promise<LoaderRelease[]>
      installLoader: (
        loader: LoaderType,
        mcVersion: string,
        loaderVersion: string,
        taskId: string,
      ) => Promise<void>

      searchModrinth: (options: {
        projectType: ModrinthProjectType
        query: string
        gameVersion?: string
        loader?: string
        category?: string
      }) => Promise<ModrinthProject[]>
      listModrinthVersions: (projectId: string, gameVersion?: string, loader?: string) => Promise<ModrinthVersion[]>
      installModrinthVersion: (
        projectType: ModrinthProjectType,
        version: ModrinthVersion,
        taskId: string,
        unpack?: boolean,
      ) => Promise<void>

      detectJava: () => Promise<JavaInfo[]>

      openPath: (target: string) => Promise<void>
      openExternal: (url: string) => Promise<void>

      windowMinimize: () => Promise<void>
      windowClose: () => Promise<void>
      windowToggleMaximize: () => Promise<boolean>

      onProgress: (cb: (p: TaskProgress) => void) => () => void
      onLog: (cb: (l: TaskLog) => void) => () => void
      onTaskDone: (cb: (d: TaskDone) => void) => () => void
      onGameExit: (cb: (info: { code: number | null }) => void) => () => void
    }
  }
}


