
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzePhishingUrl,
  type PhishingUrlAnalysisResponse,
} from '../../services/aiAnalysisService'

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    const data: unknown = error.response.data
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const { detail } = data
      if (typeof detail === 'string') return detail
      if (typeof detail === 'object' && detail !== null && 'message' in detail) {
        const { message } = detail
        if (typeof message === 'string') return message
      }
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

function getSeverityStyle(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'HIGH':
      return 'border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300'
    case 'MEDIUM':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    default:
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  }
}

function getPredictionStyle(prediction: string): string {
  return prediction === 'Phishing URL'
    ? 'border-red-400/30 bg-red-500/[0.07] text-red-700 dark:text-red-300'
    : 'border-emerald-400/30 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300'
}

export default function PhishingURL() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<PhishingUrlAnalysisResponse | null>(null)
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const submissionLock = useRef(false)

  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (!active) return
        setCases(data)
        setCaseId(data[0] ? String(data[0].id) : '')
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)
    const normalizedUrl = url.trim()

    if (!caseId) {
      setAnalysisError('Select a case before analyzing a URL.')
      return
    }
    if (!normalizedUrl) {
      setAnalysisError('Enter a URL to analyze.')
      return
    }
    if (normalizedUrl.length > 2048) {
      setAnalysisError('The URL cannot exceed 2,048 characters.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)
    try {
      const analysis = await analyzePhishingUrl(Number(caseId), normalizedUrl)
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(error, 'The URL could not be analyzed. Try again.'),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function resetAnalysis() {
    setUrl('')
    setResult(null)
    setAnalysisError('')
  }

  function retryCases() {
    setIsLoadingCases(true)
    setCasesError('')
    getCases()
      .then((data) => {
        setCases(data)
        setCaseId((current) =>
          data.some((caseItem) => String(caseItem.id) === current)
            ? current
            : data[0]
              ? String(data[0].id)
              : '',
        )
      })
      .catch((error: unknown) => {
        setCasesError(
          getApiErrorMessage(error, 'Your cases could not be loaded.'),
        )
      })
      .finally(() => setIsLoadingCases(false))
  }

  const selectedCase = cases.find((caseItem) => String(caseItem.id) === caseId)

  return (
    <section className="mx-auto max-w-5xl space-y-6 theme-text">
      {/* Page header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600 dark:text-purple-400">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Phishing URL Detection
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm theme-text-secondary">
          Submit a URL for model-based phishing risk analysis and attach the
          result to an investigation case.
        </p>
      </header>

      {/* Case loading error */}
      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-400/30 bg-red-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={17} aria-hidden="true" />
            {casesError}
          </p>

          <button
            type="button"
            onClick={retryCases}
            className="self-start rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-500/10 dark:text-red-300 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        {/* URL analysis form */}
        <form
          onSubmit={handleSubmit}
          className="theme-card rounded-2xl p-5 sm:p-7"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ScanSearch size={21} aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-base font-semibold theme-text">
                Analyze a URL
              </h2>

              <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
                Analysis is performed by the CyberFusion phishing URL model.
              </p>
            </div>
          </div>

          {/* Analysis error */}
          {analysisError && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              <AlertCircle
                size={17}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>{analysisError}</span>
            </p>
          )}

          <div className="mt-6 space-y-5">
            {/* Case selection */}
            <div className="space-y-2">
              <label
                htmlFor="phishing-case"
                className="block text-sm font-medium theme-text"
              >
                Investigation case
              </label>

              <select
                id="phishing-case"
                value={caseId}
                onChange={(event) => {
                  setCaseId(event.target.value)
                  setResult(null)
                  setAnalysisError('')
                }}
                disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
                required
                className="theme-input theme-hover w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
              >
                {cases.length === 0 && (
                  <option value="">
                    {isLoadingCases ? 'Loading cases…' : 'No cases available'}
                  </option>
                )}

                {cases.map((caseItem) => (
                  <option key={caseItem.id} value={caseItem.id}>
                    {caseItem.case_number} — {caseItem.title}
                  </option>
                ))}
              </select>

              {selectedCase && (
                <p className="text-xs theme-text-muted">
                  The analysis finding will be saved to this case.
                </p>
              )}
            </div>

            {/* URL input */}
            <div className="space-y-2">
              <label
                htmlFor="phishing-url"
                className="block text-sm font-medium theme-text"
              >
                URL to analyze
              </label>

              <div className="relative">
                <ExternalLink
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 theme-text-muted"
                  aria-hidden="true"
                />

                <input
                  id="phishing-url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    if (result) setResult(null)
                  }}
                  maxLength={2048}
                  required
                  disabled={isAnalyzing}
                  placeholder="https://example.com"
                  className="theme-input w-full rounded-xl py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-600 hover:border-[var(--border-color)] focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
                />
              </div>

              <p className="text-right text-[11px] theme-text-muted">
                {url.length}/2048
              </p>
            </div>

            {/* Form actions */}
            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              {result && (
                <button
                  type="button"
                  onClick={resetAnalysis}
                  disabled={isAnalyzing}
                  className="theme-button theme-hover inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition disabled:opacity-50 sm:py-2.5"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Reset analysis
                </button>
              )}

              <button
                type="submit"
                disabled={isAnalyzing || isLoadingCases || !caseId || !url.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
              >
                {isAnalyzing ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ScanSearch size={16} aria-hidden="true" />
                )}

                {isAnalyzing ? 'Analyzing…' : 'Analyze URL'}
              </button>
            </div>
          </div>
        </form>

        {/* Information panels */}
        <aside className="space-y-4">
          <div className="theme-card-secondary rounded-2xl border border-purple-400/20 bg-purple-500/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-purple-600 dark:text-purple-400"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                  Model-based assessment
                </h2>

                <p className="mt-2 text-xs leading-relaxed theme-text-secondary">
                  The URL is not opened or independently verified. This model
                  prediction is not a guarantee of safety or maliciousness;
                  even a “Legitimate URL” classification does not establish
                  that a site is safe.
                </p>
              </div>
            </div>
          </div>

          <div className="theme-card rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={17}
                className="text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold theme-text">
                Case-linked analysis
              </h2>
            </div>

            <p className="mt-2 text-xs leading-relaxed theme-text-secondary">
              This request uses the authenticated case-linked endpoint. Once
              analysis succeeds, the backend automatically saves a detection
              finding under the selected case.
            </p>
          </div>
        </aside>
      </div>

      {/* Analysis result */}
      {result && (
        <section
          aria-live="polite"
          className="theme-card overflow-hidden rounded-2xl"
        >
          {/* Result header */}
          <div className="flex flex-col gap-4 border-b theme-divider p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-purple-600 dark:text-purple-400">
                Analysis result
              </p>

              <h2 className="mt-1.5 text-lg font-semibold theme-text">
                {result.module}
              </h2>
            </div>

            <span
              className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
            >
              {result.severity} severity
            </span>
          </div>

          {/* Result details */}
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
            {/* Prediction card */}
            <div
              className={`rounded-xl border p-4 ${getPredictionStyle(result.prediction)}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                Prediction
              </p>

              <p className="mt-2 text-lg font-semibold">
                {result.prediction}
              </p>

              <p className="mt-1 text-xs opacity-70">
                Model class: {result.class}
              </p>
            </div>

            {/* Confidence card */}
            <div className="theme-elevated rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">
                Confidence
              </p>

              <p className="mt-2 text-lg font-semibold theme-text">
                {(result.confidence * 100).toFixed(2)}%
              </p>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-purple-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Analyzed URL */}
            <div className="theme-elevated rounded-xl p-4 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">
                Analyzed URL
              </p>

              <p className="mt-2 break-all font-mono text-sm theme-text">
                {url.trim()}
              </p>
            </div>

            {/* Finding saved confirmation */}
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.04] p-4 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Finding saved
                  </p>

                  <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {result.message}
                  </p>
                </div>

                <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 font-mono text-xs text-emerald-700 dark:text-emerald-300">
                  Finding #{result.finding_id}
                </span>
              </div>

              <p className="mt-2 text-xs theme-text-muted">
                Case #{result.case_id}
                {selectedCase ? ` · ${selectedCase.case_number}` : ''}
              </p>
            </div>
          </div>

          {/* Result disclaimer */}
          <div className="border-t theme-divider px-5 py-3 sm:px-7">
            <p className="text-xs leading-relaxed theme-text-muted">
              Treat this result as decision support only. A legitimate
              classification does not prove that the URL or destination site
              is safe.
            </p>
          </div>
        </section>
      )}
    </section>
  )
}
