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
    if (
      typeof data === 'object' &&
      data !== null &&
      'detail' in data
    ) {
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
      ? 'border-blue-400/20 bg-blue-400/10 text-blue-300'
      : normalized === 'CLOSED'
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
        : 'border-white/10 bg-white/[0.04] text-slate-300'

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${appearance}`}
    >
      {status}
    </span>
  )
}

function CaseTableSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-label="Loading cases">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-14 animate-pulse rounded-xl bg-white/[0.04]"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-case-title"
        className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#303236] p-5 shadow-2xl shadow-black/50 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
              Case management
            </p>
            <h2
              id="create-case-title"
              className="mt-2 text-xl font-semibold text-white"
            >
              Create a case
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Add a case to your investigation workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
            >
              {errorMessage}
            </p>
          )}

          <div className="space-y-2">
            <label
              htmlFor="case-title"
              className="block text-sm font-medium text-slate-200"
            >
              Case title <span className="text-red-300">*</span>
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
              placeholder="Enter a descriptive title"
              className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <p className="text-right text-[11px] text-slate-600">
              {title.length}/200
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="case-description"
              className="block text-sm font-medium text-slate-200"
            >
              Description <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              id="case-description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Add relevant investigation details"
              className="w-full resize-y rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <p className="text-right text-[11px] text-slate-600">
              {description.length}/2000
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 sm:py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
            >
              {isSubmitting ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus size={16} aria-hidden="true" />
              )}
              {isSubmitting ? 'Creating case…' : 'Create case'}
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
        [
          caseItem.case_number,
          caseItem.title,
          caseItem.description,
        ].some((value) => value?.toLowerCase().includes(query))

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
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
            Investigation
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Cases Management
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Track and organize the cases assigned to your investigations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isLoading && !errorMessage && (
            <span className="rounded-xl border border-white/[0.08] bg-[#303236] px-3.5 py-2.5 text-sm text-slate-300">
              <span className="font-semibold text-white">{cases.length}</span>{' '}
              {cases.length === 1 ? 'case' : 'cases'}
            </span>
          )}
          <button
            type="button"
            onClick={refreshCases}
            disabled={isLoading}
            aria-label="Refresh cases"
            title="Refresh cases"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-[#303236] px-3.5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-[#383a3f] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={isLoading ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSuccessMessage('')
              setIsCreateModalOpen(true)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30"
          >
            <FilePlus2 size={17} aria-hidden="true" />
            Create Case
          </button>
        </div>
      </div>

      {successMessage && (
        <p
          role="status"
          className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
        >
          {successMessage}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#303236]">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="relative w-full sm:max-w-sm">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases"
              aria-label="Search cases"
              className="w-full rounded-xl border border-white/[0.08] bg-[#242629] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-white/15 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="flex items-center gap-3">
            <label
              htmlFor="case-status-filter"
              className="shrink-0 text-xs font-medium text-slate-500"
            >
              Status
            </label>
            <select
              id="case-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-w-32 rounded-xl border border-white/[0.08] bg-[#242629] px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
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

        {errorMessage ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl border border-amber-400/15 bg-amber-400/10 text-amber-300">
              <AlertCircle size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-200">
              Could not load cases
            </p>
            <p role="alert" className="mt-1 max-w-md text-sm text-slate-400">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={retryLoading}
              className="mt-4 rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              Try again
            </button>
          </div>
        ) : isLoading ? (
          <CaseTableSkeleton />
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-500/10 text-blue-400">
              <FolderOpen size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-slate-200">
              No cases yet
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
              Create your first case to start organizing an investigation.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
            >
              <Plus size={16} aria-hidden="true" />
              Create your first case
            </button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
              <Search size={19} aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-300">
              No matching cases
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Try changing your search or status filter.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <th scope="col" className="px-5 py-3 sm:px-6">
                      Case number
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Case title
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Description
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 sm:px-6">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredCases.map((caseItem) => (
                    <tr
                      key={caseItem.id}
                      className="transition hover:bg-white/[0.025]"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-medium text-blue-300 sm:px-6">
                        {caseItem.case_number}
                      </td>
                      <td className="max-w-64 px-4 py-4 text-sm font-medium text-slate-200">
                        <span className="block truncate">{caseItem.title}</span>
                      </td>
                      <td className="max-w-80 px-4 py-4 text-sm text-slate-400">
                        <span className="block truncate">
                          {caseItem.description || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <CaseStatus status={caseItem.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400 sm:px-6">
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays
                            size={14}
                            className="text-slate-600"
                            aria-hidden="true"
                          />
                          {formatDate(caseItem.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/[0.06] px-5 py-3 text-xs text-slate-500 sm:px-6">
              Showing {filteredCases.length} of {cases.length}{' '}
              {cases.length === 1 ? 'case' : 'cases'}
            </div>
          </>
        )}
      </div>

      {isCreateModalOpen && (
        <CreateCaseModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleCreate}
        />
      )}
    </section>
  )
}
