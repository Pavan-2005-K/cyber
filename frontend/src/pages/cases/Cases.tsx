
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  CalendarDays,
  FilePlus2,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import {
  createCase,
  getCases,
  type Case,
  type CaseCreateRequest,
} from '../../services/caseService'

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
          .map((item: unknown) => {
            if (
              typeof item === 'object' &&
              item !== null &&
              'msg' in item &&
              typeof item.msg === 'string'
            ) {
              return item.msg
            }
            return null
          })
          .filter((message): message is string => message !== null)

        if (messages.length) return messages.join(' ')
      }
    }

    if (error.response.status === 401) {
      return 'Your session may have expired. Please sign in again.'
    }
    if (error.response.status === 403) {
      return 'You do not have permission to manage cases.'
    }
    return 'The request could not be completed. Please try again.'
  }

  if (
    error instanceof Error &&
    error.message ===
      'Unable to connect. Please check your connection and try again.'
  ) {
    return 'Unable to connect to CyberFusion. Check your connection and try again.'
  }

  return 'Cases could not be loaded. Please try again.'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function CaseStatus({ status }: { status: string }) {
  const normalized = status.toUpperCase()

  const appearance =
    normalized === 'OPEN'
      ? 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-300'
      : normalized === 'CLOSED'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
        : 'border-[var(--border-color)] bg-[var(--bg-card-hover)] theme-text-muted'

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${appearance}`}
    >
      {status}
    </span>
  )
}

function CaseTableSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-label="Loading cases">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-12 animate-pulse rounded-lg bg-[var(--bg-card-hover)]"
        />
      ))}
    </div>
  )
}

type CreateCaseModalProps = {
  onClose: () => void
  onCreated: (data: CaseCreateRequest) => Promise<void>
}

function CreateCaseModal({ onClose, onCreated }: CreateCaseModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionLock = useRef(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return
    setErrorMessage('')

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setErrorMessage('Enter a case title.')
      return
    }
    if (trimmedTitle.length < 3) {
      setErrorMessage('The case title must contain at least 3 characters.')
      return
    }
    if (trimmedTitle.length > 200) {
      setErrorMessage('The case title cannot exceed 200 characters.')
      return
    }
    if (description.trim().length > 2000) {
      setErrorMessage('The description cannot exceed 2000 characters.')
      return
    }

    submissionLock.current = true
    setIsSubmitting(true)

    try {
      await onCreated({
        title: trimmedTitle,
        description: description.trim(),
      })
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      submissionLock.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-case-title"
        className="theme-card w-full max-w-md p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="create-case-title" className="text-base font-semibold theme-text">
              Create case
            </h2>
            <p className="mt-1 text-xs theme-text-muted">
              New investigation
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-2 theme-text-muted theme-hover hover:theme-text disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-600 dark:text-red-300"
            >
              {errorMessage}
            </p>
          )}

          <div>
            <label
              htmlFor="case-title"
              className="mb-1.5 block text-xs font-medium theme-text-secondary"
            >
              Case title <span className="text-red-500">*</span>
            </label>
            <input
              id="case-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={200}
              required
              autoFocus
              placeholder="Enter case title"
              className="theme-input w-full rounded-lg px-3.5 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
            />
            <p className="mt-1 text-right text-[10px] theme-text-muted">
              {title.length}/200
            </p>
          </div>

          <div>
            <label
              htmlFor="case-description"
              className="mb-1.5 block text-xs font-medium theme-text-secondary"
            >
              Description <span className="theme-text-muted">(optional)</span>
            </label>
            <textarea
              id="case-description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Investigation details"
              className="theme-input w-full resize-y rounded-lg px-3.5 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
            />
            <p className="mt-1 text-right text-[10px] theme-text-muted">
              {description.length}/2000
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="theme-button rounded-lg px-4 py-2.5 text-sm theme-text-secondary hover:opacity-80 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}
              {isSubmitting ? 'Creating…' : 'Create case'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function Cases() {
  const [cases, setCases] = useState<Case[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (active) setCases(data)
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
  }, [reloadCount])

  const statuses = useMemo(
    () => [...new Set(cases.map((caseItem) => caseItem.status))].sort(),
    [cases],
  )

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase()

    return cases.filter((caseItem) => {
      const matchesStatus =
        statusFilter === 'ALL' || caseItem.status === statusFilter

      const matchesSearch =
        !query ||
        [caseItem.case_number, caseItem.title, caseItem.description].some(
          (value) => value?.toLowerCase().includes(query),
        )

      return matchesStatus && matchesSearch
    })
  }, [cases, search, statusFilter])

  const handleCreate = useCallback(async (data: CaseCreateRequest) => {
    await createCase(data)
    setSuccessMessage('Case created successfully.')
    setIsCreateModalOpen(false)
    setErrorMessage('')
    setIsLoading(true)
    setReloadCount((count) => count + 1)
  }, [])

  function retryLoading() {
    setErrorMessage('')
    setIsLoading(true)
    setReloadCount((count) => count + 1)
  }

  function refreshCases() {
    setErrorMessage('')
    setSuccessMessage('')
    setIsLoading(true)
    setReloadCount((count) => count + 1)
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 theme-text">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-500 dark:text-purple-400">
            Investigation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight theme-text">
            Cases
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {!isLoading && !errorMessage && (
            <span className="theme-card-secondary rounded-lg px-3 py-2 text-xs theme-text-secondary">
              <span className="font-semibold theme-text">{cases.length}</span> total
            </span>
          )}

          <button
            type="button"
            onClick={refreshCases}
            disabled={isLoading}
            aria-label="Refresh cases"
            title="Refresh cases"
            className="theme-button inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium theme-text-secondary hover:opacity-80 disabled:opacity-50"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSuccessMessage('')
              setIsCreateModalOpen(true)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-700"
          >
            <FilePlus2 size={15} />
            New case
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-600 dark:text-emerald-300"
        >
          {successMessage}
        </p>
      )}

      {/* Cases panel */}
      <div className="theme-card overflow-hidden">
        {/* Search and filters */}
        <div className="flex flex-col gap-3 border-b border-[var(--border-color)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 theme-text-muted"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases…"
              aria-label="Search cases"
              className="theme-input w-full rounded-lg py-2 pl-9 pr-3 text-xs outline-none placeholder:text-[var(--text-muted)] focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] theme-text-muted">Status</span>
            <select
              id="case-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="theme-input min-w-32 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500"
            >
              <option value="ALL">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error state */}
        {errorMessage ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-300">
              <AlertCircle size={18} />
            </span>
            <p className="mt-3 text-sm font-medium theme-text">
              Could not load cases
            </p>
            <p role="alert" className="mt-1 max-w-md text-xs theme-text-secondary">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={retryLoading}
              className="theme-button mt-4 rounded-lg px-3 py-2 text-xs theme-text-secondary hover:opacity-80"
            >
              Try again
            </button>
          </div>
        ) : isLoading ? (
          <CaseTableSkeleton />
        ) : cases.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/5 text-purple-500 dark:text-purple-400">
              <FolderOpen size={20} />
            </span>
            <h2 className="mt-3 text-sm font-semibold theme-text">
              No cases yet
            </h2>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-700"
            >
              <Plus size={15} />
              Create first case
            </button>
          </div>
        ) : filteredCases.length === 0 ? (
          /* No search results */
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <Search size={20} className="theme-text-muted" />
            <p className="mt-3 text-sm font-medium theme-text-secondary">
              No matching cases
            </p>
            <p className="mt-1 text-xs theme-text-muted">
              Change your search or filter.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto">
              <table className="theme-table w-full min-w-[780px] text-left">
                <thead>
                  <tr className="theme-table-header border-b text-[10px] font-medium uppercase tracking-wider">
                    <th className="px-5 py-3">Case number</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3">Created</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-color)]">
                  {filteredCases.map((caseItem) => (
                    <tr
                      key={caseItem.id}
                      className="transition theme-hover"
                    >
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-purple-500 dark:text-purple-400">
                        {caseItem.case_number}
                      </td>
                      <td className="max-w-64 px-4 py-3.5 text-sm font-medium theme-text">
                        <span className="block truncate">{caseItem.title}</span>
                      </td>
                      <td className="max-w-72 px-4 py-3.5 text-xs theme-text-secondary">
                        <span className="block truncate">
                          {caseItem.description || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <CaseStatus status={caseItem.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs theme-text-secondary">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={13} className="theme-text-muted" />
                          {formatDate(caseItem.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border-color)] px-4 py-3 text-[11px] theme-text-muted">
              Showing {filteredCases.length} of {cases.length} cases
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      {isCreateModalOpen && (
        <CreateCaseModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleCreate}
        />
      )}
    </section>
  )
}
