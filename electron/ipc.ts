import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { CH } from '../shared/channels'
import type { AppState, LoaderType, ModrinthProjectType, Settings, SkinProfileQuery } from '../shared/types'
import { createOfflineAccount } from './auth'
import { resolveSkin } from './skin'
import { detectJava } from './java'
import { installLoader, listLoaderVersions } from './loaders'
import { installVanilla, fetchRemoteVersions } from './mojang'
import { installModrinthVersion, listModrinthVersions, searchModrinth } from './modrinth'
import { loadStore, updateStore } from './store'
import { createTask } from './task'
import { deleteVersion, listInstalledVersions } from './versions'
import { isRunning, killGame, launchGame } from './launch'

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

async function buildState(): Promise<AppState> {
  const store = loadStore()
  return {
    settings: store.settings,
    accounts: store.accounts,
    currentAccountId: store.currentAccountId,
    versions: await listInstalledVersions(store.settings.gameDir),
    platform: process.platform,
    homeDir: app.getPath('home'),
    appVersion: app.getVersion(),
    defaultGameDir: path.join(app.getPath('appData'), 'qidonqi', 'minecraft'),
    totalMemoryMB: Math.floor(os.totalmem() / 1024 / 1024),
    cpuCount: os.cpus().length,
  }
}

export function registerIpc(): void {
  ipcMain.handle(CH.stateGet, async () => buildState())

  ipcMain.handle(CH.settingsSave, async (_event, patch: Partial<Settings>) => {
    updateStore((store) => {
      const next = { ...store.settings, ...patch }
      const totalMB = Math.floor(os.totalmem() / 1024 / 1024)
      next.memoryMB = Math.min(Math.max(1024, Number(next.memoryMB) || 2048), Math.max(1024, totalMB))
      next.gameDir = String(next.gameDir ?? '').trim() || store.settings.gameDir
      next.javaPath = String(next.javaPath ?? '').trim()
      next.jvmArgs = String(next.jvmArgs ?? '')
      store.settings = next
    })
    return buildState()
  })

  ipcMain.handle(CH.versionsRemote, async (_event, force?: boolean) => fetchRemoteVersions(Boolean(force)))

  ipcMain.handle(CH.versionsInstall, async (_event, versionId: string, taskId: string) => {
    const store = loadStore()
    const ctx = createTask(taskId)
    try {
      await installVanilla({ gameDir: store.settings.gameDir, versionId, ctx })
      ctx.done(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.log(message, 'error')
      ctx.done(false, message)
      throw new Error(message)
    }
  })

  ipcMain.handle(CH.versionsDelete, async (_event, versionId: string) => {
    const store = loadStore()
    await deleteVersion(store.settings.gameDir, versionId)
    return buildState()
  })

  ipcMain.handle(CH.gameLaunch, async (_event, versionId: string) => {
    const store = loadStore()
    const account = store.accounts.find((item) => item.id === store.currentAccountId)
    if (!account) throw new Error('请先添加并选择一个账户')

    const ctx = createTask(`launch:${versionId}`)
    const result = await launchGame({
      gameDir: store.settings.gameDir,
      settings: store.settings,
      account,
      versionId,
      ctx,
    })
    result.child.on('exit', (code) => {
      broadcast(CH.evGameExit, { code })
      ctx.done(code === 0, `游戏进程退出（${code ?? '未知'}）`)
    })
    if (store.settings.launcherVisibility === 'minimize') {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) win.minimize()
    }
    return { pid: result.pid }
  })

  ipcMain.handle(CH.gameKill, async () => killGame())
  ipcMain.handle(CH.gameRunning, async () => isRunning())

  ipcMain.handle(CH.accountOffline, async (_event, name: string) => {
    const account = createOfflineAccount(name)
    updateStore((store) => {
      if (store.accounts.some((item) => item.name === account.name)) {
        throw new Error('已存在同名的离线账户')
      }
      store.accounts.push(account)
      store.currentAccountId = account.id
    })
    return buildState()
  })

  ipcMain.handle(CH.accountRemove, async (_event, accountId: string) => {
    updateStore((store) => {
      store.accounts = store.accounts.filter((item) => item.id !== accountId)
      if (store.currentAccountId === accountId) {
        store.currentAccountId = store.accounts[0]?.id ?? null
      }
    })
    return buildState()
  })

  ipcMain.handle(CH.accountCurrent, async (_event, accountId: string) => {
    updateStore((store) => {
      if (!store.accounts.some((item) => item.id === accountId)) throw new Error('账户不存在')
      store.currentAccountId = accountId
    })
    return buildState()
  })

  ipcMain.handle(CH.skinGet, async (_event, query: SkinProfileQuery) => resolveSkin(query))

  ipcMain.handle(CH.loadersList, async (_event, loader: LoaderType, mcVersion: string) =>
    listLoaderVersions(loader, mcVersion),
  )

  ipcMain.handle(
    CH.loadersInstall,
    async (_event, loader: LoaderType, mcVersion: string, loaderVersion: string, taskId: string) => {
      const store = loadStore()
      const ctx = createTask(taskId)
      try {
        const id = await installLoader(loader, mcVersion, loaderVersion, store.settings.gameDir, ctx)
        ctx.done(true, id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(message, 'error')
        ctx.done(false, message)
        throw new Error(message)
      }
    },
  )

  ipcMain.handle(CH.modrinthSearch, async (_event, options: Parameters<typeof searchModrinth>[0]) =>
    searchModrinth(options),
  )

  ipcMain.handle(CH.modrinthVersions, async (_event, projectId: string, gameVersion?: string, loader?: string) =>
    listModrinthVersions(projectId, gameVersion, loader),
  )

  ipcMain.handle(
    CH.modrinthInstall,
    async (
      _event,
      projectType: ModrinthProjectType,
      version: Parameters<typeof installModrinthVersion>[1],
      taskId: string,
      unpack?: boolean,
    ) => {
      const store = loadStore()
      const ctx = createTask(taskId)
      try {
        await installModrinthVersion(projectType, version, store.settings.gameDir, ctx, Boolean(unpack))
        ctx.done(true)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(message, 'error')
        ctx.done(false, message)
        throw new Error(message)
      }
    },
  )

  ipcMain.handle(CH.javaDetect, async () => {
    const store = loadStore()
    return detectJava(store.settings.gameDir, store.settings.javaPath, true)
  })

  ipcMain.handle(CH.shellOpen, async (_event, target: string) => {
    const store = loadStore()
    const resolved = target === 'gameDir' ? store.settings.gameDir : target
    await shell.openPath(resolved)
  })

  ipcMain.handle(CH.openExternal, async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // ---------- 无边框窗口控制 ----------
  ipcMain.handle(CH.windowMinimize, async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle(CH.windowClose, async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(CH.windowToggleMaximize, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
}
