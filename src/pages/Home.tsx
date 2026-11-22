import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  FolderOpen,
  Layers,
  Megaphone,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import type { TaskLog, TaskProgress } from '@shared/types'
import { useApp } from '../lib/app-context'
import { api, cleanError, formatBytes } from '../lib/utils'
import { Badge, Button, cx, GlassCard, ProgressBar } from '../components/ui'
import { AccountHead, SkinFigure, SkinHead, skinQueryOf, useSkin } from '../components/SkinView'
import type { SkinData } from '../components/SkinView'

const ANNOUNCEMENTS = [
    '欢迎使用 CCL 启动器 · 当前为 0.1.0 内测版',
    '原版 1.21.x 与 26.x 全量版本可直接从 Mojang 官方源安装',
    'Fabric / Quilt / Forge / NeoForge 加载器已接入下载页',
    '离线账户即建即用，微软正版账户走设备码登录',
    '联机中心已上线：局域网直连 / P2P / IPv4 / IPv6 / 隧道 六种方式',
  ]

function SkinPanel({
  side,
  skin,
  accountName,
}: {
  side: 'left' | 'right'
  skin: SkinData
  accountName: string
}) {
  const modelLabel = skin.isDefault ? '默认史蒂夫' : skin.model === 'slim' ? '纤细皮肤' : '经典皮肤'
  return (
    <GlassCard className="relative hidden min-w-0 flex-col overflow-hidden p-5 lg:flex">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-400">
        <span>皮肤预览</span>
        <span>{side === 'left' ? '正面' : '背面'}</span>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-3">
        <div className="absolute bottom-10 h-20 w-2/3 rounded-[50%] bg-grass/15 blur-3xl" />
        <SkinFigure
          skin={skin}
          side={side === 'left' ? 'front' : 'back'}
          height={330}
          className={cx(
            'relative drop-shadow-[0_18px_28px_rgba(0,0,0,0.5)] transition-opacity',
            skin.loading ? 'opacity-60' : 'opacity-100',
          )}
        />
      </div>

      <div className="text-center">
        <div className="truncate text-[12.5px] text-ink-100">{accountName}</div>
        <div className="mt-1 text-[10.5px] text-ink-400">
          {side === 'left' ? '全身' : '背面'} · {modelLabel}
        </div>
      </div>
    </GlassCard>
  )
}

export default function Home() {
  const { state, setState } = useApp()
  const navigate = useNavigate()
  const versions = state?.versions ?? []
  const accounts = state?.accounts ?? []
  const account = accounts.find((item) => item.id === state?.currentAccountId)
  const skin = useSkin(skinQueryOf(account))

  const [selected, setSelected] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [pendingAccount, setPendingAccount] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [gameRunning, setGameRunning] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<TaskProgress | null>(null)
  const [logs, setLogs] = useState<TaskLog[]>([])
  const [showLogs, setShowLogs] = useState(false)

  const announcements = useMemo(() => {
    const list = (state?.settings.announcements ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return list.length > 0 ? list : ANNOUNCEMENTS
  }, [state?.settings.announcements])

  const activeVersion = versions.find((item) => item.id === selected) ?? versions[0] ?? null
  const totalSize = useMemo(() => versions.reduce((sum, item) => sum + item.sizeBytes, 0), [versions])

  useEffect(() => {
    if (!selected && versions[0]) setSelected(versions[0].id)
    if (selected && !versions.some((item) => item.id === selected)) setSelected(versions[0]?.id ?? '')
  }, [versions, selected])

  useEffect(() => {
    void api.isGameRunning().then(setGameRunning)
    const offExit = api.onGameExit(() => {
      setGameRunning(false)
      setLaunching(false)
    })
    const offProgress = api.onProgress((next) => {
      if (next.taskId.startsWith('launch:')) setProgress(next)
    })
    const offLog = api.onLog((log) => {
      if (log.taskId.startsWith('launch:')) setLogs((prev) => [...prev.slice(-160), log])
    })
    return () => {
      offExit()
      offProgress()
      offLog()
    }
  }, [])

  const selectAccount = async (accountId: string) => {
    try {
      setState(await api.setCurrentAccount(accountId))
    } catch (err) {
      setError(cleanError(err))
    }
  }

  const removeAccount = async (accountId: string) => {
    try {
      setState(await api.removeAccount(accountId))
      setPendingAccount(null)
      if (accounts.length <= 1) setAccountsOpen(false)
    } catch (err) {
      setError(cleanError(err))
    }
  }

  const createOffline = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      setState(await api.createOfflineAccount(name))
      setNewName('')
      setAdding(false)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const handleLaunch = async () => {
    if (!activeVersion) return
    setError(null)
    setLogs([])
    setProgress(null)
    setLaunching(true)
    try {
      await api.launch(activeVersion.id)
      setGameRunning(true)
    } catch (err) {
      setError(cleanError(err))
      setLaunching(false)
    }
  }

  const handleKill = async () => {
    await api.killGame()
    setGameRunning(false)
  }

  const removeVersion = async (versionId: string) => {
    try {
      setState(await api.deleteVersion(versionId))
      setPendingDelete(null)
    } catch (err) {
      setError(cleanError(err))
    }
  }

  const latestLog = logs.filter((log) => log.level !== 'game').slice(-1)[0]

  return (
    <div className="flex h-[calc(100vh-72px)] min-h-[520px] flex-col">
      <div className="grid min-h-0 flex-1 items-stretch gap-6 px-6 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)_minmax(0,1fr)] 2xl:gap-9 2xl:px-10">
        <SkinPanel side="left" skin={skin} accountName={account?.name ?? '未选择账户'} />

        <div className="flex min-w-0 flex-col items-center justify-center gap-5 py-2">
          <div className="flex min-h-[28px] max-w-[440px] flex-wrap items-center justify-center gap-1.5">
            {accounts.map((item) => {
              const active = item.id === state?.currentAccountId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void selectAccount(item.id)}
                  className={cx(
                    'flex h-7 items-center gap-1.5 rounded-capsule border px-2.5 text-[11.5px] transition-colors',
                    active
                      ? 'border-grass/40 bg-grass/10 text-grass-soft'
                      : 'border-white/[0.09] bg-white/[0.03] text-ink-300 hover:text-ink-100',
                  )}
                >
                  <span className={cx('h-1.5 w-1.5 rounded-full', active ? 'bg-grass' : 'bg-white/25')} />
                  {item.name}
                </button>
              )
            })}

            <button
              type="button"
              onClick={() => setAdding((value) => !value)}
              className="flex h-7 items-center gap-1 rounded-capsule border border-dashed border-white/15 px-2.5 text-[11.5px] text-ink-400 hover:border-grass/40 hover:text-grass-soft"
            >
              <Plus className="h-3 w-3" /> 新账户
            </button>

            {accounts.length > 0 ? (
              <button
                type="button"
                onClick={() => setAccountsOpen(true)}
                className="text-[11px] text-ink-400 hover:text-ink-100"
              >
                管理账户
              </button>
            ) : null}
          </div>

          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="absolute -inset-3 rounded-3xl bg-grass/10 blur-xl" />
              <div className="relative h-[104px] w-[104px] overflow-hidden rounded-2xl border border-white/[0.12] bg-black/30">
                <SkinHead skin={skin} size={104} className="h-full w-full" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[14px] text-ink-100">{account?.name ?? '未选择账户'}</span>
              <Badge tone="neutral">离线</Badge>
            </div>
            <div className="mt-1 text-[10.5px] text-ink-400">
              {account ? '离线账户 · 本地生效' : '在下方新建一个账户'}
            </div>
          </div>

          {adding ? (
            <div className="flex w-full max-w-[380px] items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createOffline()
                  if (event.key === 'Escape') setAdding(false)
                }}
                placeholder="输入 3-16 位玩家名"
                className="h-10 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-center text-[13px] text-ink-100 outline-none placeholder:text-ink-400 focus:border-grass/50"
              />
              <Button variant="primary" size="md" disabled={busy} onClick={() => void createOffline()}>
                创建
              </Button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-ink-400 hover:text-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="flex w-full max-w-[420px] items-stretch gap-2.5">
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-white/[0.1] bg-black/25 px-4 text-left transition-colors hover:border-white/25"
              >
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', activeVersion ? 'bg-grass' : 'bg-ink-400')} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink-100">
                  {activeVersion ? activeVersion.id : '还没有安装版本'}
                </span>
                {activeVersion ? (
                  <span className="shrink-0 text-[10.5px] text-ink-400">{activeVersion.loaderLabel}</span>
                ) : null}
                <ChevronDown className={cx('h-4 w-4 shrink-0 text-ink-400 transition-transform', pickerOpen && 'rotate-180')} />
              </button>

              {pickerOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-[240px] overflow-y-auto rounded-xl border border-white/[0.1] bg-base-800/95 p-1.5 shadow-glass backdrop-blur">
                    {versions.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[12px] text-ink-400">
                        还没有版本，
                        <Link to="/download" className="text-grass-soft hover:text-grass">
                          去下载
                        </Link>
                      </div>
                    ) : (
                      versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => {
                            setSelected(version.id)
                            setPickerOpen(false)
                          }}
                          className={cx(
                            'flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-white/[0.06]',
                            version.id === activeVersion?.id && 'bg-white/[0.04]',
                          )}
                        >
                          <span
                            className={cx(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              version.id === activeVersion?.id ? 'bg-grass' : 'bg-white/20',
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{version.id}</span>
                          <span className="shrink-0 text-[10px] text-ink-400">{version.loaderLabel}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <Button variant="ghost" size="md" className="h-12 shrink-0 rounded-xl" onClick={() => setManageOpen(true)}>
              <Layers className="h-4 w-4" /> 管理版本
            </Button>
          </div>

          <div className="w-full max-w-[420px]">
            {gameRunning ? (
              <Button variant="danger" size="lg" className="h-14 w-full rounded-capsule text-[15px]" onClick={() => void handleKill()}>
                <Square className="h-4 w-4" /> 结束游戏
              </Button>
            ) : (
              <button
                type="button"
                disabled={!activeVersion || launching || !account}
                onClick={() => void handleLaunch()}
                className={cx(
                  'group relative flex h-14 w-full items-center justify-center gap-2.5 rounded-capsule text-[15px] font-medium transition-all duration-200',
                  'bg-grass text-base-900 hover:bg-grass-soft hover:shadow-[0_0_30px_rgba(108,194,74,0.35)]',
                  'disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-ink-400 disabled:shadow-none',
                )}
              >
                {launching ? <ProgressRing /> : <Play className="h-4 w-4" />}
                {launching ? '正在启动' : !account ? '请先选择账户' : !activeVersion ? '请先安装版本' : '启动游戏'}
              </button>
            )}

            {progress ? (
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-ink-400">
                  <span>{progress.phase}</span>
                  <span>
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <ProgressBar current={progress.current} total={progress.total} />
              </div>
            ) : null}

            {error ? (
              <div className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
                {error}
              </div>
            ) : null}

            {logs.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowLogs((value) => !value)}
                  className="flex w-full items-center justify-between text-[10.5px] text-ink-400 hover:text-ink-200"
                >
                  <span>{showLogs ? '收起日志' : '查看日志'}</span>
                  <span className="max-w-[240px] truncate">{latestLog?.message ?? ''}</span>
                </button>
                {showLogs ? (
                  <div className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-black/30 px-2.5 py-2 font-mono text-[10px] leading-relaxed">
                    {logs.map((log, index) => (
                      <div key={`${index}-${log.message}`} className="truncate">
                        <span
                          className={log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-sand' : 'text-ink-400'}
                        >
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <SkinPanel side="right" skin={skin} accountName={account?.name ?? '未选择账户'} />
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.06] px-6 py-3">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-grass-soft">
          <Megaphone className="h-3.5 w-3.5" /> 公告
        </span>
        <div className="marquee-mask relative min-w-0 flex-1 overflow-hidden">
          <div className="marquee flex w-max items-center gap-10 whitespace-nowrap text-[11.5px] text-ink-400">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-10">
                {announcements.map((text) => (
                  <span key={text} className="flex items-center gap-3">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-grass/60" />
                    {text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {accountsOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm" onClick={() => setAccountsOpen(false)}>
          <GlassCard strong className="w-full max-w-[480px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4" onClick={(event) => event.stopPropagation()}>
              <div>
                <div className="text-[14px] text-ink-100">账户管理</div>
                <div className="mt-0.5 text-[11px] text-ink-400">离线账户共 {accounts.length} 个</div>
              </div>
              <button
                type="button"
                onClick={() => setAccountsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
              {accounts.map((item) => {
                const active = item.id === state?.currentAccountId
                return (
                  <div
                    key={item.id}
                    className="flex h-14 items-center gap-3 border-b border-white/[0.05] px-5 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-black/40">
                      <AccountHead account={item} size={32} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{item.name}</span>
                    {active ? (
                      <span className="shrink-0 text-[10.5px] text-grass">当前</span>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 rounded px-2 py-1 text-[11px] text-ink-300 hover:bg-white/10 hover:text-ink-100"
                        onClick={() => void selectAccount(item.id)}
                      >
                        设为当前
                      </button>
                    )}
                    {pendingAccount === item.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-[11px] text-danger hover:bg-danger/10"
                          onClick={() => void removeAccount(item.id)}
                        >
                          确认删除
                        </button>
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-[11px] text-ink-300 hover:bg-white/10"
                          onClick={() => setPendingAccount(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        title="删除账户"
                        className="rounded p-1.5 text-ink-400 hover:bg-danger/10 hover:text-danger"
                        onClick={() => setPendingAccount(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </div>
      ) : null}

      {manageOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm" onClick={() => setManageOpen(false)}>
          <GlassCard strong className="w-full max-w-[620px] overflow-hidden" >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4" onClick={(event) => event.stopPropagation()}>
              <div>
                <div className="text-[14px] text-ink-100">版本管理</div>
                <div className="mt-0.5 text-[11px] text-ink-400">
                  已装 {versions.length} 个版本 · 占用 {formatBytes(totalSize)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="subtle" size="sm" onClick={() => navigate('/download')}>
                  去下载新版本
                </Button>
                <button
                  type="button"
                  onClick={() => setManageOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-ink-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
              {versions.length === 0 ? (
                <div className="px-5 py-12 text-center text-[12.5px] text-ink-400">还没有安装任何版本</div>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex h-14 items-center gap-3 border-b border-white/[0.05] px-5 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', version.isComplete ? 'bg-grass' : 'bg-sand')} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{version.id}</span>
                    <span className="shrink-0 text-[10.5px] text-ink-400">{version.loaderLabel}</span>
                    <span className="w-16 shrink-0 text-right font-mono text-[10.5px] text-ink-400">
                      {formatBytes(version.sizeBytes)}
                    </span>
                    <button
                      type="button"
                      title="打开目录"
                      className="rounded p-1.5 text-ink-400 hover:bg-white/10 hover:text-ink-100"
                      onClick={() => void api.openPath(`${state?.settings.gameDir ?? ''}/versions/${version.id}`)}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                    {pendingDelete === version.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-[11px] text-danger hover:bg-danger/10"
                          onClick={() => void removeVersion(version.id)}
                        >
                          确认删除
                        </button>
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-[11px] text-ink-300 hover:bg-white/10"
                          onClick={() => setPendingDelete(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        title="删除版本"
                        className="rounded p-1.5 text-ink-400 hover:bg-danger/10 hover:text-danger"
                        onClick={() => setPendingDelete(version.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  )
}

function ProgressRing() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-base-900/70 border-t-transparent" />
}
