
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  FileArchive,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  Smartphone,
  Upload,
  X,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeApk,
  type ApkAnalysisResponse,
} from '../../services/aiAnalysisService'

const MAX_FILE_SIZE = 100 * 1024 * 1024

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

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

export default function ApkAnalysis() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ApkAnalysisResponse | null>(null)
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [fileError, setFileError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
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

  function validateFile(candidate: File): string | null {
    if (!candidate.name.toLowerCase().endsWith('.apk')) {
      return 'Unsupported file type. Choose an .apk file.'
    }

    if (candidate.size === 0) return 'The selected APK is empty.'

    if (candidate.size > MAX_FILE_SIZE) {
      return 'The APK file cannot exceed 100 MB.'
    }

    return null
  }

  function selectFile(candidate: File | undefined) {
    setAnalysisError('')
    setResult(null)

    if (!candidate) return

    const validationError = validateFile(candidate)

    if (validationError) {
      setFile(null)
      setFileError(validationError)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFileError('')
    setFile(candidate)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    if (isAnalyzing) return

    selectFile(event.dataTransfer.files[0])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select a case before analyzing an APK.')
      return
    }

    if (!file) {
      setFileError('Choose an APK file to analyze.')
      return
    }

    const validationError = validateFile(file)

    if (validationError) {
      setFileError(validationError)
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeApk(Number(caseId), file)
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The APK could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function removeFile() {
    setFile(null)
    setFileError('')
    setAnalysisError('')
    setResult(null)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function resetAnalysis() {
    removeFile()
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
    <section className="mx-auto max-w-6xl space-y-6">
      {/* Page Header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b82e8] dark:text-[#b6a1f5]">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          APK Malware Static Analysis
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
          Submit an Android package for static feature analysis and associate the
          model assessment with an investigation case.
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

      {/* File validation error */}
      {fileError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-600 dark:text-amber-200"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{fileError}</span>
        </p>
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        {/* APK Upload Form */}
        <form
          onSubmit={handleSubmit}
          className="theme-card p-5 sm:p-7"
        >
          {/* Form Header */}
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/10 text-[#9b82e8] dark:text-[#b6a1f5]">
              <Smartphone size={21} aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                APK file analysis
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                Static analysis extracts package features; the APK is not installed
                or executed by this page.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {/* Case Selector */}
            <div className="space-y-2">
              <label
                htmlFor="apk-analysis-case"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Investigation case
              </label>

              <select
                id="apk-analysis-case"
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

            {/* APK File Upload */}
            <div className="space-y-2">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Android package (.apk)
              </span>

              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!isAnalyzing) setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) {
                    setIsDragging(false)
                  }
                }}
                onDrop={handleDrop}
                className={`rounded-2xl border border-dashed p-4 transition sm:p-5 ${
                  isDragging
                    ? 'border-[#9b82e8] bg-[#9b82e8]/[0.08]'
                    : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[#9b82e8]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="apk-analysis-file"
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={handleFileChange}
                  disabled={isAnalyzing}
                  className="sr-only"
                />

                {!file ? (
                  <label
                    htmlFor="apk-analysis-file"
                    className="flex cursor-pointer flex-col items-center justify-center py-7 text-center"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/10 text-[#9b82e8] dark:text-[#b6a1f5]">
                      <Upload size={22} aria-hidden="true" />
                    </span>

                    <span className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                      Drop an APK here or{' '}
                      <span className="text-[#9b82e8] dark:text-[#b6a1f5] hover:text-[#6845b7] dark:hover:text-[#c9b9ff]">
                        browse files
                      </span>
                    </span>

                    <span className="mt-1.5 text-xs text-[var(--text-muted)]">
                      APK files only · Maximum size: 100 MB
                    </span>
                  </label>
                ) : (
                  <div className="theme-card-secondary flex flex-wrap items-center justify-between gap-3 rounded-xl p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#9b82e8]/15 bg-[#9b82e8]/[0.08] text-[#9b82e8] dark:text-[#b6a1f5]">
                        <FileArchive size={19} aria-hidden="true" />
                      </span>

                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium text-[var(--text-primary)]">
                          {file.name}
                        </p>

                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={removeFile}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-red-400/20 hover:bg-red-400/[0.06] hover:text-red-500 dark:hover:text-red-300 disabled:opacity-50"
                    >
                      <X size={14} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border-color)] pt-5 sm:flex-row sm:justify-end">
            {(file || result) && (
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
              disabled={isAnalyzing || isLoadingCases || !caseId || !file}
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

              {isAnalyzing ? 'Analyzing APK…' : 'Analyze APK'}
            </button>
          </div>
        </form>

        {/* Information Panel */}
        <aside className="space-y-4">
          {/* Static Analysis Info */}
          <div className="rounded-2xl border border-[#9b82e8]/20 bg-[#9b82e8]/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-[#9b82e8] dark:text-[#b6a1f5]"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Static analysis limitations
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  The APK is inspected statically and is not executed. This
                  model-based result cannot guarantee detection of every malicious
                  behavior. Treat it as decision support, not a definitive malware
                  verdict.
                </p>
              </div>
            </div>
          </div>

          {/* Finding Information */}
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
              Successful case-linked analysis is automatically saved to the selected
              case and returns a finding ID.
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

              <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                {result.filename}
              </p>
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

            {/* Benign Probability */}
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Benign probability
              </p>

              <p className="mt-2 text-lg font-semibold text-emerald-600 dark:text-[#39b99b]">
                {formatProbability(result.class_probabilities.benign)}
              </p>
            </div>

            {/* Malware Probability */}
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Malware probability
              </p>

              <p className="mt-2 text-lg font-semibold text-red-500 dark:text-red-300">
                {formatProbability(result.class_probabilities.malware)}
              </p>
            </div>

            {/* Analysis Metadata */}
            <div className="theme-card-secondary grid gap-3 rounded-xl p-4 sm:col-span-2 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Analysis type
                </p>

                <p className="mt-1 text-sm text-[var(--text-primary)]">
                  {result.analysis_type}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Features extracted
                </p>

                <p className="mt-1 text-sm text-[var(--text-primary)]">
                  {result.features_extracted}
                </p>
              </div>
            </div>

            {/* Finding Saved Confirmation */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 sm:col-span-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600/80 dark:text-[#39b99b]/70">
                  Finding saved to case
                </p>

                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-[#b6e8d6]">
                  {result.message}
                </p>

                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
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
