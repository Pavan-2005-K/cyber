import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  CalendarDays,
  LoaderCircle,
  Mail,
  RefreshCw,
  Shield,
  UserRound,
} from 'lucide-react'
import {
  getCurrentUser,
  type CurrentUserResponse,
} from '../../services/authService'

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    if (error.response.status === 401) {
      return 'Your session may have expired. Please sign in again.'
    }

    const data: unknown = error.response.data
    if (
      typeof data === 'object' &&
      data !== null &&
      'detail' in data &&
      typeof data.detail === 'string'
    ) {
      return data.detail
    }
  }

  if (
    error instanceof Error &&
    error.message ===
      'Unable to connect. Please check your connection and try again.'
  ) {
    return 'Unable to connect to CyberFusion. Check your connection and try again.'
  }

  return 'Your profile could not be loaded. Please try again.'
}

function getInitials(username: string): string {
  const parts = username.trim().split(/[\s._-]+/).filter(Boolean)

  if (parts.length > 1) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return (parts[0] ?? '?').slice(0, 2).toUpperCase()
}

function getCreatedAt(user: CurrentUserResponse): string | null {
  if (!('created_at' in user) || typeof user.created_at !== 'string') {
    return null
  }

  const date = new Date(user.created_at)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date)
}

export default function Profile() {
  const [user, setUser] = useState<CurrentUserResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [retryCount])

  function retryProfileLoad() {
    setError(null)
    setLoading(true)
    setRetryCount((count) => count + 1)
  }

  if (loading) {
    return (
      <section
        aria-label="Loading profile"
        className="theme-card mx-auto max-w-4xl rounded-2xl p-8"
      >
        <div className="flex items-center justify-center gap-3 py-12 text-sm theme-text-muted">
          <LoaderCircle
            className="animate-spin"
            size={18}
            aria-hidden="true"
          />
          Loading your profile…
        </div>
      </section>
    )
  }

  if (error || !user) {
    return (
      <section className="mx-auto max-w-4xl rounded-2xl border border-red-500/20 theme-card p-6 sm:p-8">
        <div className="flex flex-col items-center py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 dark:text-red-300">
            <AlertCircle size={22} aria-hidden="true" />
          </span>

          <h1 className="mt-4 text-lg font-semibold theme-text">
            Profile unavailable
          </h1>

          <p
            role="alert"
            className="mt-2 max-w-md text-sm leading-6 theme-text-secondary"
          >
            {error ?? 'Your profile could not be loaded. Please try again.'}
          </p>

          <button
            type="button"
            onClick={retryProfileLoad}
            className="theme-button theme-hover mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Try again
          </button>
        </div>
      </section>
    )
  }

  const createdAt = getCreatedAt(user)

  return (
    <section className="mx-auto max-w-4xl space-y-6 theme-text">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-500 dark:text-purple-400">
          Account
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Profile
        </h1>

        <p className="mt-2 text-sm leading-6 theme-text-secondary">
          Your authenticated investigator account information.
        </p>
      </header>

      <div className="theme-card rounded-2xl p-5 sm:p-8">
        <div className="flex flex-col items-center gap-5 border-b theme-divider pb-7 text-center sm:flex-row sm:text-left">
          <div
            aria-label={`${user.username} initials`}
            className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10 text-2xl font-semibold text-purple-500 dark:text-purple-300"
          >
            {getInitials(user.username)}
          </div>

          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold theme-text">
              {user.username}
            </h2>

            <p className="mt-1 break-all text-sm theme-text-secondary">
              {user.email}
            </p>
          </div>
        </div>

        <dl className="grid gap-4 pt-6 sm:grid-cols-2">
          {/* Username */}
          <div className="theme-card-secondary flex min-w-0 items-start gap-3 rounded-xl p-4">
            <UserRound
              className="mt-0.5 shrink-0 text-purple-500 dark:text-purple-400"
              size={18}
              aria-hidden="true"
            />

            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                Username
              </dt>

              <dd className="mt-1 break-words text-sm theme-text-secondary">
                {user.username}
              </dd>
            </div>
          </div>

          {/* Email */}
          <div className="theme-card-secondary flex min-w-0 items-start gap-3 rounded-xl p-4">
            <Mail
              className="mt-0.5 shrink-0 text-purple-500 dark:text-purple-400"
              size={18}
              aria-hidden="true"
            />

            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                Email address
              </dt>

              <dd className="mt-1 break-all text-sm theme-text-secondary">
                {user.email}
              </dd>
            </div>
          </div>

          {/* Role */}
          <div className="theme-card-secondary flex min-w-0 items-start gap-3 rounded-xl p-4">
            <Shield
              className="mt-0.5 shrink-0 text-purple-500 dark:text-purple-400"
              size={18}
              aria-hidden="true"
            />

            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                Account role
              </dt>

              <dd className="mt-1 break-words text-sm capitalize theme-text-secondary">
                {user.role.replace(/[_-]+/g, ' ')}
              </dd>
            </div>
          </div>

          {/* Account Creation Date */}
          {createdAt && (
            <div className="theme-card-secondary flex min-w-0 items-start gap-3 rounded-xl p-4">
              <CalendarDays
                className="mt-0.5 shrink-0 text-purple-500 dark:text-purple-400"
                size={18}
                aria-hidden="true"
              />

              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide theme-text-muted">
                  Account created
                </dt>

                <dd className="mt-1 text-sm theme-text-secondary">
                  {createdAt}
                </dd>
              </div>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}