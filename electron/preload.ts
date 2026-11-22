import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../shared/channels'
import type { SkinProfileQuery, TaskDone, TaskLog, TaskProgress } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('qidonqi', {
  getState: () => ipcRenderer.invoke(CH.stateGet),
  saveSettings: (patch: unknown) => ipcRenderer.invoke(CH.settingsSave, patch),
  getRemoteVersions: (force?: boolean) => ipcRenderer.invoke(CH.versionsRemote, force),
  installVersion: (versionId: string, taskId: string) => ipcRenderer.invoke(CH.versionsInstall, versionId, taskId),
  deleteVersion: (versionId: string) => ipcRenderer.invoke(CH.versionsDelete, versionId),
  launch: (versionId: string) => ipcRenderer.invoke(CH.gameLaunch, versionId),
  killGame: () => ipcRenderer.invoke(CH.gameKill),
  isGameRunning: () => ipcRenderer.invoke(CH.gameRunning),

  createOfflineAccount: (name: string) => ipcRenderer.invoke(CH.accountOffline, name),
  removeAccount: (accountId: string) => ipcRenderer.invoke(CH.accountRemove, accountId),
  setCurrentAccount: (accountId: string) => ipcRenderer.invoke(CH.accountCurrent, accountId),
  skinGet: (query: SkinProfileQuery) => ipcRenderer.invoke(CH.skinGet, query),

  listLoaders: (loader: string, mcVersion: string) => ipcRenderer.invoke(CH.loadersList, loader, mcVersion),
  installLoader: (loader: string, mcVersion: string, loaderVersion: string, taskId: string) =>
    ipcRenderer.invoke(CH.loadersInstall, loader, mcVersion, loaderVersion, taskId),

  searchModrinth: (options: unknown) => ipcRenderer.invoke(CH.modrinthSearch, options),
  listModrinthVersions: (projectId: string, gameVersion?: string, loader?: string) =>
    ipcRenderer.invoke(CH.modrinthVersions, projectId, gameVersion, loader),
  installModrinthVersion: (projectType: string, version: unknown, taskId: string, unpack?: boolean) =>
    ipcRenderer.invoke(CH.modrinthInstall, projectType, version, taskId, unpack),

  detectJava: () => ipcRenderer.invoke(CH.javaDetect),

  openPath: (target: string) => ipcRenderer.invoke(CH.shellOpen, target),
  openExternal: (url: string) => ipcRenderer.invoke(CH.openExternal, url),

  windowMinimize: () => ipcRenderer.invoke(CH.windowMinimize),
  windowClose: () => ipcRenderer.invoke(CH.windowClose),
  windowToggleMaximize: () => ipcRenderer.invoke(CH.windowToggleMaximize),

  onProgress: (cb: (p: TaskProgress) => void) => subscribe(CH.evProgress, cb),
  onLog: (cb: (l: TaskLog) => void) => subscribe(CH.evLog, cb),
  onTaskDone: (cb: (d: TaskDone) => void) => subscribe(CH.evDone, cb),
  onGameExit: (cb: (info: { code: number | null }) => void) => subscribe(CH.evGameExit, cb),
})
