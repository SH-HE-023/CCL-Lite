import { useEffect, useState } from 'react'
import type { JavaInfo, Settings } from '@shared/types'
import { useApp } from '../lib/app-context'
import { api, cleanError } from '../lib/utils'
import { Button, Field, GlassCard, PageHeader, cx } from '../components/ui'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-white/[0.05] py-4 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] text-ink-100">{label}</span>
        {hint ? <span className="text-[10.5px] text-ink-400">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const { state, setState } = useApp()
  const [draft, setDraft] = useState<Settings | null>(state?.settings ?? null)
  const [javas, setJavas] = useState<JavaInfo[]>([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (state?.settings) setDraft(state.settings)
  }, [state?.settings])

  useEffect(() => {
    void api.detectJava().then(setJavas).catch(() => setJavas([]))
  }, [])

  const patch = (next: Partial<Settings>) => setDraft((current) => (current ? { ...current, ...next } : current))

  const save = async () => {
    if (!draft) return
    setError(null)
    try {
      setState(await api.saveSettings(draft))
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      setError(cleanError(err))
    }
  }

  const memoryGB = draft ? (draft.memoryMB / 1024).toFixed(1) : '0'

  return (
    <div className="mx-auto w-full max-w-[880px] px-8 pb-16">
      <PageHeader title="设置" description="只保留启动需要的三项：游戏目录、Java、内存。" />

      {!draft ? (
        <div className="mt-10 text-[13px] text-ink-400">正在读取配置…</div>
      ) : (
        <div className="mt-2 flex flex-col gap-5">
          <GlassCard className="p-6">
            <div className="text-[13px] text-ink-100">游戏目录</div>
            <Row label="版本与存档存放位置" hint=".minecraft 结构">
              <div className="flex items-stretch gap-2">
                <input
                  value={draft.gameDir}
                  onChange={(event) => patch({ gameDir: event.target.value })}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 font-mono text-[12px] text-ink-100 outline-none focus:border-grass/50"
                />
                <Button variant="subtle" size="md" className="h-10 shrink-0" onClick={() => void api.openPath(draft.gameDir)}>
                  打开目录
                </Button>
              </div>
            </Row>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="text-[13px] text-ink-100">Java 运行时</div>
            <Row label="启动时使用的 Java" hint="留空则自动挑选合适的版本">
              <div className="flex items-center gap-2">
                <input
                  value={draft.javaPath}
                  onChange={(event) => patch({ javaPath: event.target.value })}
                  placeholder="自动检测"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 font-mono text-[12px] text-ink-100 outline-none placeholder:text-ink-400 focus:border-grass/50"
                />
                <Button
                  variant="subtle"
                  size="md"
                  className="h-10 shrink-0"
                  onClick={() => void api.detectJava().then(setJavas).catch(() => setJavas([]))}
                >
                  重新检测
                </Button>
              </div>

              {javas.length > 0 ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  {javas.slice(0, 6).map((item) => {
                    const selected = draft.javaPath === item.path
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => patch({ javaPath: selected ? '' : item.path })}
                        className={cx(
                          'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                          selected
                            ? 'border-grass/45 bg-grass/[0.06]'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20',
                        )}
                      >
                        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', selected ? 'bg-grass' : 'bg-white/25')} />
                        <span className="shrink-0 text-[12px] text-ink-100">Java {item.version}</span>
                        <span className="shrink-0 text-[10.5px] text-ink-400">
                          {item.major} · {item.arch}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-ink-400">
                          {item.path}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-ink-400">
                  没检测到 Java，启动时会自动下载 Mojang 官方运行时。
                </div>
              )}
            </Row>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="text-[13px] text-ink-100">内存</div>
            <Row label="最大分配内存" hint={`当前 ${memoryGB} GB`}>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={Math.min(Math.max(draft.memoryMB, 1024), 16384)}
                  onChange={(event) => patch({ memoryMB: Number(event.target.value) })}
                  className="h-1.5 flex-1 accent-grass"
                />
                <input
                  value={draft.memoryMB}
                  onChange={(event) => patch({ memoryMB: Math.max(512, Number(event.target.value) || 512) })}
                  className="h-9 w-24 shrink-0 rounded-lg border border-white/10 bg-black/25 px-2 text-center font-mono text-[12px] text-ink-100 outline-none focus:border-grass/50"
                />
                <span className="shrink-0 text-[10.5px] text-ink-400">MB</span>
              </div>
            </Row>
          </GlassCard>

          {error ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-[12px] text-danger">{error}</div>
          ) : null}

          <div className="flex items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => void save()}>
              保存设置
            </Button>
            {saved ? <span className="text-[11.5px] text-grass-soft">已保存</span> : null}
          </div>

          <Field label="主题">
            <span className="text-[11.5px] text-ink-400">配色固定为墨黑 / 纸白 / 嫩芽绿三色，这一版不提供切换。</span>
          </Field>
        </div>
      )}
    </div>
  )
}
