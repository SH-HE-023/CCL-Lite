import { BrowserWindow, webContents } from 'electron'
import type { TaskDone, TaskLog, TaskProgress } from '../shared/types'

export interface TaskCtx {
  id: string
  log: (message: string, level?: TaskLog['level']) => void
  progress: (phase: string, current: number, total: number, detail?: string) => void
  done: (ok: boolean, message?: string) => void
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  void webContents
}

export function createTask(id: string): TaskCtx {
  let lastEmit = 0
  return {
    id,
    log(message, level = 'info') {
      broadcast('task:log', { taskId: id, level, message } satisfies TaskLog)
    },
    progress(phase, current, total, detail) {
      const now = Date.now()
      if (now - lastEmit < 80 && current < total) return
      lastEmit = now
      broadcast('task:progress', { taskId: id, phase, current, total, detail } satisfies TaskProgress)
    },
    done(ok, message) {
      broadcast('task:done', { taskId: id, ok, message } satisfies TaskDone)
    },
  }
}
