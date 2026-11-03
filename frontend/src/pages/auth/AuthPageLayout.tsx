import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChangeEventHandler, ReactNode } from 'react'

type AuthPageLayoutProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}

type AuthTextFieldProps = {
  id: string
  label: string
  type?: string
  placeholder: string
  autoComplete: string
  icon: ReactNode
  value?: string
  onChange?: ChangeEventHandler<HTMLInputElement>
}

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  autoComplete: string
  visible: boolean
  onChange: ChangeEventHandler<HTMLInputElement>
  onToggleVisibility: () => void
  minLength?: number
  helperText?: string
}

const inputClassName =
  'w-full rounded-xl border border-white/10 bg-[#242629] py-3.5 pl-11 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'

export function AuthTextField({
  id,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  icon,
  value,
  onChange,
}: AuthTextFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
          {icon}
        </span>
        <input
          id={id}
          name={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          required
          className={inputClassName}
        />
      </div>
    </div>
  )
}

export function PasswordField({
  id,
  label,
  value,
  autoComplete,
  visible,
  onChange,
  onToggleVisibility,
  minLength,
  helperText,
}: PasswordFieldProps) {
  const helperId = helperText ? `${id}-help` : undefined

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
          <LockKeyhole size={17} aria-hidden="true" />
        </span>
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-describedby={helperId}
          required
          className={`${inputClassName} pr-12`}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          {visible ? (
            <EyeOff size={17} aria-hidden="true" />
          ) : (
            <Eye size={17} aria-hidden="true" />
          )}
        </button>
      </div>
      {helperText && (
        <p id={helperId} className="text-xs text-slate-500">
          {helperText}
        </p>
      )}
    </div>
  )
}

export default function AuthPageLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthPageLayoutProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1F2022] text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 18% 20%, rgba(59, 130, 246, 0.13), transparent 38%), radial-gradient(ellipse at 86% 78%, rgba(37, 99, 235, 0.08), transparent 34%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link to="/login" className="group inline-flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-400 transition group-hover:bg-blue-500/15">
              <ShieldCheck size={22} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide text-white">
                CyberFusion
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Digital forensics
              </span>
            </span>
          </Link>
          <span className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
            <span className="size-1.5 rounded-full bg-blue-400" />
            SECURE ACCESS PORTAL
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)] lg:gap-20">
          <aside className="hidden max-w-xl lg:block">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">
              <Fingerprint size={14} aria-hidden="true" />
              Investigation workspace
            </div>
            <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
              Digital evidence,
              <span className="block text-blue-400">in sharper focus.</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-400">
              A secure workspace for the people who investigate, analyze, and
              make sense of digital evidence.
            </p>

            <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                  <ScanSearch size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Built for focused investigations
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Keep your digital forensics work organized in one
                    considered workspace.
                  </p>
                </div>
                <ArrowUpRight
                  size={16}
                  className="ml-auto shrink-0 text-slate-600"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-5 flex gap-1.5" aria-hidden="true">
                <span className="h-1 w-12 rounded-full bg-blue-500/70" />
                <span className="h-1 w-7 rounded-full bg-blue-500/35" />
                <span className="h-1 w-4 rounded-full bg-white/10" />
              </div>
            </div>
          </aside>

          <section className="w-full rounded-3xl border border-white/[0.08] bg-[#303236] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-9">
            <div className="mb-7">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                {eyebrow}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {description}
              </p>
            </div>

            {children}

            <div className="mt-7 border-t border-white/[0.08] pt-5 text-center text-sm text-slate-400">
              {footer}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-center gap-2 pb-1 text-[11px] text-slate-600">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>CyberFusion · Secure digital forensics</span>
        </footer>
      </div>
    </main>
  )
}
