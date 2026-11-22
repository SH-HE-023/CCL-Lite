import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Download, Minus, Rocket, Settings as SettingsIcon, X } from 'lucide-react'
import type { AppState } from '@shared/types'
import { api } from './lib/utils'
import { AppContext } from './lib/app-context'
import DownloadPage from './pages/Download'
import Home from './pages/Home'
import SettingsPage from './pages/Settings'
import iconUrl from './assets/icon.png'
import { cx } from './components/ui'
import { applyTheme } from './lib/theme'

const NAV = [
  { to: '/', label: '启动', icon: Rocket },
  { to: '/download', label: '下载', icon: Download },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

function TopBar({ state }: { state: AppState | null }) {
  const account = state?.accounts.find((item) => item.id === state.currentAccountId)
  return (
    <header
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('a,button')) return
        void api.windowToggleMaximize()
      }}
      className="drag relative z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-base-900 pl-4"
    >
      <div className="flex shrink-0 items-center gap-2.5">
        <img src={iconUrl} alt="" className="h-5 w-5 rounded-[4px]" />
        <span className="text-[12px] font-semibold tracking-[0.16em] text-ink-100">CCL</span>
      </div>

      <nav className="no-drag absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-capsule border border-white/[0.07] bg-white/[0.025] p-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cx(
                'flex items-center gap-1.5 rounded-capsule px-3.5 py-1.5 text-[12.5px] transition-colors',
                isActive ? 'bg-grass text-base-900' : 'text-ink-300 hover:text-ink-100',
              )
            }
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="no-drag ml-auto flex items-center gap-3 pr-3">
        <span className="flex h-6 items-center gap-1.5 rounded-capsule border border-white/[0.09] px-2.5">
          <span className={cx('h-1.5 w-1.5 rounded-full', account ? 'bg-grass' : 'bg-ink-400')} />
          <span className="text-[11px] text-ink-200">{account ? account.name : '未登录'}</span>
        </span>
      </div>

      <div className="no-drag ml-1 flex h-full shrink-0 items-stretch">
        <button
          type="button"
          title="最小化"
          onClick={() => void api.windowMinimize()}
          className="flex w-11 items-center justify-center text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="关闭"
          onClick={() => void api.windowClose()}
          className="flex w-11 items-center justify-center text-ink-400 transition-colors hover:bg-[#d9534f] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await api.getState()
    setState(next)
    return next
  }, [])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!state) return
    applyTheme(state.settings.accentPrimary, state.settings.accentSecondary)
  }, [state?.settings.accentPrimary, state?.settings.accentSecondary])

  return (
    <AppContext.Provider value={{ state, loading, refresh, setState }}>
      <div className="relative flex h-full flex-col overflow-hidden bg-base-900">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
        <div className="pointer-events-none absolute -left-32 -top-40 h-[360px] w-[360px] rounded-full bg-grass/[0.06] blur-[120px]" />

        <TopBar state={state} />

        <main className="relative flex-1 overflow-y-auto pt-3">
          {loading && !state ? (
            <div className="flex h-full items-center justify-center text-[13px] text-ink-400">正在读取本地配置…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </AppContext.Provider>
  )
}
