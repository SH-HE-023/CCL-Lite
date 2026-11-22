import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function GlassCard({
  children,
  className,
  strong,
}: {
  children: ReactNode
  className?: string
  strong?: boolean
}) {
  return (
    <div
      className={cx(
        strong ? 'glass-strong' : 'glass',
        'rounded-2xl shadow-glass',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight text-ink-100">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

type ButtonVariant = 'primary' | 'sand' | 'ghost' | 'subtle' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-grass text-base-900 hover:bg-grass-soft',
  sand: 'bg-sand text-base-900 hover:brightness-105',
  ghost: 'glass text-ink-100 hover:border-white/25',
  subtle: 'bg-white/[0.05] text-ink-200 hover:bg-white/[0.1]',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[13px] gap-2 rounded-xl',
  lg: 'h-[52px] px-6 text-[15px] gap-2.5 rounded-xl',
}

export function Button({
  variant = 'ghost',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass/60',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  )
}

export function CapsuleTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { key: T; label: string; hint?: string }[]
  value: T
  onChange: (next: T) => void
  className?: string
}) {
  return (
    <div className={cx('inline-flex items-center gap-1 rounded-capsule border border-white/[0.08] bg-white/[0.03] p-1', className)}>
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cx(
              'relative rounded-capsule px-3.5 py-1.5 text-[12.5px] transition-colors',
              active ? 'bg-white/[0.1] text-ink-100' : 'text-ink-300 hover:text-ink-100',
            )}
          >
            {item.label}
            {item.hint ? <span className="ml-1.5 font-pixel text-[9px] text-ink-400">{item.hint}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'grass' | 'sand' | 'danger'
  className?: string
}) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/[0.05] text-ink-300',
    grass: 'border-grass/30 bg-grass/10 text-grass-soft',
    sand: 'border-sand/30 bg-sand/10 text-sand',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  }[tone]
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-capsule border px-2 py-0.5 text-[10px] tracking-wide',
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-capsule bg-white/[0.07]">
      <div
        className="h-full rounded-capsule bg-gradient-to-r from-grass-deep via-grass to-grass-soft transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
      <div className="scan-line absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
        <span className="h-3 w-3 bg-grass/70" />
      </span>
      <div className="text-[14px] text-ink-100">{title}</div>
      {description ? <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <GlassCard className="px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</div>
      <div className="mt-2 text-[19px] font-semibold leading-none text-ink-100">{value}</div>
      {detail ? <div className="mt-1.5 text-[11.5px] text-ink-400">{detail}</div> : null}
    </GlassCard>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] text-ink-200">{label}</span>
        {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-[13px] text-ink-100 outline-none transition-colors',
        'placeholder:text-ink-400 focus:border-grass/50',
        className,
      )}
      {...rest}
    />
  )
}
