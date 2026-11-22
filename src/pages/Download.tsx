import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Loader2, RefreshCw, Search, X } from 'lucide-react'
import type { LoaderRelease, LoaderType, ModrinthProject, ModrinthProjectType, RemoteVersion } from '@shared/types'
import { useApp } from '../lib/app-context'
import { api, cleanError, formatCount, formatDate, versionTypeLabels } from '../lib/utils'
import { useTaskRunner } from '../lib/use-task'
import { Badge, Button, cx, GlassCard, TextInput } from '../components/ui'
import { TaskBar } from '../components/TaskBar'

type CatKey =
  | 'latest'
  | 'release'
  | 'snapshot'
  | 'legacy'
  | 'loader'
  | 'mod'
  | 'modpack'
  | 'resourcepack'
  | 'datapack'
  | 'shader'

const CONTENT_CATS: CatKey[] = ['mod', 'modpack', 'resourcepack', 'datapack', 'shader']

const NAV: { title: string; items: { key: CatKey; label: string }[] }[] = [
  {
    title: '游戏版本',
    items: [
      { key: 'latest', label: '最新版本' },
      { key: 'release', label: '正式版' },
      { key: 'snapshot', label: '测试版' },
      { key: 'legacy', label: '远古版本' },
      { key: 'loader', label: '模组加载器' },
    ],
  },
  {
    title: '内容下载',
    items: [
      { key: 'mod', label: 'MOD 下载' },
      { key: 'modpack', label: '整合包' },
      { key: 'resourcepack', label: '资源包' },
      { key: 'datapack', label: '数据包' },
      { key: 'shader', label: '光影包' },
    ],
  },
]

const CAT_LABEL: Record<CatKey, string> = {
  latest: '最新版本',
  release: '正式版',
  snapshot: '测试版',
  legacy: '远古版本',
  loader: '模组加载器',
  mod: 'MOD',
  modpack: '整合包',
  resourcepack: '资源包',
  datapack: '数据包',
  shader: '光影包',
}

const MODRINTH_TYPES: Record<string, ModrinthProjectType> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  datapack: 'datapack',
  shader: 'shader',
}

const LOADER_OPTIONS: { key: LoaderType; label: string }[] = [
  { key: 'fabric', label: 'Fabric' },
  { key: 'quilt', label: 'Quilt' },
  { key: 'forge', label: 'Forge' },
  { key: 'neoforge', label: 'NeoForge' },
]

const MOD_CATEGORIES = [
  { key: 'adventure', label: '冒险' },
  { key: 'technology', label: '科技' },
  { key: 'magic', label: '魔法' },
  { key: 'decoration', label: '装饰' },
  { key: 'optimization', label: '优化' },
  { key: 'utility', label: '工具' },
  { key: 'equipment', label: '装备' },
  { key: 'worldgen', label: '世界生成' },
  { key: 'mobs', label: '生物' },
  { key: 'storage', label: '存储' },
  { key: 'library', label: '前置库' },
]

const selectClass =
  'h-9 rounded-lg border border-white/[0.1] bg-black/30 px-2.5 text-[12px] text-ink-100 outline-none focus:border-grass/50'

export default function DownloadPage() {
  const { state, refresh } = useApp()
  const { task, run, clear } = useTaskRunner()
  const [cat, setCat] = useState<CatKey>('release')
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<RemoteVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [gameVersion, setGameVersion] = useState('')
  const [loader, setLoader] = useState('')
  const [category, setCategory] = useState('')

  const [results, setResults] = useState<ModrinthProject[]>([])
  const [contentLoading, setContentLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)

  const [target, setTarget] = useState<RemoteVersion | null>(null)
  const [withLoader, setWithLoader] = useState<LoaderType | 'none'>('none')
  const [loaderReleases, setLoaderReleases] = useState<LoaderRelease[]>([])
  const [loaderVersion, setLoaderVersion] = useState<string>('')
  const [loaderLoading, setLoaderLoading] = useState(false)
  const [standaloneLoader, setStandaloneLoader] = useState<LoaderType>('fabric')
  const [packTarget, setPackTarget] = useState<ModrinthProject | null>(null)
  const [packUnpack, setPackUnpack] = useState(false)

  const releases = useMemo(
    () =>
      remote
        .filter((version) => version.type === 'release')
        .sort((a, b) => b.releaseTime.localeCompare(a.releaseTime)),
    [remote],
  )
  const installedIds = useMemo(
    () => new Set((state?.versions ?? []).map((version) => version.id)),
    [state?.versions],
  )

  const loadRemote = async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.getRemoteVersions(force)
      setRemote([...list].sort((a, b) => b.releaseTime.localeCompare(a.releaseTime)))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRemote()
  }, [])

  const contentType = MODRINTH_TYPES[cat]
  const isContent = CONTENT_CATS.includes(cat)

  useEffect(() => {
    if (!isContent || !contentType) return
    let canceled = false
    setContentLoading(true)
    const timer = setTimeout(() => {
      api
        .searchModrinth({
          projectType: contentType,
          query: query.trim(),
          gameVersion: gameVersion || undefined,
          loader: loader || undefined,
          category: category || undefined,
        })
        .then((list) => {
          if (!canceled) setResults(list)
        })
        .catch((err) => {
          if (!canceled) {
            setResults([])
            setNote(cleanError(err))
          }
        })
    }, 300)
    return () => {
      canceled = true
      clearTimeout(timer)
    }
  }, [cat, contentType, isContent, query, gameVersion, loader, category])

  const vanillaList = useMemo(() => {
    if (cat === 'latest') return remote.slice(0, 15)
    if (cat === 'release') return releases
    if (cat === 'snapshot') return remote.filter((version) => version.type === 'snapshot')
    if (cat === 'legacy') return remote.filter((version) => version.type === 'old_beta' || version.type === 'old_alpha')
    return []
  }, [cat, remote, releases])

  const filteredVanilla = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return vanillaList
    return vanillaList.filter((version) => version.id.toLowerCase().includes(text))
  }, [vanillaList, query])

  const openInstall = (version: RemoteVersion) => {
    setTarget(version)
    setWithLoader('none')
    setLoaderReleases([])
    setLoaderVersion('')
  }

  const pickLoader = async (next: LoaderType | 'none') => {
    setWithLoader(next)
    setLoaderReleases([])
    setLoaderVersion('')
    if (next === 'none' || !target) return
    setLoaderLoading(true)
    try {
      const list = await api.listLoaders(next, target.id)
      setLoaderReleases(list)
      setLoaderVersion(list[0]?.version ?? '')
    } catch (err) {
      setLoaderReleases([])
      setNote(cleanError(err))
    } finally {
      setLoaderLoading(false)
    }
  }

  const confirmInstall = async () => {
    if (!target) return
    const version = target
    const loaderKey = withLoader
    const selectedLoaderVersion = loaderVersion
    setTarget(null)
    await run(
      `安装 ${version.id}${loaderKey !== 'none' ? ` + ${loaderKey}` : ''}`,
      async (taskId) => {
        await api.installVersion(version.id, taskId)
        if (loaderKey !== 'none' && selectedLoaderVersion) {
          await api.installLoader(loaderKey, version.id, selectedLoaderVersion, taskId)
        }
      },
    )
    await refresh()
  }

  const installStandaloneLoader = async (item: LoaderRelease) => {
    if (gameVersion) {
      await run(`安装 ${standaloneLoader} ${item.version}`, (taskId) =>
        api.installLoader(standaloneLoader, gameVersion, item.version, taskId),
      )
      await refresh()
    }
  }

  useEffect(() => {
    if (cat !== 'loader' || !gameVersion) return
    let canceled = false
    setLoaderLoading(true)
    api
      .listLoaders(standaloneLoader, gameVersion)
      .then((list) => {
        if (!canceled) setLoaderReleases(list)
      })
      .catch((err) => {
        if (!canceled) setNote(cleanError(err))
      })
      .finally(() => {
        if (!canceled) setLoaderLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [cat, standaloneLoader, gameVersion])

  const installContent = async (project: ModrinthProject) => {
    if (!contentType) return
    if (contentType === 'modpack') {
      setPackTarget(project)
      setPackUnpack(false)
      return
    }
    setInstallingId(project.id)
    setNote(null)
    try {
      const versions = await api.listModrinthVersions(project.id, gameVersion || undefined, loader || undefined)
      if (versions.length === 0) {
        setNote(`${project.title} 没有符合条件的文件`)
        return
      }
      await run(`安装 ${project.title}`, (taskId) => api.installModrinthVersion(contentType, versions[0], taskId))
      setNote(`${project.title} 已安装`)
    } catch (err) {
      setNote(cleanError(err))
    } finally {
      setInstallingId(null)
    }
  }

  const confirmPack = async () => {
    const project = packTarget
    if (!project) return
    const unpack = packUnpack
    setPackTarget(null)
    setInstallingId(project.id)
    setNote(null)
    try {
      const versions = await api.listModrinthVersions(project.id, gameVersion || undefined, loader || undefined)
      if (versions.length === 0) {
        setNote(`${project.title} 没有符合条件的文件`)
        return
      }
      await run(`安装整合包 ${project.title}`, (taskId) =>
        api.installModrinthVersion('modpack', versions[0], taskId, unpack),
      )
      setNote(
        unpack
          ? `${project.title} 已解包安装：原版、加载器与模组都已就绪`
          : `${project.title} 的整合包文件已下载到 modpacks 目录`,
      )
      await refresh()
    } catch (err) {
      setNote(cleanError(err))
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-76px)] items-stretch">
      <aside className="w-[188px] shrink-0 border-r border-white/[0.06] px-3 py-4">
        {NAV.map((group) => (
          <div key={group.title} className="mb-5">
            <div className="px-2 text-[10px] uppercase tracking-[0.16em] text-ink-400">{group.title}</div>
            <div className="mt-2 space-y-0.5">
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setCat(item.key)
                    setNote(null)
                  }}
                  className={cx(
                    'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] transition-colors',
                    cat === item.key ? 'bg-grass/10 text-grass-soft' : 'text-ink-300 hover:bg-white/[0.04]',
                  )}
                >
                  <span className={cx('h-1 w-1 rounded-full', cat === item.key ? 'bg-grass' : 'bg-white/20')} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <section className="min-w-0 flex-1 px-5 pb-10 pt-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索${CAT_LABEL[cat]}`}
              className="h-10 pl-9 pr-8"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button variant="subtle" size="md" loading={loading} onClick={() => void loadRemote(true)}>
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </Button>
          <Button variant="subtle" size="md" onClick={() => void api.openPath(state?.settings.gameDir ?? 'gameDir')}>
            <FolderOpen className="h-3.5 w-3.5" /> 目录
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={gameVersion}
            onChange={(event) => setGameVersion(event.target.value)}
            className={selectClass}
          >
            <option value="">全部游戏版本</option>
            {releases.map((version) => (
              <option key={version.id} value={version.id}>
                {version.id}
              </option>
            ))}
          </select>

          {cat === 'mod' || cat === 'modpack' ? (
            <select value={loader} onChange={(event) => setLoader(event.target.value)} className={selectClass}>
              <option value="">全部加载器</option>
              {LOADER_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}

          {cat === 'mod' ? (
            <select value={category} onChange={(event) => setCategory(event.target.value)} className={selectClass}>
              <option value="">全部分类</option>
              {MOD_CATEGORIES.filter((item, index, list) => list.findIndex((x) => x.key === item.key) === index).map(
                (item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ),
              )}
            </select>
          ) : null}

          {cat === 'loader' ? (
            <div className="flex items-center gap-1">
              {LOADER_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStandaloneLoader(item.key)}
                  className={cx(
                    'h-9 rounded-lg border px-3 text-[12px] transition-colors',
                    standaloneLoader === item.key
                      ? 'border-grass/40 bg-grass/10 text-grass-soft'
                      : 'border-white/10 text-ink-300 hover:text-ink-100',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-danger/25 bg-danger/10 px-4 py-2.5 text-[12px] text-danger">
            {error}
          </div>
        ) : null}

        {note ? (
          <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11.5px] text-ink-300">
            {note}
          </div>
        ) : null}

        {isContent ? (
          <ContentList
            cat={cat}
            results={results}
            loading={contentLoading}
            installingId={installingId}
            onInstall={(project) => void installContent(project)}
          />
        ) : cat === 'loader' ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
            <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-4 text-[11px] uppercase tracking-[0.16em] text-ink-400">
              <span className="flex items-center gap-2">
                可用构建 {loaderLoading ? <Loader2 className="h-3 w-3 animate-spin text-grass" /> : null}
              </span>
              <span>{gameVersion ? `${gameVersion} · ${standaloneLoader}` : '先选择游戏版本'}</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {!gameVersion ? (
                <div className="px-4 py-14 text-center text-[12.5px] text-ink-400">在上方选择游戏版本后加载对应构建</div>
              ) : loaderReleases.length === 0 ? (
                <div className="px-4 py-14 text-center text-[12.5px] text-ink-400">没有可用的构建</div>
              ) : (
                loaderReleases.map((item) => (
                  <div
                    key={item.version}
                    className="flex h-12 items-center gap-3 border-b border-white/[0.05] px-4 last:border-b-0 hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{item.version}</span>
                    {item.stable ? <Badge tone="grass">推荐</Badge> : null}
                    <button
                      type="button"
                      onClick={() => void installStandaloneLoader(item)}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] text-grass-soft hover:bg-grass/10"
                    >
                      安装
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
            <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-4 text-[11px] uppercase tracking-[0.16em] text-ink-400">
              <span>{CAT_LABEL[cat]}</span>
              <span className="flex items-center gap-2">
                {loading ? <Loader2 className="h-3 w-3 animate-spin text-grass" /> : null}
                {filteredVanilla.length}
              </span>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {filteredVanilla.length === 0 ? (
                <div className="px-4 py-14 text-center text-[12.5px] text-ink-400">没有匹配的版本</div>
              ) : (
                filteredVanilla.map((version) => (
                  <div
                    key={version.id}
                    className="flex h-14 items-center gap-3 border-b border-white/[0.05] px-4 last:border-b-0 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="w-[120px] shrink-0 truncate text-[13px] text-ink-100">{version.id}</span>
                    <Badge tone={version.type === 'release' ? 'grass' : 'neutral'} className="shrink-0">
                      {versionTypeLabels[version.type] ?? version.type}
                    </Badge>
                    <span className="hidden flex-1 text-[11px] text-ink-400 sm:block">{formatDate(version.releaseTime)}</span>
                    {installedIds.has(version.id) ? (
                      <span className="shrink-0 text-[11px] text-grass-soft">已安装</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openInstall(version)}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] text-grass-soft transition-colors hover:bg-grass/10"
                      >
                        下载
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <TaskBar task={task} onDismiss={clear} />
      </section>

      {packTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
          <GlassCard strong className="w-full max-w-[520px] p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[15px] text-ink-100">安装整合包 {packTarget.title}</div>
                <div className="mt-1 text-[11.5px] text-ink-400">选择安装方式，默认只下载文件</div>
              </div>
              <button
                type="button"
                onClick={() => setPackTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-2">
              {[
                {
                  unpack: false,
                  title: '仅下载文件',
                  desc: '把 .mrpack 放进 modpacks 目录，后续自行处理，速度快。',
                },
                {
                  unpack: true,
                  title: '解包安装（启用完整安装）',
                  desc: '自动安装对应原版与加载器，下载全部模组并铺好配置，耗时取决于整合包体积。',
                },
              ].map((option) => (
                <button
                  key={option.title}
                  type="button"
                  onClick={() => setPackUnpack(option.unpack)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    packUnpack === option.unpack
                      ? 'border-grass/40 bg-grass/[0.08]'
                      : 'border-white/[0.09] hover:border-white/20',
                  )}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      packUnpack === option.unpack ? 'border-grass bg-grass/20' : 'border-white/20',
                    )}
                  >
                    {packUnpack === option.unpack ? <span className="h-1.5 w-1.5 rounded-full bg-grass" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-ink-100">{option.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">{option.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="subtle" size="md" onClick={() => setPackTarget(null)}>
                取消
              </Button>
              <Button variant="primary" size="md" onClick={() => void confirmPack()}>
                {packUnpack ? '开始解包安装' : '开始下载'}
              </Button>
            </div>
          </GlassCard>
        </div>
      ) : null}

      {target ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
          <GlassCard strong className="w-full max-w-[520px] p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[15px] text-ink-100">下载版本 {target.id}</div>
                <div className="mt-1 text-[11.5px] text-ink-400">第 1 步：确认版本 · 第 2 步：加载器（可选）</div>
              </div>
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 text-[12px] text-ink-200">是否同时安装模组加载器？</div>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {[{ key: 'none' as const, label: '不安装' }, ...LOADER_OPTIONS].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => void pickLoader(item.key)}
                  className={cx(
                    'h-9 rounded-lg border text-[12px] transition-colors',
                    withLoader === item.key
                      ? 'border-grass/45 bg-grass/10 text-grass-soft'
                      : 'border-white/10 text-ink-300 hover:text-ink-100',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {withLoader !== 'none' ? (
              <div className="mt-3">
                <select
                  value={loaderVersion}
                  onChange={(event) => setLoaderVersion(event.target.value)}
                  className={cx(selectClass, 'w-full')}
                >
                  {loaderLoading ? <option value="">加载构建列表…</option> : null}
                  {loaderReleases.map((item) => (
                    <option key={item.version} value={item.version}>
                      {item.version}
                      {item.stable ? ' · 推荐' : ''}
                    </option>
                  ))}
                  {!loaderLoading && loaderReleases.length === 0 ? (
                    <option value="">该版本没有可用构建</option>
                  ) : null}
                </select>
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="subtle" size="md" onClick={() => setTarget(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={loading || (withLoader !== 'none' && !loaderVersion)}
                onClick={() => void confirmInstall()}
              >
                继续下载
              </Button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  )
}

function ContentList({
  cat,
  results,
  loading,
  installingId,
  onInstall,
}: {
  cat: CatKey
  results: ModrinthProject[]
  loading: boolean
  installingId: string | null
  onInstall: (project: ModrinthProject) => void
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-4 text-[11px] uppercase tracking-[0.16em] text-ink-400">
        <span className="flex items-center gap-2">
          {CAT_LABEL[cat]} 结果
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-grass" /> : null}
        </span>
        <span>{results.length}</span>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        {!loading && results.length === 0 ? (
          <div className="px-4 py-14 text-center text-[12.5px] text-ink-400">没有结果，换个关键词或筛选条件</div>
        ) : (
          results.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0 hover:bg-white/[0.03]"
            >
              {project.iconUrl ? (
                <img src={project.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded-md bg-white/[0.08]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12.5px] text-ink-100">{project.title}</span>
                  <span className="shrink-0 text-[10px] text-ink-400">{formatCount(project.downloads)}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-400">{project.description}</p>
              </div>
              <button
                type="button"
                disabled={installingId === project.id}
                onClick={() => onInstall(project)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] text-grass-soft transition-colors hover:bg-grass/10 disabled:opacity-50"
              >
                {installingId === project.id ? '安装中' : '安装'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
