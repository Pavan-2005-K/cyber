import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  FileText,
  LoaderCircle,
  Mail,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeFakeEmailFile,
  analyzeFakeEmailText,
  type FakeEmailFileResponse,
  type FakeEmailTextResponse,
} from '../../services/aiAnalysisService'

const MAX_EMAIL_TEXT_LENGTH = 100_000
const MAX_EML_FILE_SIZE = 5 * 1024 * 1024

type AnalysisMode = 'text' | 'eml'
type FakeEmailResult = FakeEmailTextResponse | FakeEmailFileResponse

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
      return 'border-red-400/20 bg-red-400/10 text-red-300'
    case 'MEDIUM':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
    default:
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  }
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function isFileResult(result: FakeEmailResult): result is FakeEmailFileResponse {
  return 'email_headers' in result
}

export default function FakeEmail() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [mode, setMode] = useState<AnalysisMode>('text')
  const [emailText, setEmailText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<FakeEmailResult | null>(null)
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
    if (!candidate.name.toLowerCase().endsWith('.eml')) {
      return 'Choose a file with the .eml extension.'
    }
    if (candidate.size === 0) return 'The selected EML file is empty.'
    if (candidate.size > MAX_EML_FILE_SIZE) {
      return 'The EML file must be 5 MB or smaller.'
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
      setAnalysisError('Select a case before analyzing an email.')
      return
    }
    if (mode === 'text') {
      if (!emailText.trim()) {
        setAnalysisError('Enter email content to analyze.')
        return
      }
      if (emailText.length > MAX_EMAIL_TEXT_LENGTH) {
        setAnalysisError('Email text cannot exceed 100,000 characters.')
        return
      }
    } else {
      if (!file) {
        setFileError('Choose an EML file to analyze.')
        return
      }
      const validationError = validateFile(file)
      if (validationError) {
        setFileError(validationError)
        return
      }
    }

    submissionLock.current = true
    setIsAnalyzing(true)
    try {
      const analysis =
        mode === 'text'
          ? await analyzeFakeEmailText(Number(caseId), emailText)
          : await analyzeFakeEmailFile(Number(caseId), file!)
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'Email analysis could not be completed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function resetAnalysis() {
    setEmailText('')
    setFile(null)
    setFileError('')
    setAnalysisError('')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function changeMode(nextMode: AnalysisMode) {
    if (nextMode === mode) return
    resetAnalysis()
    setMode(nextMode)
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
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Fake Email Detection
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Assess email content for phishing indicators and save the result to
          an investigation case.
        </p>
      </header>

      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-red-300">
            <AlertCircle size={17} aria-hidden="true" />
            {casesError}
          </p>
          <button
            type="button"
            onClick={retryCases}
            className="self-start rounded-lg border border-red-300/20 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-400/10 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {fileError && mode === 'eml' && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-200"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{fileError}</span>
        </p>
      )}

      {analysisError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{analysisError}</span>
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
            <Mail size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">
              Email analysis
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Choose text analysis or submit an EML file with a readable
              plain-text body.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Email analysis mode"
          className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-[#242629] p-1"
        >
          <button
            type="button"
            role="tab"
            id="fake-email-text-tab"
            aria-selected={mode === 'text'}
            aria-controls="fake-email-text-panel"
            onClick={() => changeMode('text')}
            disabled={isAnalyzing}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
              mode === 'text'
                ? 'bg-blue-500/15 text-blue-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText size={16} aria-hidden="true" />
            Email Text
          </button>
          <button
            type="button"
            role="tab"
            id="fake-email-eml-tab"
            aria-selected={mode === 'eml'}
            aria-controls="fake-email-eml-panel"
            onClick={() => changeMode('eml')}
            disabled={isAnalyzing}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
              mode === 'eml'
                ? 'bg-blue-500/15 text-blue-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload size={16} aria-hidden="true" />
            Upload EML
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="fake-email-case"
              className="block text-sm font-medium text-slate-200"
            >
              Investigation case
            </label>
            <select
              id="fake-email-case"
              value={caseId}
              onChange={(event) => {
                setCaseId(event.target.value)
                setResult(null)
                setAnalysisError('')
              }}
              disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
              required
              className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
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
              <p className="text-xs text-slate-500">
                A successful analysis is saved to this case automatically.
              </p>
            )}
          </div>

          {mode === 'text' ? (
            <div
              id="fake-email-text-panel"
              role="tabpanel"
              aria-labelledby="fake-email-text-tab"
              className="space-y-2"
            >
              <label
                htmlFor="fake-email-text"
                className="block text-sm font-medium text-slate-200"
              >
                Email content
              </label>
              <textarea
                id="fake-email-text"
                value={emailText}
                onChange={(event) => {
                  setEmailText(event.target.value)
                  setResult(null)
                  setAnalysisError('')
                }}
                maxLength={MAX_EMAIL_TEXT_LENGTH}
                minLength={1}
                required
                rows={12}
                disabled={isAnalyzing}
                placeholder="Paste or type email content to analyze…"
                className="w-full resize-y rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Whitespace-only input cannot be analyzed.</span>
                <span className="shrink-0">
                  {emailText.length.toLocaleString()} / 100,000
                </span>
              </div>
            </div>
          ) : (
            <div
              id="fake-email-eml-panel"
              role="tabpanel"
              aria-labelledby="fake-email-eml-tab"
              className="space-y-2"
            >
              <span className="block text-sm font-medium text-slate-200">
                EML file
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
                    ? 'border-blue-400 bg-blue-500/[0.08]'
                    : 'border-white/15 bg-[#242629] hover:border-white/25'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="fake-email-eml-file"
                  type="file"
                  accept=".eml,message/rfc822"
                  onChange={handleFileChange}
                  disabled={isAnalyzing}
                  className="sr-only"
                />
                {!file ? (
                  <label
                    htmlFor="fake-email-eml-file"
                    className="flex cursor-pointer flex-col items-center justify-center py-7 text-center"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                      <Upload size={22} aria-hidden="true" />
                    </span>
                    <span className="mt-3 text-sm font-medium text-slate-200">
                      Drop an EML file here or{' '}
                      <span className="text-blue-300">browse files</span>
                    </span>
                    <span className="mt-1.5 text-xs text-slate-500">
                      .eml only · Maximum size: 5 MB
                    </span>
                  </label>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/[0.08] text-blue-300">
                        <FileText size={19} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium text-slate-200">
                          {file.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        setFileError('')
                        setResult(null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:border-red-400/20 hover:bg-red-400/[0.06] hover:text-red-300 disabled:opacity-50"
                    >
                      <X size={14} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                The backend analyzes a readable plain-text body. HTML-only
                emails are unsupported; extracted headers are not authenticated.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldAlert
              size={15}
              className="mt-0.5 shrink-0 text-blue-300"
              aria-hidden="true"
            />
            AI-assisted assessment, not definitive proof that an email is
            fraudulent.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {(result || emailText || file) && (
              <button
                type="button"
                onClick={resetAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 sm:py-2.5"
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
                (mode === 'text'
                  ? !emailText.trim() ||
                    emailText.length > MAX_EMAIL_TEXT_LENGTH
                  : !file)
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
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
              {isAnalyzing ? 'Analyzing email…' : 'Analyze email'}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <BadgeCheck
            size={18}
            className="mt-0.5 shrink-0 text-emerald-300"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold text-white">
              Automatically saved finding
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Both case-linked modes save a successful analysis to the
              selected case and return its finding ID.
            </p>
          </div>
        </div>
      </div>

      {result && (
        <section
          aria-live="polite"
          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#303236]"
        >
          <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-400">
                Analysis result
              </p>
              <h2 className="mt-1.5 text-lg font-semibold text-white">
                {result.module}
              </h2>
              {isFileResult(result) && (
                <p className="mt-1 break-all text-xs text-slate-500">
                  {result.filename}
                </p>
              )}
            </div>
            <span
              className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
            >
              {result.severity} severity
            </span>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Prediction
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {result.prediction}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Classification: {result.class}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Confidence
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatProbability(result.confidence)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Phishing probability
              </p>
              <p className="mt-2 text-lg font-semibold text-red-200">
                {formatProbability(result.phishing_probability)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Decision threshold
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-100">
                {formatProbability(result.threshold)}
              </p>
            </div>
            {isFileResult(result) && (
              <>
                <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4 sm:col-span-2 lg:col-span-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Email headers
                  </p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {(
                      [
                        ['Subject', result.email_headers.subject],
                        ['From', result.email_headers.from],
                        ['To', result.email_headers.to],
                        ['Reply-To', result.email_headers.reply_to],
                        ['Return-Path', result.email_headers.return_path],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-[11px] text-slate-500">{label}</dt>
                        <dd className="mt-0.5 break-words text-sm text-slate-200">
                          {value || 'Not provided'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4 sm:col-span-2 lg:col-span-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Analysis scope
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200">
                    {result.analysis_scope}
                  </p>
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                  Finding saved to case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-200">
                  {result.message}
                </p>
              </div>
              <span className="rounded-lg border border-emerald-300/15 bg-black/10 px-3 py-2 font-mono text-xs text-emerald-200">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>
        </section>
      )}
    </section>
  )
}
