import { X } from 'lucide-react'
import type { TaskState } from '../lib/use-task'
import { Button, GlassCard, ProgressBar, Spinner } from './ui'

export function TaskBar({ task, onDismiss }: { task: TaskState | null; onDismiss: () => void }) {
  if (!task) return null
  const percent = task.progress && task.progress.total > 0
    ? Math.round((task.progress.current / task.progress.total) * 100)
    : null
  const lastLog = task.logs.slice(-1)[0]

  return (
    <GlassCard strong className="sticky bottom-3 z-10 mt-4 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]">
          {task.running ? <Spinner className="text-grass" /> : <span className="h-2 w-2 bg-grass" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] text-ink-100">{task.label}</span>
            <span className="shrink-0 font-pixel text-[9.5px] text-ink-400">
              {task.error ? 'FAILED' : task.running ? `${percent ?? '…'}%` : 'DONE'}
            </span>
          </div>
          {task.running ? (
            <div className="mt-2">
              <ProgressBar current={task.progress?.current ?? 0} total={task.progress?.total ?? 0} />
            </div>
          ) : null}
          {task.progress?.detail || lastLog ? (
            <div className="mt-1.5 truncate font-mono text-[10.5px] text-ink-400">
              {task.progress?.phase ? `[${task.progress.phase}] ` : ''}
              {task.error ?? lastLog?.message ?? task.progress?.detail ?? ''}
            </div>
          ) : null}
        </div>
        {!task.running ? (
          <Button variant="subtle" size="sm" onClick={onDismiss}>
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </GlassCard>
  )
}
