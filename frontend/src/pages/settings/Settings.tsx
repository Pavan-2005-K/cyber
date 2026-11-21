
import { useNavigate, Link } from 'react-router-dom'
import {
  Info,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { useTheme } from '../../context/useTheme'

function formatRole(role: string): string {
  return role.replace(/[_-]+/g, ' ')
}

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const isDark = theme === 'dark'

  function handleSignOut() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6 theme-text">
      {/* Page Header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-500 dark:text-purple-400">
          System
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Settings
        </h1>

        <p className="mt-2 text-sm leading-6 theme-text-secondary">
          Review your application appearance, account, and session information.
        </p>
      </header>

      <div className="grid gap-5">
        {/* Appearance */}
        <section
          aria-labelledby="appearance-heading"
          className="theme-card rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-500 dark:text-purple-400">
              {isDark ? (
                <Moon size={19} aria-hidden="true" />
              ) : (
                <Sun size={19} aria-hidden="true" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="appearance-heading"
                className="text-base font-semibold theme-text"
              >
                Appearance
              </h2>

              <p className="mt-1 text-sm leading-6 theme-text-secondary">
                Customize CyberFusion's appearance to suit your preference.
              </p>

              {/* Theme Toggle */}
              <div className="theme-card-secondary mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-4">
                <div>
                  <p className="text-sm font-medium theme-text">
                    {isDark ? 'Dark Mode' : 'Light Mode'}
                  </p>

                  <p className="mt-1 text-xs theme-text-muted">
                    {isDark
                      ? 'Dark interface with purple accents'
                      : 'Light interface with clean, bright colors'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={toggleTheme}
                  role="switch"
                  aria-checked={!isDark}
                  aria-label="Toggle light and dark mode"
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] ${
                    isDark ? 'bg-[#3B3548]' : 'bg-purple-600'
                  }`}
                >
                  <span
                    className={`inline-flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isDark ? 'translate-x-1' : 'translate-x-6'
                    }`}
                  >
                    {isDark ? (
                      <Moon size={12} className="text-[#5C526F]" />
                    ) : (
                      <Sun size={12} className="text-amber-500" />
                    )}
                  </span>
                </button>
              </div>

              {/* Theme Status */}
              <div className="theme-card-secondary mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
                <span className="text-sm theme-text-secondary">
                  Current theme
                </span>

                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    isDark
                      ? 'border-purple-400/20 bg-purple-500/10 text-purple-500 dark:text-purple-400'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-600'
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isDark ? 'bg-purple-400' : 'bg-amber-400'
                    }`}
                    aria-hidden="true"
                  />
                  {isDark ? 'Dark Mode Active' : 'Light Mode Active'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Account */}
        <section
          aria-labelledby="account-heading"
          className="theme-card rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-500 dark:text-purple-400">
              <UserRound size={19} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="account-heading"
                className="text-base font-semibold theme-text"
              >
                Account
              </h2>

              <p className="mt-1 text-sm leading-6 theme-text-secondary">
                Authenticated investigator account details.
              </p>

              {user ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="theme-card-secondary min-w-0 rounded-xl p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                      Username
                    </dt>

                    <dd className="mt-1 break-words text-sm theme-text">
                      {user.username}
                    </dd>
                  </div>

                  <div className="theme-card-secondary min-w-0 rounded-xl p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                      Email
                    </dt>

                    <dd className="mt-1 break-all text-sm theme-text">
                      {user.email}
                    </dd>
                  </div>

                  <div className="theme-card-secondary min-w-0 rounded-xl p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                      Role
                    </dt>

                    <dd className="mt-1 break-words text-sm capitalize theme-text">
                      {formatRole(user.role)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="theme-card-secondary mt-4 rounded-xl p-3.5 text-sm theme-text-secondary">
                  Account details are unavailable.
                </p>
              )}

              <Link
                to="/dashboard/profile"
                className="mt-4 inline-flex items-center rounded-lg text-sm font-medium text-purple-500 transition hover:text-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              >
                View profile
                <span className="sr-only"> for account details</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Security */}
        <section
          aria-labelledby="security-heading"
          className="theme-card rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-500">
              <ShieldCheck size={19} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="security-heading"
                className="text-base font-semibold theme-text"
              >
                Security
              </h2>

              <p className="mt-1 text-sm leading-6 theme-text-secondary">
                Authenticated API requests use your existing JWT session. The
                session credential is handled automatically and is never
                displayed here.
              </p>
            </div>
          </div>
        </section>

        {/* Session */}
        <section
          aria-labelledby="session-heading"
          className="theme-card rounded-2xl p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-500/10 text-amber-500">
                <LogOut size={19} aria-hidden="true" />
              </span>

              <div>
                <h2
                  id="session-heading"
                  className="text-base font-semibold theme-text"
                >
                  Session
                </h2>

                <p className="mt-1 text-sm leading-6 theme-text-secondary">
                  Sign out of this CyberFusion session on this device.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500 transition hover:border-red-400/35 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </section>

        {/* Application Info */}
        <section
          aria-labelledby="application-heading"
          className="theme-card rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-500 dark:text-purple-400">
              <Info size={19} aria-hidden="true" />
            </span>

            <div>
              <h2
                id="application-heading"
                className="text-base font-semibold theme-text"
              >
                Application
              </h2>

              <p className="mt-1 text-sm leading-6 theme-text-secondary">
                CyberFusion
              </p>

              <p className="mt-1 text-xs theme-text-muted">
                Digital Forensics &amp; Security Platform
              </p>
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
