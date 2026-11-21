
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Clock3,
  Eye,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  getFindingById,
  getFindingsByCase,
  type Finding,
  type FindingSeverity,
} from '../../services/findingService'

const severityStyles: Record<FindingSeverity, string> = {
  LOW: 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-600 dark:text-emerald-400',
  MEDIUM: 'border-amber-400/20 bg-amber-400/[0.08] text-amber-600 dark:text-amber-400',
  HIGH: 'border-orange-400/20 bg-orange-400/[0.08] text-orange-600 dark:text-orange-400',
  CRITICAL: 'border-red-400/20 bg-red-400/[0.08] text-red-600 dark:text-red-400',
}

function getApiErrorMessage(error: unknown, fallback: string): string {
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

    if (error.response.status === 403) {
      return 'You do not have permission to view these findings.'
    }

    return fallback
  }

  if (
    error instanceof Error &&
    error.message ===
      'Unable to connect. Please check your connection and try again.'
  ) {
    return 'Unable to connect to CyberFusion. Check your connection and try again.'
  }

  return fallback
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatConfidence(value: number | null): string {
  return value === null ? 'Not provided' : `${(value * 100).toFixed(2)}%`
}

function isEmptyDetails(details: Finding['analysis_details']): boolean {
  return (
    details === null ||
    (Array.isArray(details) && details.length === 0) ||
    (!Array.isArray(details) && Object.keys(details).length === 0)
  )
}

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${severityStyles[severity]}`}
    >
      {severity}
    </span>
  )
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
    <article className="theme-card p-4 transition hover:opacity-90">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium theme-text-secondary">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight theme-text">
            {value}
          </p>
        </div>

        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accent}`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function FindingDetails({
  finding,
  isLoading,
  error,
  onClose,
}: {
  finding: Finding | null
  isLoading: boolean
  error: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finding-details-title"
        className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border theme-divider theme-card shadow-2xl shadow-black/30"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b theme-divider theme-card px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-500 dark:text-purple-400">
              Finding record
            </p>
            <h2
              id="finding-details-title"
              className="mt-1 text-lg font-semibold theme-text"
            >
              Finding details
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close finding details"
            onClick={onClose}
            className="rounded-lg p-2 theme-text-muted transition theme-hover hover:theme-text"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm theme-text-secondary">
              <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              Loading finding details…
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-500 dark:text-red-300"
            >
              <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : finding ? (
            <div className="space-y-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Finding ID" value={String(finding.id)} />
                <DetailField label="Case ID" value={String(finding.case_id)} />
                <DetailField
                  label="Investigator ID"
                  value={String(finding.investigator_id)}
                />
                <DetailField label="Module name" value={finding.module_name} />
                <DetailField label="Prediction" value={finding.prediction} />

                <div className="theme-card-secondary p-3.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                    Severity
                  </dt>
                  <dd className="mt-2">
                    <SeverityBadge severity={finding.severity} />
                  </dd>
                </div>

                <DetailField
                  label="Confidence score"
                  value={formatConfidence(finding.confidence_score)}
                />
                <DetailField
                  label="Created timestamp"
                  value={formatDate(finding.created_at)}
                />
              </dl>

              <section className="theme-card-secondary p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                  Input summary
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 theme-text-secondary">
                  {finding.input_summary?.trim() || 'No input summary provided.'}
                </p>
              </section>

              <section className="theme-card-secondary p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                  Analysis details
                </h3>

                {isEmptyDetails(finding.analysis_details) ? (
                  <p className="mt-2 text-sm theme-text-secondary">
                    No analysis details provided.
                  </p>
                ) : (
                  <pre className="theme-elevated theme-scroll mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs leading-5 theme-text-secondary">
                    {JSON.stringify(finding.analysis_details, null, 2)}
                  </pre>
                )}
              </section>
            </div>
          ) : (
            <p className="py-10 text-center text-sm theme-text-secondary">
              Finding details are unavailable.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-card-secondary min-w-0 p-3.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm theme-text-secondary">
        {value || 'Not provided'}
      </dd>
    </div>
  )
}

export default function FindingsManagement() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [findings, setFindings] = useState<Finding[]>([])
  const [casesError, setCasesError] = useState('')
  const [findingsError, setFindingsError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isLoadingFindings, setIsLoadingFindings] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [detailFindingId, setDetailFindingId] = useState<number | null>(null)
  const [detailFinding, setDetailFinding] = useState<Finding | null>(null)
  const [detailError, setDetailError] = useState('')
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (active) setCases(data)
      })
      .catch((error: unknown) => {
        if (active) {
          setCasesError(
            getApiErrorMessage(error, 'Your cases could not be loaded.'),
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingCases(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!caseId) return

    let active = true

    getFindingsByCase(Number(caseId))
      .then((data) => {
        if (active) setFindings(data)
      })
      .catch((error: unknown) => {
        if (active) {
          setFindingsError(
            getApiErrorMessage(error, 'Findings could not be loaded.'),
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingFindings(false)
      })

    return () => {
      active = false
    }
  }, [caseId, refreshVersion])

  useEffect(() => {
    if (detailFindingId === null) return

    let active = true

    getFindingById(detailFindingId)
      .then((data) => {
        if (active) setDetailFinding(data)
      })
      .catch((error: unknown) => {
        if (active) {
          setDetailError(
            getApiErrorMessage(error, 'Finding details could not be loaded.'),
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingDetail(false)
      })

    return () => {
      active = false
    }
  }, [detailFindingId])

  const selectedCase = cases.find((item) => String(item.id) === caseId)

  const visibleFindings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return findings.filter((finding) => {
      const matchesSearch =
        !normalizedSearch ||
        String(finding.id).includes(normalizedSearch) ||
        finding.module_name.toLowerCase().includes(normalizedSearch) ||
        finding.prediction.toLowerCase().includes(normalizedSearch)

      const matchesSeverity =
        severityFilter === 'ALL' || finding.severity === severityFilter

      return matchesSearch && matchesSeverity
    })
  }, [findings, search, severityFilter])

  const criticalCount = findings.filter(
    (finding) => finding.severity === 'CRITICAL',
  ).length

  const highCount = findings.filter(
    (finding) => finding.severity === 'HIGH',
  ).length

  const confidenceValues = findings
    .map((finding) => finding.confidence_score)
    .filter((value): value is number => value !== null)

  const averageConfidence =
    confidenceValues.length > 0
      ? `${(
          (confidenceValues.reduce((total, value) => total + value, 0) /
              confidenceValues.length) *
          100
        ).toFixed(2)}%`
      : '—'

  function refreshFindings() {
    if (!caseId || isLoadingFindings) return

    setIsLoadingFindings(true)
    setFindingsError('')
    setRefreshVersion((version) => version + 1)
  }

  function selectCase(nextCaseId: string) {
    setCaseId(nextCaseId)
    setSearch('')
    setSeverityFilter('ALL')
    setFindings([])
    setFindingsError('')
    setIsLoadingFindings(Boolean(nextCaseId))
  }

  function openFindingDetails(findingId: number) {
    setDetailFinding(null)
    setDetailError('')
    setIsLoadingDetail(true)
    setDetailFindingId(findingId)
  }

  function closeFindingDetails() {
    setDetailFindingId(null)
    setDetailFinding(null)
    setDetailError('')
    setIsLoadingDetail(false)
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 theme-text">
      {/* Page Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-purple-500 dark:text-purple-400">
            <Activity size={14} aria-hidden="true" />
            <span>Findings</span>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text">
            Detection Findings
          </h1>

          <p className="mt-1 text-sm theme-text-secondary">
            AI analysis results organized by case.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshFindings}
          disabled={!caseId || isLoadingFindings}
          className="theme-button inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg px-3 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
        >
          <RefreshCw
            size={14}
            className={isLoadingFindings ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          Refresh
        </button>
      </header>

      {/* Case Selector */}
      <section className="theme-card p-4 sm:p-5">
        <label
          htmlFor="findings-case"
          className="mb-2 block text-xs font-medium theme-text-secondary"
        >
          Case
        </label>

        <select
          id="findings-case"
          value={caseId}
          onChange={(event) => selectCase(event.target.value)}
          disabled={isLoadingCases || cases.length === 0}
          className="theme-input min-h-10 w-full rounded-lg px-3 text-sm outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10 disabled:opacity-60 sm:max-w-2xl"
        >
          <option value="">
            {isLoadingCases
              ? 'Loading cases…'
              : cases.length
                ? 'Select a case'
                : 'No cases available'}
          </option>

          {cases.map((caseItem) => (
            <option key={caseItem.id} value={caseItem.id}>
              {caseItem.case_number} — {caseItem.title}
            </option>
          ))}
        </select>

        {selectedCase && (
          <p className="mt-2 text-xs theme-text-muted">
            {selectedCase.case_number} · {selectedCase.title}
          </p>
        )}

        {(casesError || (!isLoadingCases && cases.length === 0)) && (
          <div
            role={casesError ? 'alert' : undefined}
            className={`mt-3 flex items-start gap-2 text-xs ${
              casesError ? 'text-red-500 dark:text-red-400' : 'theme-text-muted'
            }`}
          >
            {casesError && (
              <AlertCircle
                size={15}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
            )}
            <p>
              {casesError ||
                'Create or access a case before viewing findings.'}
            </p>
          </div>
        )}
      </section>

      {/* Selected Case Findings */}
      {caseId && (
        <>
          {/* Summary Cards */}
          <section aria-label="Selected case finding summaries">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total findings"
                value={findings.length}
                icon={FileSearch}
                accent="bg-purple-500/10 text-purple-500 dark:text-purple-400"
              />

              <SummaryCard
                label="Critical"
                value={criticalCount}
                icon={ShieldAlert}
                accent="bg-red-400/[0.08] text-red-500 dark:text-red-400"
              />

              <SummaryCard
                label="High"
                value={highCount}
                icon={AlertTriangle}
                accent="bg-orange-400/[0.08] text-orange-500 dark:text-orange-400"
              />

              <SummaryCard
                label="Avg. confidence"
                value={averageConfidence}
                icon={Activity}
                accent="bg-teal-400/[0.08] text-teal-500 dark:text-teal-400"
              />
            </div>
          </section>

          {/* Findings List */}
          <section className="theme-card overflow-hidden">
            {/* Search + Filter */}
            <div className="border-b theme-divider p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold theme-text">
                    Findings
                  </h2>
                  <p className="mt-1 text-xs theme-text-muted">
                    {visibleFindings.length} of {findings.length}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px] lg:w-[450px]">
                  <label className="relative block">
                    <span className="sr-only">Search findings</span>

                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 theme-text-muted"
                      aria-hidden="true"
                    />

                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search findings..."
                      className="theme-input min-h-9 w-full rounded-lg pl-9 pr-3 text-xs outline-none transition placeholder:opacity-50 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10"
                    />
                  </label>

                  <label>
                    <span className="sr-only">Filter by severity</span>

                    <select
                      value={severityFilter}
                      onChange={(event) =>
                        setSeverityFilter(event.target.value)
                      }
                      className="theme-input min-h-9 w-full rounded-lg px-3 text-xs outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10"
                    >
                      <option value="ALL">All severities</option>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {/* Content */}
            {findingsError ? (
              <div className="m-4 flex flex-col items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4 sm:flex-row sm:items-center">
                <AlertCircle
                  size={17}
                  className="shrink-0 text-red-500 dark:text-red-400"
                  aria-hidden="true"
                />

                <p role="alert" className="flex-1 text-sm text-red-500 dark:text-red-300">
                  {findingsError}
                </p>

                <button
                  type="button"
                  onClick={refreshFindings}
                  className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-medium text-red-500 dark:text-red-300 transition hover:bg-red-400/[0.06]"
                >
                  Try again
                </button>
              </div>
            ) : isLoadingFindings ? (
              <div
                className="space-y-3 p-4 sm:p-5"
                aria-label="Loading findings"
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="theme-elevated h-24 animate-pulse rounded-xl"
                  />
                ))}
              </div>
            ) : findings.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <span className="theme-card-secondary flex size-11 items-center justify-center rounded-xl theme-text-muted">
                  <FileSearch size={19} aria-hidden="true" />
                </span>

                <p className="mt-3 text-sm font-medium theme-text-secondary">
                  No findings
                </p>

                <p className="mt-1 max-w-sm text-xs leading-5 theme-text-muted">
                  Run an analysis and save it to this case to see findings here.
                </p>
              </div>
            ) : visibleFindings.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium theme-text-secondary">
                  No matching findings
                </p>
                <p className="mt-1 text-xs theme-text-muted">
                  Try changing your search or severity filter.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 p-3 sm:p-4">
                {visibleFindings.map((finding) => (
                  <article
                    key={finding.id}
                    className="theme-card-secondary p-4 transition hover:opacity-90 sm:p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        {/* Finding tags */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs theme-text-muted">
                            #{finding.id}
                          </span>

                          <SeverityBadge severity={finding.severity} />

                          <span className="theme-button rounded-md px-2 py-1 text-[10px] font-medium theme-text-secondary">
                            {finding.module_name}
                          </span>
                        </div>

                        {/* Prediction */}
                        <p className="mt-3 break-words text-sm font-medium theme-text">
                          {finding.prediction}
                        </p>

                        {/* Metadata */}
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs theme-text-muted">
                          <span>
                            Confidence:{' '}
                            <span className="theme-text-secondary">
                              {formatConfidence(finding.confidence_score)}
                            </span>
                          </span>

                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={13} aria-hidden="true" />
                            {formatDate(finding.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Details button */}
                      <button
                        type="button"
                        onClick={() => openFindingDetails(finding.id)}
                        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-purple-500/20 bg-purple-500/[0.08] px-3 text-xs font-medium text-purple-500 dark:text-purple-400 transition hover:border-purple-500/40 hover:bg-purple-500/[0.14] lg:self-center"
                      >
                        <Eye size={14} aria-hidden="true" />
                        Details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Finding Details Modal */}
      {detailFindingId !== null && (
        <FindingDetails
          finding={detailFinding}
          isLoading={isLoadingDetail}
          error={detailError}
          onClose={closeFindingDetails}
        />
      )}
    </main>
  )
}
