
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  downloadReport,
  generateReport,
  getReports,
  type Report,
} from '../../services/reportService'

function getApiErrorMessage(
  error: unknown,
  fallback: string,
  action: 'general' | 'download' = 'general',
): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    if (action === 'download' && error.response.status === 404) {
      return 'The PDF file could not be found. It may have been removed from server storage.'
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

function GeneratedReportNotice({ report }: { report: Report })  {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
      <CheckCircle2
        size={18}
        className="mt-0.5 shrink-0 text-emerald-500"
        aria-hidden="true"
      />

      <div className="min-w-0">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
          PDF report generated
        </p>

        <p className="mt-1 break-words text-xs leading-5 text-emerald-600/80 dark:text-emerald-200/75">
          {report.report_number} · Case ID {report.case_id} ·{' '}
          {formatDate(report.created_at)}
        </p>
      </div>
  </div>
  )
}

export default function InvestigationReports() {
  const [cases, setCases] = useState<Case[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [casesError, setCasesError] = useState('')
  const [reportsError, setReportsError] = useState('')
  const [generateError, setGenerateError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isLoadingReports, setIsLoadingReports] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [downloadingReportId, setDownloadingReportId] = useState<number | null>(
    null,
  )
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null)
  const [search, setSearch] = useState('')
  const [reportsRefreshVersion, setReportsRefreshVersion] = useState(0)

  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (active) {
          setCases(data)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCasesError(
            getApiErrorMessage(error, 'Your cases could not be loaded.'),
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingCases(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getReports()
      .then((data) => {
        if (active) {
          setReports(data)
          setReportsError('')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setReportsError(
            getApiErrorMessage(error, 'Report history could not be loaded.'),
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingReports(false)
        }
      })

    return () => {
      active = false
    }
  }, [reportsRefreshVersion])

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return reports

    return reports.filter(
      (report) =>
        report.report_number.toLowerCase().includes(query) ||
        String(report.case_id).includes(query),
    )
  }, [reports, search])

  const selectedCase = cases.find(
    (caseItem) => String(caseItem.id) === selectedCaseId,
  )

  async function handleGenerateReport() {
    if (!selectedCaseId || isGenerating) return

    setGenerateError('')
    setGeneratedReport(null)
    setIsGenerating(true)

    try {
      const report = await generateReport(Number(selectedCaseId))

      setGeneratedReport(report)
      setIsLoadingReports(true)
      setReportsRefreshVersion((version) => version + 1)
    } catch (error) {
      setGenerateError(
        getApiErrorMessage(
          error,
          'The investigation report could not be generated.',
        ),
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function refreshReports() {
    if (isLoadingReports) return

    setReportsError('')
    setIsLoadingReports(true)
    setReportsRefreshVersion((version) => version + 1)
  }

  async function handleDownload(report: Report) {
    if (downloadingReportId !== null) return

    setDownloadError('')
    setDownloadingReportId(report.id)

    try {
      await downloadReport(report.id, report.report_number)
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(
          error,
          'The PDF download could not be completed. Please try again.',
          'download',
        ),
      )
    } finally {
      setDownloadingReportId(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 theme-text">
      {/* Page Header */}
      <header>
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-purple-500 dark:text-purple-400">
          <FileText size={14} aria-hidden="true" />
          Case documentation
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Investigation Reports
        </h1>

        <p className="mt-1.5 max-w-3xl text-sm leading-6 theme-text-secondary">
          Generate and download case reports containing case details, evidence
          information, integrity verification, and saved AI findings.
        </p>
      </header>

      {/* Generate Report Section */}
      <section className="theme-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 dark:text-purple-400">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>

          <div>
            <h2 className="text-sm font-semibold theme-text">
              Generate a case report
            </h2>

            <p className="mt-1 text-xs leading-5 theme-text-secondary">
              Choose a case to generate a PDF from the information currently
              stored for that case.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label
              htmlFor="report-case"
              className="mb-2 block text-xs font-medium theme-text-secondary"
            >
              Case
            </label>

            <select
              id="report-case"
              value={selectedCaseId}
              onChange={(event) => {
                setSelectedCaseId(event.target.value)
                setGeneratedReport(null)
                setGenerateError('')
              }}
              disabled={isLoadingCases || cases.length === 0}
              className="theme-input min-h-11 w-full rounded-xl px-3.5 text-sm outline-none transition focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 disabled:opacity-60"
            >
              <option value="">
                {isLoadingCases
                  ? 'Loading cases…'
                  : cases.length > 0
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
                Selected: {selectedCase.case_number} — {selectedCase.title}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={!selectedCaseId || isGenerating}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-medium text-white transition hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <FileCheck2 size={16} aria-hidden="true" />
            )}

            {isGenerating ? 'Generating PDF…' : 'Generate PDF Report'}
          </button>
        </div>

        {casesError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-500 dark:text-red-200"
          >
            <AlertCircle
              size={15}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p>{casesError}</p>
          </div>
        )}

        {!isLoadingCases && !casesError && cases.length === 0 && (
          <p className="mt-4 text-xs theme-text-muted">
            Create or access a case before generating a report.
          </p>
        )}

        {generateError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-500 dark:text-red-200"
          >
            <AlertCircle
              size={15}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p>{generateError}</p>
          </div>
        )}

        {generatedReport && (
          <div className="mt-4">
            <GeneratedReportNotice report={generatedReport} />
          </div>
        )}
      </section>

      {/* Report History Section */}
      <section className="theme-card overflow-hidden">
        <div className="theme-divider border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold theme-text">
                Report history
              </h2>

              <p className="mt-1 text-xs theme-text-secondary">
                {reports.length.toLocaleString()} report
                {reports.length === 1 ? '' : 's'} available
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search reports</span>

                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 theme-text-muted"
                  aria-hidden="true"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search report number or case ID"
                  className="theme-input min-h-10 w-full rounded-xl pl-9 pr-3 text-xs outline-none transition placeholder:text-[var(--text-muted)] focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10"
                />
              </label>

              <button
                type="button"
                onClick={refreshReports}
                disabled={isLoadingReports}
                className="theme-button theme-hover inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={isLoadingReports ? 'animate-spin' : ''}
                  aria-hidden="true"
                />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {downloadError && (
          <div
            role="alert"
            className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-500 dark:text-red-200 sm:mx-5"
          >
            <AlertCircle
              size={15}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p>{downloadError}</p>
          </div>
        )}

        {reportsError ? (
          <div className="m-4 flex flex-col items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 sm:flex-row sm:items-center sm:mx-5">
            <AlertCircle size={17} className="shrink-0 text-red-500" aria-hidden="true" />

            <p
              role="alert"
              className="flex-1 text-sm text-red-500 dark:text-red-200"
            >
              {reportsError}
            </p>

            <button
              type="button"
              onClick={refreshReports}
              className="rounded-lg border border-red-500/20 px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-500/10 dark:text-red-200"
            >
              Try again
            </button>
          </div>
        ) : isLoadingReports ? (
          <div
            className="space-y-3 p-4 sm:p-5"
            aria-label="Loading report history"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="theme-card-secondary h-16 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl theme-card-secondary theme-text-muted">
              <FileText size={20} aria-hidden="true" />
            </span>

            <p className="mt-3 text-sm font-medium theme-text">
              No reports generated yet
            </p>

            <p className="mt-1 max-w-sm text-xs leading-5 theme-text-secondary">
              Generate a PDF report for one of your cases to see it in this
              history.
            </p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium theme-text">
              No reports match your search
            </p>

            <p className="mt-1 text-xs theme-text-secondary">
              Search by report number or case ID.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="theme-table w-full min-w-[760px] text-left text-xs">
                <thead className="theme-table-header border-b text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Report number</th>
                    <th className="px-5 py-3 font-semibold">Case ID</th>
                    <th className="px-5 py-3 font-semibold">Investigator ID</th>
                    <th className="px-5 py-3 font-semibold">Generated</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-color)]">
                  {visibleReports.map((report) => (
                    <tr
                      key={report.id}
                      className="transition hover:bg-[var(--bg-card-hover)]"
                    >
                      <td className="px-5 py-4 font-medium theme-text">
                        {report.report_number}
                      </td>

                      <td className="px-5 py-4 theme-text-secondary">
                        {report.case_id}
                      </td>

                      <td className="px-5 py-4 theme-text-secondary">
                        {report.investigator_id}
                      </td>

                      <td className="px-5 py-4 theme-text-muted">
                        {formatDate(report.created_at)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDownload(report)}
                          disabled={downloadingReportId !== null}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/[0.08] px-3 text-xs font-medium text-purple-500 transition hover:border-purple-500/35 hover:bg-purple-500/[0.14] disabled:cursor-not-allowed disabled:opacity-50 dark:text-purple-300"
                        >
                          {downloadingReportId === report.id ? (
                            <LoaderCircle
                              size={14}
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Download size={14} aria-hidden="true" />
                          )}

                          {downloadingReportId === report.id
                            ? 'Downloading…'
                            : 'Download PDF'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 p-4 md:hidden">
              {visibleReports.map((report) => (
                <article
                  key={report.id}
                  className="theme-card-secondary rounded-xl p-4"
                >
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                        Report number
                      </p>

                      <p className="mt-1 break-all font-medium theme-text">
                        {report.report_number}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                        Case ID
                      </p>

                      <p className="mt-1 theme-text-secondary">
                        {report.case_id}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                        Investigator ID
                      </p>

                      <p className="mt-1 theme-text-secondary">
                        {report.investigator_id}
                      </p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide theme-text-muted">
                        Generated
                      </p>

                      <p className="mt-1 theme-text-muted">
                        {formatDate(report.created_at)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownload(report)}
                    disabled={downloadingReportId !== null}
                    className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/[0.08] px-3 text-xs font-medium text-purple-500 transition hover:border-purple-500/35 hover:bg-purple-500/[0.14] disabled:cursor-not-allowed disabled:opacity-50 dark:text-purple-300"
                  >
                    {downloadingReportId === report.id ? (
                      <LoaderCircle
                        size={14}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Download size={14} aria-hidden="true" />
                    )}

                    {downloadingReportId === report.id
                      ? 'Downloading…'
                      : 'Download PDF'}
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
