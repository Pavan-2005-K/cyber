
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  LoaderCircle,
  MailSearch,
  MessageSquareText,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeChatEmail,
  type ChatEmailForensicsResponse,
} from '../../services/aiAnalysisService'

const MAX_TEXT_LENGTH = 10_000

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
          .map((item: unknown) => {
            if (typeof item !== 'object' || item === null) return null

            const message =
              'msg' in item && typeof item.msg === 'string' ? item.msg : null
            if (!message) return null

            const location =
              'loc' in item && Array.isArray(item.loc)
                ? item.loc.filter(
                    (part): part is string | number =>
                      typeof part === 'string' || typeof part === 'number',
                  )
                : []

            return location.length
              ? `${location.slice(1).join('.') || location.join('.')}: ${message}`
              : message
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
    case 'CRITICAL':
    case 'HIGH':
      return 'border-red-400/30 bg-red-400/10 text-red-500 dark:text-red-300'
    case 'MEDIUM':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-300'
    default:
      return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300'
  }
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

export default function ChatEmailForensics() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [text, setText] = useState('')
  const [result, setResult] = useState<ChatEmailForensicsResponse | null>(null)
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

    if (!caseId) {
      setAnalysisError('Select a case before analyzing conversation text.')
      return
    }

    if (!text.trim()) {
      setAnalysisError('Enter chat or email conversation text to analyze.')
      return
    }

    if (text.length > MAX_TEXT_LENGTH) {
      setAnalysisError('The conversation cannot exceed 10,000 characters.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeChatEmail(Number(caseId), text)
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The conversation could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function resetAnalysis() {
    setText('')
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
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b82e8] dark:text-[#b6a1f5]">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          Chat &amp; Email Forensics
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
          Analyze pasted conversation text for spam patterns and save the
          AI-assisted assessment to an investigation case.
        </p>
      </header>

      {/* Case loading error */}
      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-red-500 dark:text-red-300">
            <AlertCircle size={17} aria-hidden="true" />
            {casesError}
          </p>

          <button
            type="button"
            onClick={retryCases}
            className="self-start rounded-lg border border-red-400/20 px-3 py-2 text-xs font-medium text-red-500 dark:text-red-200 transition hover:bg-red-400/10 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {/* Analysis error */}
      {analysisError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-500 dark:text-red-300"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{analysisError}</span>
        </p>
      )}

      {/* Main Layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="theme-card p-5 sm:p-7"
        >
          {/* Form Header */}
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/10 text-[#9b82e8] dark:text-[#b6a1f5]">
              <MessageSquareText size={21} aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Conversation text
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                Paste the chat or email message content for model assessment.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {/* Case Selector */}
            <div className="space-y-2">
              <label
                htmlFor="chat-email-case"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Investigation case
              </label>

              <select
                id="chat-email-case"
                value={caseId}
                onChange={(event) => {
                  setCaseId(event.target.value)
                  setResult(null)
                  setAnalysisError('')
                }}
                disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
                required
                className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition hover:border-[var(--accent)] focus:border-[#9b82e8] focus:ring-4 focus:ring-[#9b82e8]/10 disabled:opacity-60"
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
                <p className="text-xs text-[var(--text-muted)]">
                  A successful analysis is saved to this case automatically.
                </p>
              )}
            </div>

            {/* Conversation Text */}
            <div className="space-y-2">
              <label
                htmlFor="chat-email-text"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Chat or email text
              </label>

              <textarea
                id="chat-email-text"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setResult(null)
                  setAnalysisError('')
                }}
                maxLength={MAX_TEXT_LENGTH}
                minLength={1}
                required
                rows={11}
                disabled={isAnalyzing}
                placeholder="Paste or type the conversation content to analyze…"
                className="theme-input w-full resize-y rounded-xl px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-[var(--text-muted)] hover:border-[var(--accent)] focus:border-[#9b82e8] focus:ring-4 focus:ring-[#9b82e8]/10 disabled:opacity-60"
              />

              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
                <span>Whitespace-only input cannot be analyzed.</span>

                <span className="shrink-0">
                  {text.length.toLocaleString()} / 10,000
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border-color)] pt-5 sm:flex-row sm:justify-end">
            {(result || text) && (
              <button
                type="button"
                onClick={resetAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 sm:py-2.5"
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset
              </button>
            )}

            <button
              type="submit"
              disabled={
                isAnalyzing ||
                isLoadingCases ||
                !caseId ||
                !text.trim() ||
                text.length > MAX_TEXT_LENGTH
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#9b82e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8b72d9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#9b82e8]/30 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2.5"
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

              {isAnalyzing ? 'Analyzing conversation…' : 'Analyze conversation'}
            </button>
          </div>
        </form>

        {/* Information Panels */}
        <aside className="space-y-4">
          {/* AI Assessment */}
          <div className="rounded-2xl border border-[#9b82e8]/20 bg-[#9b82e8]/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-[#9b82e8] dark:text-[#b6a1f5]"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  AI-assisted assessment
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  The model result is not definitive proof that content is spam,
                  fraudulent, or harmless. Use it as decision support and
                  investigate the context independently.
                </p>
              </div>
            </div>
          </div>

          {/* Text Analysis */}
          <div className="theme-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <MailSearch
                size={17}
                className="text-[#9b82e8] dark:text-[#b6a1f5]"
                aria-hidden="true"
              />

              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Text-only analysis
              </h2>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              This endpoint receives conversation text only. It does not inspect
              sender headers, attachments, or .eml metadata; no file upload is
              performed.
            </p>
          </div>

          {/* Saved Finding */}
          <div className="theme-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <BadgeCheck
                size={17}
                className="text-emerald-500 dark:text-[#39b99b]"
                aria-hidden="true"
              />

              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Automatically saved finding
              </h2>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Successful case-linked analysis is automatically saved to the
              selected case and returns a finding ID.
            </p>
          </div>
        </aside>
      </div>

      {/* Analysis Result */}
      {result && (
        <section
          aria-live="polite"
          className="theme-card overflow-hidden"
        >
          {/* Result Header */}
          <div className="flex flex-col gap-4 border-b border-[var(--border-color)] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9b82e8] dark:text-[#b6a1f5]">
                Analysis result
              </p>

              <h2 className="mt-1.5 text-lg font-semibold text-[var(--text-primary)]">
                {result.module}
              </h2>
            </div>

            <span
              className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
            >
              {result.severity} severity
            </span>
          </div>

          {/* Result Metrics */}
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
            {/* Prediction */}
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Prediction
              </p>

              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {result.prediction}
              </p>

              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Classification: {result.class}
              </p>
            </div>

            {/* Confidence */}
            <div className="theme-card-secondary rounded-xl p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Confidence
                </p>

                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {formatProbability(result.confidence)}
                </p>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[#9b82e8]"
                  style={{
                    width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Spam Probability */}
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Spam probability
              </p>

              <p className="mt-2 text-lg font-semibold text-red-500 dark:text-red-300">
                {formatProbability(result.spam_probability)}
              </p>
            </div>

            {/* Ham Probability */}
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Ham probability
              </p>

              <p className="mt-2 text-lg font-semibold text-emerald-600 dark:text-[#39b99b]">
                {formatProbability(result.ham_probability)}
              </p>
            </div>

            {/* Model Information */}
            <div className="theme-card-secondary rounded-xl p-4 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Model
              </p>

              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {result.model}
              </p>
            </div>

            {/* Finding Confirmation */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 sm:col-span-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600/80 dark:text-[#39b99b]/70">
                  Finding saved to case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
                </p>

                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-[#b6e8d6]">
                  {result.message}
                </p>
              </div>

              <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 font-mono text-xs text-emerald-700 dark:text-[#b6e8d6]">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>
        </section>
      )}
    </section>
  )
}
