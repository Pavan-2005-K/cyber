
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  LoaderCircle,
  MessageSquareWarning,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  FileText,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeScamMessage,
  analyzeScamMessageEvidence,
  type ScamMessageResponse,
} from '../../services/aiAnalysisService'
import {
  getEvidenceByCase,
  type Evidence,
} from '../../services/evidenceService'

const MAX_TEXT_LENGTH = 10_000
const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024

type AnalysisMode = 'manual' | 'evidence'

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    const status = error.response.status
    const data: unknown = error.response.data

    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const detail = data.detail

      if (typeof detail === 'string' && detail.trim()) {
        return detail
      }

      if (Array.isArray(detail)) {
        const messages = detail
          .map((item: unknown) => {
            if (typeof item !== 'object' || item === null) return null

            const message =
              'msg' in item && typeof item.msg === 'string'
                ? item.msg
                : null

            if (!message) return null

            const location =
              'loc' in item && Array.isArray(item.loc)
                ? item.loc.filter(
                    (part): part is string | number =>
                      typeof part === 'string' ||
                      typeof part === 'number',
                  )
                : []

            return location.length > 1
              ? `${location.slice(1).join('.')}: ${message}`
              : message
          })
          .filter((message): message is string => message !== null)

        if (messages.length) return messages.join(' ')
      }
    }

    if (status === 401)
      return 'Your session may have expired. Please sign in again.'

    if (status === 403)
      return 'You do not have permission to access this case.'

    if (status === 404)
      return 'The requested endpoint, case, or evidence could not be found.'

    if (status === 413)
      return 'The submitted content or evidence file is too large.'

    if (status >= 500)
      return 'The CyberFusion server encountered an error. Please try again later.'

    return fallback
  }

  return fallback
}

function getSeverityStyle(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300'

    case 'MEDIUM':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300'

    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function ScamDetection() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [text, setText] = useState('')
  const [result, setResult] = useState<ScamMessageResponse | null>(null)

  const [mode, setMode] = useState<AnalysisMode>('manual')

  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [evidenceId, setEvidenceId] = useState('')
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')

  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')

  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const submissionLock = useRef(false)

  // Load investigation cases
  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (!active) return

        setCases(data)
        setCaseId(data.length > 0 ? String(data[0].id) : '')
        setCasesError('')
      })
      .catch((error: unknown) => {
        if (!active) return

        setCasesError(
          getApiErrorMessage(error, 'Your cases could not be loaded.'),
        )
      })
      .finally(() => {
        if (active) setIsLoadingCases(false)
      })

    return () => {
      active = false
    }
  }, [])

  // Load existing TXT evidence whenever the selected case changes
  useEffect(() => {
    if (!caseId) {
      setEvidence([])
      setEvidenceId('')
      setEvidenceError('')
      setIsLoadingEvidence(false)
      return
    }

    let active = true

    setEvidence([])
    setEvidenceId('')
    setEvidenceError('')
    setIsLoadingEvidence(true)

    getEvidenceByCase(Number(caseId))
      .then((data) => {
        if (!active) return

        const textEvidence = data.filter((item) =>
          item.original_filename.toLowerCase().endsWith('.txt'),
        )

        setEvidence(textEvidence)
        setEvidenceId(
          textEvidence.length > 0 ? String(textEvidence[0].id) : '',
        )
      })
      .catch((error: unknown) => {
        if (!active) return

        setEvidenceError(
          getApiErrorMessage(
            error,
            'Existing case evidence could not be loaded.',
          ),
        )
      })
      .finally(() => {
        if (active) setIsLoadingEvidence(false)
      })

    return () => {
      active = false
    }
  }, [caseId])

  // Manual message analysis
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select an investigation case before analyzing.')
      return
    }

    if (!text.trim()) {
      setAnalysisError('Enter a message to analyze.')
      return
    }

    if (text.length > MAX_TEXT_LENGTH) {
      setAnalysisError(
        `The message cannot exceed ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
      )
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeScamMessage(Number(caseId), text)
      setResult(analysis)
    } catch (error: unknown) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The message could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // Analyze selected existing TXT evidence
  async function handleEvidenceAnalysis() {
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select an investigation case before analyzing.')
      return
    }

    if (!evidenceId) {
      setAnalysisError('Select a TXT evidence file to analyze.')
      return
    }

    const selectedEvidence = evidence.find(
      (item) => String(item.id) === evidenceId,
    )

    if (!selectedEvidence) {
      setAnalysisError(
        'The selected evidence is no longer available. Refresh the evidence list.',
      )
      return
    }

    if (selectedEvidence.file_size > MAX_EVIDENCE_SIZE) {
      setAnalysisError('TXT evidence cannot exceed 10 MB.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeScamMessageEvidence(
        Number(caseId),
        Number(evidenceId),
      )

      setResult(analysis)
    } catch (error: unknown) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The evidence could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // Reset current analysis
  function resetAnalysis() {
    if (isAnalyzing) return

    setText('')
    setResult(null)
    setAnalysisError('')
    setEvidenceError('')
  }

  // Retry case loading
  async function retryCases() {
    if (isLoadingCases) return

    setIsLoadingCases(true)
    setCasesError('')

    try {
      const data = await getCases()
      setCases(data)

      setCaseId((current) =>
        data.some((caseItem) => String(caseItem.id) === current)
          ? current
          : data.length > 0
            ? String(data[0].id)
            : '',
      )
    } catch (error: unknown) {
      setCasesError(
        getApiErrorMessage(error, 'Your cases could not be loaded.'),
      )
    } finally {
      setIsLoadingCases(false)
    }
  }

  // Retry existing evidence loading
  async function retryEvidence() {
    if (!caseId || isLoadingEvidence) return

    setIsLoadingEvidence(true)
    setEvidenceError('')
    setEvidence([])
    setEvidenceId('')

    try {
      const data = await getEvidenceByCase(Number(caseId))

      const textEvidence = data.filter((item) =>
        item.original_filename.toLowerCase().endsWith('.txt'),
      )

      setEvidence(textEvidence)
      setEvidenceId(
        textEvidence.length > 0 ? String(textEvidence[0].id) : '',
      )
    } catch (error: unknown) {
      setEvidenceError(
        getApiErrorMessage(
          error,
          'Existing case evidence could not be loaded.',
        ),
      )
    } finally {
      setIsLoadingEvidence(false)
    }
  }

  const selectedCase = cases.find(
    (caseItem) => String(caseItem.id) === caseId,
  )

  const selectedEvidence = evidence.find(
    (item) => String(item.id) === evidenceId,
  )

  return (
    <section className="mx-auto max-w-5xl space-y-6 theme-text">
      {/* Page Header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600 dark:text-purple-400">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Scam &amp; Spam Message Detection
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm theme-text-secondary">
          Analyze message text or existing case evidence for scam and spam
          patterns and save the assessment to an investigation case.
        </p>
      </header>

      {/* Case Loading Error */}
      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-400/20 dark:bg-red-400/[0.07] sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={17} aria-hidden="true" />
            {casesError}
          </p>

          <button
            type="button"
            onClick={retryCases}
            disabled={isLoadingCases}
            className="self-start rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-300/20 dark:text-red-200 dark:hover:bg-red-400/10 sm:self-auto"
          >
            {isLoadingCases ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Analysis Error */}
      {analysisError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300"
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
        {/* Analysis Panel */}
        <div className="theme-card p-5 sm:p-7">
          {/* Case Selector */}
          <div className="space-y-2">
            <label
              htmlFor="scam-case"
              className="block text-sm font-medium theme-text"
            >
              Investigation case
            </label>

            <select
              id="scam-case"
              value={caseId}
              onChange={(event) => {
                setCaseId(event.target.value)
                setResult(null)
                setAnalysisError('')
                setText('')
              }}
              disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
              required
              className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition hover:opacity-90 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
            >
              {cases.length === 0 && (
                <option value="">
                  {isLoadingCases ? 'Loading cases…' : 'No cases available'}
                </option>
              )}

              {cases.map((caseItem) => (
                <option key={caseItem.id} value={String(caseItem.id)}>
                  {caseItem.case_number} — {caseItem.title}
                </option>
              ))}
            </select>

            {selectedCase && (
              <p className="text-xs theme-text-muted">
                Successful analysis is saved to this case automatically.
              </p>
            )}

            {!isLoadingCases && cases.length === 0 && !casesError && (
              <p className="text-xs theme-text-muted">
                Create an investigation case first to save analysis findings.
              </p>
            )}
          </div>

          {/* Analysis Mode Selector */}
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl theme-card-secondary p-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('manual')
                setResult(null)
                setAnalysisError('')
              }}
              disabled={isAnalyzing}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                mode === 'manual'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'theme-text-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
              } disabled:opacity-50`}
            >
              <MessageSquareWarning size={16} aria-hidden="true" />
              Manual Analysis
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('evidence')
                setResult(null)
                setAnalysisError('')
              }}
              disabled={isAnalyzing}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                mode === 'evidence'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'theme-text-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
              } disabled:opacity-50`}
            >
              <FileText size={16} aria-hidden="true" />
              Existing Evidence
            </button>
          </div>

          {/* Manual Analysis Form */}
          {mode === 'manual' && (
            <form onSubmit={handleSubmit} className="mt-6">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-400/20 dark:bg-purple-500/[0.08] dark:text-purple-300">
                  <MessageSquareWarning size={21} aria-hidden="true" />
                </span>

                <div>
                  <h2 className="text-base font-semibold theme-text">
                    Manual message analysis
                  </h2>

                  <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
                    Paste the message content you want the model to assess.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <label
                  htmlFor="scam-message"
                  className="block text-sm font-medium theme-text"
                >
                  Message text
                </label>

                <textarea
                  id="scam-message"
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
                  placeholder="Paste or type the message to analyze…"
                  className="theme-input w-full resize-y rounded-xl px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:opacity-50 hover:opacity-90 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
                />

                <div className="flex items-center justify-between gap-3 text-[11px] theme-text-muted">
                  <span>Whitespace-only messages cannot be analyzed.</span>

                  <span className="shrink-0">
                    {text.length.toLocaleString()} /{' '}
                    {MAX_TEXT_LENGTH.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Manual Actions */}
              <div className="mt-5 flex flex-col-reverse gap-3 theme-divider border-t pt-5 sm:flex-row sm:justify-end">
                {(result || text) && (
                  <button
                    type="button"
                    onClick={resetAnalysis}
                    disabled={isAnalyzing}
                    className="theme-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition theme-hover disabled:opacity-50 sm:py-2.5"
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

                  {isAnalyzing ? 'Analyzing message…' : 'Analyze message'}
                </button>
              </div>
            </form>
          )}

          {/* Existing Evidence Analysis */}
          {mode === 'evidence' && (
            <div className="mt-6">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-400/20 dark:bg-purple-500/[0.08] dark:text-purple-300">
                  <FileText size={21} aria-hidden="true" />
                </span>

                <div>
                  <h2 className="text-base font-semibold theme-text">
                    Analyze existing TXT evidence
                  </h2>

                  <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
                    Analyze a text file already attached to the selected
                    investigation case.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {/* Evidence Loading */}
                {isLoadingEvidence && (
                  <p className="flex items-center gap-2 text-sm theme-text-secondary">
                    <LoaderCircle
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    Loading case evidence…
                  </p>
                )}

                {/* Evidence Fetch Error */}
                {evidenceError && (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-400/20 dark:bg-red-400/10 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                      <AlertCircle
                        size={15}
                        className="mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                      {evidenceError}
                    </p>

                    <button
                      type="button"
                      onClick={retryEvidence}
                      disabled={isLoadingEvidence}
                      className="self-start rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-300/20 dark:text-red-200 sm:self-auto"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Evidence Selector */}
                {!isLoadingEvidence && !evidenceError && (
                  <div className="space-y-2">
                    <label
                      htmlFor="scam-evidence"
                      className="block text-sm font-medium theme-text"
                    >
                      Select TXT evidence
                    </label>

                    <select
                      id="scam-evidence"
                      value={evidenceId}
                      onChange={(event) => {
                        setEvidenceId(event.target.value)
                        setResult(null)
                        setAnalysisError('')
                      }}
                      disabled={evidence.length === 0 || isAnalyzing}
                      className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
                    >
                      {evidence.length === 0 ? (
                        <option value="">
                          No TXT evidence found in this case
                        </option>
                      ) : (
                        evidence.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.original_filename} (
                            {formatFileSize(item.file_size)})
                          </option>
                        ))
                      )}
                    </select>

                    {evidence.length === 0 && (
                      <p className="text-xs theme-text-muted">
                        Upload a TXT file to this investigation case first.
                      </p>
                    )}
                  </div>
                )}

                {/* Selected Evidence Info */}
                {selectedEvidence && !isLoadingEvidence && (
                  <div className="theme-card-secondary rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <FileText
                        size={18}
                        className="mt-0.5 shrink-0 text-purple-500"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium theme-text">
                          {selectedEvidence.original_filename}
                        </p>

                        <p className="mt-1 text-xs theme-text-secondary">
                          {formatFileSize(selectedEvidence.file_size)}
                        </p>

                        {selectedEvidence.file_size > MAX_EVIDENCE_SIZE && (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-300">
                            This file exceeds the 10 MB analysis limit.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Evidence Actions */}
                <div className="flex flex-col-reverse gap-3 theme-divider border-t pt-5 sm:flex-row sm:justify-end">
                  {(result || evidenceId) && (
                    <button
                      type="button"
                      onClick={resetAnalysis}
                      disabled={isAnalyzing}
                      className="theme-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition theme-hover disabled:opacity-50 sm:py-2.5"
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      Reset
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleEvidenceAnalysis}
                    disabled={
                      isAnalyzing ||
                      isLoadingCases ||
                      isLoadingEvidence ||
                      !caseId ||
                      !evidenceId ||
                      !!evidenceError ||
                      (selectedEvidence?.file_size ?? 0) > MAX_EVIDENCE_SIZE
                    }
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

                    {isAnalyzing ? 'Analyzing evidence…' : 'Analyze Evidence'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Information Sidebar */}
        <aside className="space-y-4">
          {/* AI Assessment Info */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 dark:border-purple-400/[0.15] dark:bg-purple-500/[0.045] sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-purple-600 dark:text-purple-300"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-purple-800 dark:text-purple-100">
                  AI-assisted assessment
                </h2>

                <p className="mt-2 text-xs leading-relaxed theme-text-secondary">
                  This model-based result is not definitive proof that a message
                  is fraudulent, spam, or harmless. Consider it decision
                  support and investigate the context independently.
                </p>
              </div>
            </div>
          </div>

          {/* Saving Info */}
          <div className="theme-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <BadgeCheck
                size={17}
                className="text-emerald-600 dark:text-emerald-300"
                aria-hidden="true"
              />

              <h2 className="text-sm font-semibold theme-text">
                Automatically saved finding
              </h2>
            </div>

            <p className="mt-2 text-xs leading-relaxed theme-text-secondary">
              Successful analysis saves a finding to the selected investigation
              case and returns its finding ID.
            </p>
          </div>
        </aside>
      </div>

      {/* Analysis Result */}
      {result && (
        <section aria-live="polite" className="theme-card overflow-hidden">
          {/* Result Header */}
          <div className="flex flex-col gap-4 theme-divider border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
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

          {/* Result Details */}
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
            {/* Prediction */}
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">
                Prediction
              </p>

              <p className="mt-2 text-lg font-semibold theme-text">
                {result.prediction}
              </p>

              <p className="mt-1 text-xs theme-text-secondary">
                Classification: {result.class}
              </p>
            </div>

            {/* Confidence */}
            <div className="theme-card-secondary rounded-xl p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">
                  Confidence
                </p>

                <p className="text-sm font-semibold theme-text">
                  {(result.confidence * 100).toFixed(2)}%
                </p>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Saved Finding */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/[0.15] dark:bg-emerald-400/[0.035] sm:col-span-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300/70">
                  Finding saved to case
                </p>

                <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  {result.message}
                </p>

                <p className="mt-1 text-xs theme-text-muted">
                  Case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
                </p>
              </div>

              <span className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 font-mono text-xs text-emerald-800 dark:border-emerald-300/[0.15] dark:bg-black/10 dark:text-emerald-200">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>

          {/* Result Disclaimer */}
          <div className="theme-divider border-t px-5 py-3 sm:px-7">
            <p className="text-xs leading-relaxed theme-text-muted">
              This is an AI-assisted assessment, not definitive proof that the
              message is fraudulent or harmless.
            </p>
          </div>
        </section>
      )}
    </section>
  )
}
