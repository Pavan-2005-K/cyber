
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  LoaderCircle,
  RefreshCw,
  Search,
  Shield,
  X,
} from 'lucide-react'
import {
  getAuditLogs,
  type AuditLogPage,
  type AuditRecord,
} from '../../services/auditService'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const knownActionLabels: Record<string, string> = {
  USER_REGISTERED: 'User registered',
  LOGIN_SUCCESS: 'Successful login',
  LOGIN_FAILED: 'Failed login',
  CASE_CREATED: 'Case created',
  EVIDENCE_UPLOADED: 'Evidence uploaded',
  EVIDENCE_VERIFICATION_COMPLETED: 'Evidence verification completed',
  INTEGRITY_RECORD_CREATED: 'Integrity record created',
  DETECTION_FINDING_CREATED: 'Detection finding created',
  AI_DETECTION_FINDING_CREATED: 'AI detection finding created',
  REPORT_GENERATED: 'Report generated',
  REPORT_DOWNLOADED: 'Report downloaded',
}

const sensitiveKeyPattern =
  /password|passwd|secret|token|credential|authorization|api[_-]?key|private[_-]?key/i

const sensitiveAssignmentPattern =
  /\b(password|passwd|secret|token|credential|authorization|api[_-]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi

function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    const data: unknown = error.response.data
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const { detail } = data
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item: unknown) =>
            typeof item === 'object' &&
            item !== null &&
            'msg' in item &&
            typeof item.msg === 'string'
              ? item.msg
              : null,
          )
          .filter((message): message is string => message !== null)
        if (messages.length) return messages.join(' ')
      }
    }

    if (error.response.status === 401) {
      return 'Your session may have expired. Please sign in again.'
    }
    return 'Audit activity could not be loaded. Please try again.'
  }

  if (
    error instanceof Error &&
    error.message ===
      'Unable to connect. Please check your connection and try again.'
  ) {
    return 'Unable to connect to CyberFusion. Check your connection and try again.'
  }

  return 'Audit activity could not be loaded. Please try again.'
}

function formatAction(action: string): string {
  const knownLabel = knownActionLabels[action]
  if (knownLabel) return knownLabel

  return (
    action
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || action
  )
}

function formatDate(value: string | null): string {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function sanitizeDetailValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKeyPattern.test(key)) return '[REDACTED]'

  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(
        sensitiveAssignmentPattern,
        (_match, name: string, separator: string) =>
          `${name}${separator}[REDACTED]`,
      )
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDetailValue(item))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeDetailValue(entryValue, entryKey),
      ]),
    )
  }

  return value
}

function formatDetails(details: unknown): string {
  try {
    const safeDetails = sanitizeDetailValue(details)
    return JSON.stringify(safeDetails, null, 2) ?? 'No details provided.'
  } catch {
    return 'Event details could not be displayed.'
  }
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  icon: typeof Activity
  accent: string
}) {
  return (
    <article className="theme-card p-4 transition hover:border-purple-500/30 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium theme-text-secondary">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight theme-text">
            {value}
          </p>
        </div>
        <span className={`flex size-10 items-center justify-center rounded-xl ${accent}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function AuditDetailsModal({
  record,
  onClose,
}: {
  record: AuditRecord
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-details-title"
        className="theme-card my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto shadow-2xl shadow-black/40"
      >
        <div className="theme-popup sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-500 dark:text-purple-400">
              Audit event
            </p>
            <h2
              id="audit-details-title"
              className="mt-1 break-words text-lg font-semibold theme-text"
            >
              {formatAction(record.action)}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close event details"
            onClick={onClose}
            className="rounded-lg p-2 theme-text-muted transition theme-hover hover:text-purple-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="theme-card-secondary p-3.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                Event ID
              </dt>
              <dd className="mt-1.5 font-mono text-sm theme-text">
                {record.id}
              </dd>
            </div>

            <div className="theme-card-secondary p-3.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                User ID
              </dt>
              <dd className="mt-1.5 text-sm theme-text-secondary">
                {record.user_id ?? 'Not available'}
              </dd>
            </div>

            <div className="theme-card-secondary p-3.5 sm:col-span-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                Timestamp
              </dt>
              <dd className="mt-1.5 text-sm theme-text-secondary">
                {formatDate(record.created_at)}
              </dd>
            </div>
          </dl>

          <section className="theme-card-secondary p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
              Event details
            </h3>
            <pre className="theme-elevated theme-scroll mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs leading-5 theme-text-secondary">
              {formatDetails(record.details)}
            </pre>
          </section>

          <p className="text-[11px] leading-5 theme-text-muted">
            Credential-like values are hidden when their keys or text patterns
            are identifiable.
          </p>
        </div>
      </section>
    </div>
  )
}

function AuditRecordContent({
  record,
  onViewDetails,
}: {
  record: AuditRecord
  onViewDetails: () => void
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold theme-text">
            {formatAction(record.action)}
          </span>
          <span className="theme-card-secondary rounded-full px-2 py-0.5 font-mono text-[10px] theme-text-muted">
            {record.action}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs theme-text-muted">
          <span>
            User ID:{' '}
            <span className="theme-text-secondary">
              {record.user_id ?? 'Not available'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} aria-hidden="true" />
            {formatDate(record.created_at)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onViewDetails}
        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 text-xs font-medium text-purple-600 transition hover:border-purple-500/40 hover:bg-purple-500/15 dark:text-purple-300"
      >
        <Eye size={14} aria-hidden="true" />
        Details
      </button>
    </>
  )
}

export default function AuditLogs() {
  const [page, setPage] = useState<AuditLogPage>({
    total: 0,
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
    logs: [],
  })

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null)

  useEffect(() => {
    let active = true

    getAuditLogs(page.limit, page.offset)
      .then((response) => {
        if (active) {
          setPage(response)
          setErrorMessage('')
        }
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getApiErrorMessage(error))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [page.limit, page.offset, refreshVersion])

  const distinctActions = new Set(page.logs.map((record) => record.action)).size

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return page.logs

    return page.logs.filter(
      (record) =>
        record.action.toLowerCase().includes(query) ||
        formatAction(record.action).toLowerCase().includes(query) ||
        String(record.user_id ?? '').includes(query) ||
        String(record.id).includes(query),
    )
  }, [page.logs, search])

  const rangeStart =
    page.total === 0 || page.logs.length === 0 ? 0 : page.offset + 1

  const rangeEnd =
    page.logs.length === 0 ? 0 : page.offset + page.logs.length

  const canGoPrevious = page.offset > 0 && !isLoading
  const canGoNext = page.offset + page.logs.length < page.total && !isLoading
  const hasLoadedPage = page.logs.length > 0 || page.total === 0

  function refreshLogs() {
    if (isLoading) return
    setErrorMessage('')
    setIsLoading(true)
    setRefreshVersion((version) => version + 1)
  }

  function changePage(nextOffset: number) {
    if (isLoading) return
    setSearch('')
    setErrorMessage('')
    setIsLoading(true)
    setPage((current) => ({ ...current, offset: nextOffset }))
  }

  function changePageSize(value: string) {
    const nextLimit = Number(value)

    if (
      !Number.isInteger(nextLimit) ||
      nextLimit < 1 ||
      nextLimit > MAX_PAGE_SIZE ||
      isLoading
    ) {
      return
    }

    setSearch('')
    setErrorMessage('')
    setIsLoading(true)

    setPage((current) => ({
      ...current,
      limit: nextLimit,
      offset: 0,
    }))
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 theme-text">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-purple-500 dark:text-purple-400">
            <Shield size={14} aria-hidden="true" />
            Account activity
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
            Audit Logs
          </h1>

          <p className="mt-1.5 max-w-2xl text-sm leading-6 theme-text-secondary">
            View recorded security and investigation activities associated
            with your account.
          </p>

          <p className="mt-2 max-w-2xl text-xs leading-5 theme-text-muted">
            Only activities explicitly recorded by the backend are shown. These
            entries are your account’s recorded activity, not a complete record
            of every platform action.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshLogs}
          disabled={isLoading}
          className="theme-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-medium transition hover:border-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw
            size={15}
            className={isLoading ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          Refresh
        </button>
      </header>

      {/* Summary Cards */}
      <section aria-label="Audit activity summary">
        <p className="mb-3 text-xs theme-text-muted">
          Counts reflect the API total and the currently loaded page for your
          account.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Total recorded events"
            value={page.total.toLocaleString()}
            icon={ClipboardList}
            accent="bg-purple-500/10 text-purple-600 dark:text-purple-400"
          />

          <SummaryCard
            label="Events on current page"
            value={page.logs.length}
            icon={Activity}
            accent="bg-violet-400/10 text-violet-600 dark:text-violet-300"
          />

          <SummaryCard
            label="Action types on current page"
            value={distinctActions}
            icon={ArrowDown}
            accent="bg-emerald-400/10 text-emerald-600 dark:text-emerald-300"
          />
        </div>
      </section>

      {/* Activity Panel */}
      <section className="theme-card overflow-hidden shadow-lg shadow-black/5">
        {/* Toolbar */}
        <div className="theme-divider border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold theme-text">
                Recorded activity
              </h2>
              <p className="mt-1 text-xs theme-text-muted">
                {isLoading
                  ? 'Loading activity…'
                  : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${page.total.toLocaleString()}`}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search events on current page</span>
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 theme-text-muted"
                  aria-hidden="true"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search current page"
                  className="theme-input min-h-10 w-full rounded-xl pl-9 pr-3 text-xs outline-none transition placeholder:opacity-50 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10"
                />
              </label>

              <label className="theme-input flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs theme-text-secondary">
                Page size
                <select
                  value={page.limit}
                  onChange={(event) => changePageSize(event.target.value)}
                  disabled={isLoading}
                  className="bg-transparent font-medium theme-text outline-none disabled:opacity-60"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
          </div>

          <p className="mt-2 text-[11px] theme-text-muted">
            Search filters only the events currently loaded on this page.
          </p>
        </div>

        {/* Loading / Error / Empty / Results */}
        {errorMessage ? (
          <div className="m-4 flex flex-col items-start gap-3 rounded-xl border border-red-300/30 bg-red-500/5 p-4 sm:mx-5 sm:flex-row sm:items-center">
            <AlertCircle
              size={17}
              className="shrink-0 text-red-500 dark:text-red-300"
              aria-hidden="true"
            />

            <p role="alert" className="flex-1 text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </p>

            <button
              type="button"
              onClick={refreshLogs}
              className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-500/5 dark:text-red-300"
            >
              Retry
            </button>
          </div>
        ) : isLoading && !hasLoadedPage ? (
          <div className="space-y-3 p-4 sm:p-5" aria-label="Loading audit logs">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="theme-elevated h-16 animate-pulse rounded-xl opacity-50"
              />
            ))}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm theme-text-secondary">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading activity…
          </div>
        ) : page.logs.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="theme-card-secondary flex size-11 items-center justify-center rounded-xl theme-text-muted">
              <ClipboardList size={20} aria-hidden="true" />
            </span>

            <p className="mt-3 text-sm font-medium theme-text-secondary">
              No recorded activity
            </p>

            <p className="mt-1 max-w-sm text-xs leading-5 theme-text-muted">
              No audit events are available for this account.
            </p>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium theme-text-secondary">
              No events match this search
            </p>
            <p className="mt-1 text-xs theme-text-muted">
              Search only covers the events on the current page.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="theme-table w-full min-w-[760px] text-left text-xs">
                <thead className="theme-table-header border-b text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Activity</th>
                    <th className="px-5 py-3 font-semibold">User ID</th>
                    <th className="px-5 py-3 font-semibold">Timestamp</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Details
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y theme-divider">
                  {visibleRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="transition theme-hover"
                    >
                      <td className="px-5 py-4">
                        <div className="font-medium theme-text">
                          {formatAction(record.action)}
                        </div>
                        <div className="mt-1 font-mono text-[10px] theme-text-muted">
                          {record.action}
                        </div>
                      </td>

                      <td className="px-5 py-4 theme-text-secondary">
                        {record.user_id ?? 'Not available'}
                      </td>

                      <td className="px-5 py-4 theme-text-secondary">
                        {formatDate(record.created_at)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(record)}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 text-xs font-medium text-purple-600 transition hover:border-purple-500/40 hover:bg-purple-500/15 dark:text-purple-300"
                        >
                          <Eye size={14} aria-hidden="true" />
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 p-4 md:hidden">
              {visibleRecords.map((record) => (
                <article
                  key={record.id}
                  className="theme-card-secondary flex flex-col gap-3 p-4 transition hover:border-purple-500/20"
                >
                  <AuditRecordContent
                    record={record}
                    onViewDetails={() => setSelectedRecord(record)}
                  />
                </article>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        <footer className="theme-divider flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs theme-text-muted">
            {page.total.toLocaleString()} total recorded events
          </p>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() =>
                changePage(Math.max(0, page.offset - page.limit))
              }
              disabled={!canGoPrevious}
              className="theme-button inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition hover:border-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Previous
            </button>

            <span className="min-w-16 text-center text-[11px] theme-text-muted">
              {page.total === 0
                ? '0 / 0'
                : `${Math.floor(page.offset / page.limit) + 1} / ${Math.ceil(page.total / page.limit)}`}
            </span>

            <button
              type="button"
              onClick={() =>
                changePage(page.offset + page.limit)
              }
              disabled={!canGoNext}
              className="theme-button inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition hover:border-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>

      {/* Audit Note */}
      <p className="flex items-start gap-2 text-[11px] leading-5 theme-text-muted">
        <ArrowUp size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        Failed login events without an associated user ID are not returned by the
        backend’s current-account audit listing.
      </p>

      {/* Details Modal */}
      {selectedRecord && (
        <AuditDetailsModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </main>
  )
}
