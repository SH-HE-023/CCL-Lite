import { useEffect, useRef, useState } from 'react'
import type { TaskLog, TaskProgress } from '@shared/types'
import { api, cleanError } from './utils'

export interface TaskState {
  id: string
  label: string
  progress: TaskProgress | null
  logs: TaskLog[]
  running: boolean
  error: string | null
}

export type TaskRun = (label: string, fn: (taskId: string) => Promise<unknown>) => Promise<void>

export function useTaskRunner() {
  const [task, setTask] = useState<TaskState | null>(null)
  const activeId = useRef<string | null>(null)

  useEffect(() => {
    const offProgress = api.onProgress((progress) => {
      setTask((current) =>
        current && current.id === progress.taskId ? { ...current, progress } : current,
      )
    })
    const offLog = api.onLog((log) => {
      setTask((current) =>
        current && current.id === log.taskId
          ? { ...current, logs: [...current.logs.slice(-300), log] }
          : current,
      )
    })
    const offDone = api.onTaskDone((done) => {
      setTask((current) =>
        current && current.id === done.taskId
          ? { ...current, running: false, error: done.ok ? null : (done.message ?? '任务失败') }
          : current,
      )
    })
    return () => {
      offProgress()
      offLog()
      offDone()
    }
  }, [])

  const run = async (label: string, fn: (taskId: string) => Promise<unknown>) => {
    const id = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    activeId.current = id
    setTask({ id, label, progress: null, logs: [], running: true, error: null })
    try {
      await fn(id)
    } catch (error) {
      setTask((current) =>
        current && current.id === id
          ? { ...current, running: false, error: cleanError(error) }
          : current,
      )
    }
  }

  const clear = () => {
    activeId.current = null
    setTask(null)
  }

  return { task, run, clear, activeId }
}
