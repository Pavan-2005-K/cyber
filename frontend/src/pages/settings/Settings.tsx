import { useNavigate, Link } from 'react-router-dom'
import {
  Info,
  LogOut,
  Moon,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'

function formatRole(role: string): string {
  return role.replace(/[_-]+/g, ' ')
}

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          System
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Settings
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Review your application appearance, account, and session information.
        </p>
      </header>

      <div className="grid gap-5">
        <section
          aria-labelledby="appearance-heading"
          className="rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-blue-300">
              <Moon size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="appearance-heading"
                className="text-base font-semibold text-white"
              >
                Appearance
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                CyberFusion currently uses its dark application theme.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <span className="text-sm text-slate-300">Dark Mode</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300">
                  <span
                    className="size-1.5 rounded-full bg-blue-400"
                    aria-hidden="true"
                  />
                  Active
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="account-heading"
          className="rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/10 text-violet-300">
              <UserRound size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="account-heading"
                className="text-base font-semibold text-white"
              >
                Account
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Authenticated investigator account details.
              </p>
              {user ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Username
                    </dt>
                    <dd className="mt-1 break-words text-sm text-slate-200">
                      {user.username}
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Email
                    </dt>
                    <dd className="mt-1 break-all text-sm text-slate-200">
                      {user.email}
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Role
                    </dt>
                    <dd className="mt-1 break-words text-sm capitalize text-slate-200">
                      {formatRole(user.role)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-sm text-slate-400">
                  Account details are unavailable.
                </p>
              )}
              <Link
                to="/dashboard/profile"
                className="mt-4 inline-flex items-center rounded-lg text-sm font-medium text-blue-300 transition hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
              >
                View profile
                <span className="sr-only"> for account details</span>
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="security-heading"
          className="rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-500/10 text-emerald-300">
              <ShieldCheck size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="security-heading"
                className="text-base font-semibold text-white"
              >
                Security
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Authenticated API requests use your existing JWT session. The
                session credential is handled automatically and is never
                displayed here.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="session-heading"
          className="rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/15 bg-amber-500/10 text-amber-300">
                <LogOut size={19} aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="session-heading"
                  className="text-base font-semibold text-white"
                >
                  Session
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Sign out of this CyberFusion session on this device.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:border-red-400/35 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </section>

        <section
          aria-labelledby="application-heading"
          className="rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-400/15 bg-white/[0.04] text-slate-300">
              <Info size={19} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="application-heading"
                className="text-base font-semibold text-white"
              >
                Application
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                CyberFusion
              </p>
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
