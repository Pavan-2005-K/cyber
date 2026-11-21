
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
  'w-full rounded-xl border border-white/[0.08] bg-[#111114] py-3.5 pl-11 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/[0.15] focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/[0.08]'

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
          className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-purple-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500"
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
    <main className="relative min-h-screen overflow-hidden bg-[#0b0b0d] text-slate-100">
      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 18% 20%, rgba(139, 92, 246, 0.12), transparent 38%), radial-gradient(ellipse at 86% 78%, rgba(124, 58, 237, 0.08), transparent 34%)',
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        {/* Header / Brand */}
        <header className="flex items-center justify-between">
          <Link to="/login" className="group inline-flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/[0.08] text-purple-400 transition group-hover:border-purple-400/35 group-hover:bg-purple-500/[0.14]">
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
            <span className="size-1.5 rounded-full bg-purple-400" />
            SECURE ACCESS PORTAL
          </span>
        </header>

        {/* Main content */}
        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)] lg:gap-20">
          {/* Left branding panel */}
          <aside className="hidden max-w-xl lg:block">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-400/15 bg-purple-500/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-purple-300">
              <Fingerprint size={14} aria-hidden="true" />
              Investigation workspace
            </div>

            <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
              Digital evidence,
              <span className="block text-purple-400">
                in sharper focus.
              </span>
            </h2>

            <p className="mt-5 max-w-md text-base leading-7 text-slate-400">
              A secure workspace for the people who investigate, analyze, and
              make sense of digital evidence.
            </p>

            {/* Investigation feature card */}
            <div className="mt-10 rounded-2xl border border-white/[0.07] bg-[#151518] p-5">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-purple-400/10 bg-purple-500/[0.08] text-purple-400">
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
                <span className="h-1 w-12 rounded-full bg-purple-500/70" />
                <span className="h-1 w-7 rounded-full bg-purple-500/30" />
                <span className="h-1 w-4 rounded-full bg-white/[0.07]" />
              </div>
            </div>
          </aside>

          {/* Authentication Card */}
          <section className="w-full rounded-3xl border border-white/[0.07] bg-[#151518] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-9">
            <div className="mb-7">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-purple-400">
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

            {/* Form footer */}
            <div className="mt-7 border-t border-white/[0.07] pt-5 text-center text-sm text-slate-400">
              {footer}
            </div>
          </section>
        </div>

        {/* Bottom footer */}
        <footer className="flex items-center justify-center gap-2 pb-1 text-[11px] text-slate-600">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>CyberFusion · Secure digital forensics</span>
        </footer>
      </div>
    </main>
  )
}
