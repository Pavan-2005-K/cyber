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
  LOW: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  MEDIUM: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  HIGH: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  CRITICAL: 'border-red-400/20 bg-red-400/10 text-red-300',
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
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${severityStyles[severity]}`}
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
    <article className="rounded-2xl border border-white/[0.08] bg-[#303236] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finding-details-title"
        className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#303236] shadow-2xl shadow-black/50"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#303236] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400">
              Finding record
            </p>
            <h2
              id="finding-details-title"
              className="mt-1 text-lg font-semibold text-white"
            >
              Finding details
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close finding details"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              Loading finding details…
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-200"
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
                <div className="rounded-xl border border-white/[0.07] bg-[#252629] p-3.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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

              <section className="rounded-xl border border-white/[0.07] bg-[#252629] p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Input summary
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                  {finding.input_summary?.trim() || 'No input summary provided.'}
                </p>
              </section>

              <section className="rounded-xl border border-white/[0.07] bg-[#252629] p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Analysis details
                </h3>
                {isEmptyDetails(finding.analysis_details) ? (
                  <p className="mt-2 text-sm text-slate-400">
                    No analysis details provided.
                  </p>
                ) : (
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs leading-5 text-slate-300">
                    {JSON.stringify(finding.analysis_details, null, 2)}
                  </pre>
                )}
              </section>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">
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
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-[#252629] p-3.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm text-slate-200">{value || 'Not provided'}</dd>
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
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">
            <Activity size={14} aria-hidden="true" />
            Investigation records
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Detection Findings
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">
            Review AI analysis findings saved to a selected case. Findings are
            loaded per case; this page does not show a cross-case listing.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshFindings}
          disabled={!caseId || isLoadingFindings}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/[0.1] bg-white/[0.035] px-3.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw
            size={15}
            className={isLoadingFindings ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          Refresh
        </button>
      </header>

      <section className="rounded-2xl border border-white/[0.08] bg-[#303236] p-4 sm:p-5">
        <label
          htmlFor="findings-case"
          className="mb-2 block text-xs font-medium text-slate-300"
        >
          Select a case
        </label>
        <select
          id="findings-case"
          value={caseId}
          onChange={(event) => {
            selectCase(event.target.value)
          }}
          disabled={isLoadingCases || cases.length === 0}
          className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#252629] px-3.5 text-sm text-slate-100 outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 sm:max-w-2xl"
        >
          <option value="">
            {isLoadingCases
              ? 'Loading cases…'
              : cases.length
                ? 'Choose a case to view its findings'
                : 'No cases available'}
          </option>
          {cases.map((caseItem) => (
            <option key={caseItem.id} value={caseItem.id}>
              {caseItem.case_number} — {caseItem.title}
            </option>
          ))}
        </select>
        {selectedCase && (
          <p className="mt-2 text-xs text-slate-500">
            Showing findings for {selectedCase.case_number} — {selectedCase.title}
          </p>
        )}
        {(casesError || (!isLoadingCases && cases.length === 0)) && (
          <div
            role={casesError ? 'alert' : undefined}
            className={`mt-3 flex items-start gap-2 text-xs ${
              casesError ? 'text-red-300' : 'text-slate-500'
            }`}
          >
            {casesError && <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <p>{casesError || 'Create or access a case before viewing findings.'}</p>
          </div>
        )}
      </section>

      {caseId && (
        <>
          <section aria-label="Selected case finding summaries">
            <p className="mb-3 text-xs text-slate-500">
              Summary applies only to the selected case and the findings returned
              for that case.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total findings"
                value={findings.length}
                icon={FileSearch}
                accent="bg-blue-400/10 text-blue-300"
              />
              <SummaryCard
                label="Critical findings"
                value={criticalCount}
                icon={ShieldAlert}
                accent="bg-red-400/10 text-red-300"
              />
              <SummaryCard
                label="High findings"
                value={highCount}
                icon={AlertTriangle}
                accent="bg-orange-400/10 text-orange-300"
              />
              <SummaryCard
                label="Average confidence"
                value={averageConfidence}
                icon={Activity}
                accent="bg-violet-400/10 text-violet-300"
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#303236]">
            <div className="border-b border-white/[0.07] p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Findings for selected case
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {visibleFindings.length} of {findings.length} displayed
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_170px] lg:w-[470px]">
                  <label className="relative block">
                    <span className="sr-only">Search findings</span>
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search ID, module, or prediction"
                      className="min-h-10 w-full rounded-xl border border-white/[0.1] bg-[#252629] pl-9 pr-3 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/15"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter by severity</span>
                    <select
                      value={severityFilter}
                      onChange={(event) => setSeverityFilter(event.target.value)}
                      className="min-h-10 w-full rounded-xl border border-white/[0.1] bg-[#252629] px-3 text-xs text-slate-200 outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/15"
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

            {findingsError ? (
              <div className="m-4 flex flex-col items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 sm:flex-row sm:items-center">
                <AlertCircle size={18} className="shrink-0 text-red-300" aria-hidden="true" />
                <p role="alert" className="flex-1 text-sm text-red-200">
                  {findingsError}
                </p>
                <button
                  type="button"
                  onClick={refreshFindings}
                  className="rounded-lg border border-red-300/20 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-300/10"
                >
                  Try again
                </button>
              </div>
            ) : isLoadingFindings ? (
              <div className="space-y-3 p-4 sm:p-5" aria-label="Loading findings">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="h-24 animate-pulse rounded-xl bg-white/[0.04]"
                  />
                ))}
              </div>
            ) : findings.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
                  <FileSearch size={20} aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-medium text-slate-300">
                  No findings for this case
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Findings will appear here after an analysis is saved to this
                  case.
                </p>
              </div>
            ) : visibleFindings.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-slate-300">
                  No findings match these filters
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Adjust the search text or severity filter.
                </p>
              </div>
            ) : (
              <div className="space-y-3 p-4 sm:p-5">
                {visibleFindings.map((finding) => (
                  <article
                    key={finding.id}
                    className="rounded-xl border border-white/[0.07] bg-[#252629] p-4 transition hover:border-white/[0.12] sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-medium text-slate-400">
                            #{finding.id}
                          </span>
                          <SeverityBadge severity={finding.severity} />
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-slate-400">
                            {finding.module_name}
                          </span>
                        </div>
                        <p className="mt-3 break-words text-sm font-semibold text-slate-100">
                          {finding.prediction}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                          <span>
                            Confidence:{' '}
                            <span className="text-slate-300">
                              {formatConfidence(finding.confidence_score)}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={13} aria-hidden="true" />
                            {formatDate(finding.created_at)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openFindingDetails(finding.id)}
                        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-blue-400/20 bg-blue-500/[0.08] px-3 text-xs font-medium text-blue-300 transition hover:border-blue-400/35 hover:bg-blue-500/[0.14] lg:self-center"
                      >
                        <Eye size={14} aria-hidden="true" />
                        View details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

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
