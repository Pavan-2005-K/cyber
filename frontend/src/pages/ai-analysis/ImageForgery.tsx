import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  FileImage,
  ImageUp,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  X,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeImageForgery,
  type ImageForgeryResponse,
} from '../../services/aiAnalysisService'

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024

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

function getExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase()
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

export default function ImageForgery() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [result, setResult] = useState<ImageForgeryResponse | null>(null)
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [fileError, setFileError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
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

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    },
    [],
  )

  function updatePreview(candidate: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    if (candidate) {
      const objectUrl = URL.createObjectURL(candidate)
      previewUrlRef.current = objectUrl
      setPreviewUrl(objectUrl)
    } else {
      setPreviewUrl('')
    }

    setFile(candidate)
  }

  function validateFile(candidate: File): string | null {
    if (!ACCEPTED_EXTENSIONS.includes(getExtension(candidate.name))) {
      return `Unsupported file type. Choose ${ACCEPTED_EXTENSIONS.join(', ')}.`
    }
    if (candidate.size === 0) return 'The selected image is empty.'
    if (candidate.size > MAX_FILE_SIZE) {
      return 'The image file cannot exceed 10 MB.'
    }
    return null
  }

  function selectFile(candidate: File | undefined) {
    setAnalysisError('')
    setResult(null)
    if (!candidate) return

    const validationError = validateFile(candidate)
    if (validationError) {
      updatePreview(null)
      setFileError(validationError)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFileError('')
    updatePreview(candidate)
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
      setAnalysisError('Select a case before analyzing an image.')
      return
    }
    if (!file) {
      setFileError('Choose an image file to analyze.')
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
      const analysis = await analyzeImageForgery(Number(caseId), file)
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The image could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function removeFile() {
    updatePreview(null)
    setFileError('')
    setAnalysisError('')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function resetAnalysis() {
    removeFile()
    setResult(null)
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
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Image Forgery Detection
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Analyze an image for potential signs of manipulation and save the
          assessment to an investigation case.
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

      {fileError && (
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <FileImage size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                Image analysis
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Select a case and a supported image file for analysis.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="image-forgery-case"
                className="block text-sm font-medium text-slate-200"
              >
                Investigation case
              </label>
              <select
                id="image-forgery-case"
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

            <div className="space-y-2">
              <span className="block text-sm font-medium text-slate-200">
                Image file
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
                  id="image-forgery-file"
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(',')}
                  onChange={handleFileChange}
                  disabled={isAnalyzing}
                  className="sr-only"
                />
                {!file ? (
                  <label
                    htmlFor="image-forgery-file"
                    className="flex cursor-pointer flex-col items-center justify-center py-7 text-center"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                      <ImageUp size={22} aria-hidden="true" />
                    </span>
                    <span className="mt-3 text-sm font-medium text-slate-200">
                      Drop an image here or{' '}
                      <span className="text-blue-300">browse files</span>
                    </span>
                    <span className="mt-1.5 text-xs text-slate-500">
                      JPG, JPEG, PNG, or WEBP · Maximum 10 MB
                    </span>
                  </label>
                ) : (
                  <div className="space-y-4">
                    {previewUrl && (
                      <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
                        <img
                          src={previewUrl}
                          alt={`Selected image preview: ${file.name}`}
                          className="max-h-80 w-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300">
                          <FileImage size={17} aria-hidden="true" />
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
                        onClick={removeFile}
                        disabled={isAnalyzing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:border-red-400/20 hover:bg-red-400/[0.06] hover:text-red-300 disabled:opacity-50"
                      >
                        <X size={14} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:justify-end">
            {(file || result) && (
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
              disabled={isAnalyzing || isLoadingCases || !caseId || !file}
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
              {isAnalyzing ? 'Analyzing image…' : 'Analyze image'}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-blue-300"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold text-blue-100">
                  Forensic decision support
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  AI-based image-forgery detection is an assessment, not
                  definitive proof of manipulation. False positives and false
                  negatives are possible; use independent forensic examination
                  for important decisions.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <BadgeCheck
                size={17}
                className="text-emerald-300"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-white">
                Automatically saved finding
              </h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Successful case-linked analysis is automatically saved to the
              selected case. The result includes its finding ID.
            </p>
          </div>
        </aside>
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
              <p className="mt-1 break-all text-xs text-slate-500">
                {result.filename}
              </p>
            </div>
            <span
              className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
            >
              {result.severity} severity
            </span>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
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
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Confidence
                </p>
                <p className="text-sm font-semibold text-white">
                  {formatProbability(result.confidence)}
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-blue-400"
                  style={{
                    width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tampered probability
              </p>
              <p className="mt-2 text-lg font-semibold text-red-200">
                {formatProbability(result.tampered_probability)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Authentic probability
              </p>
              <p className="mt-2 text-lg font-semibold text-emerald-200">
                {formatProbability(result.authentic_probability)}
              </p>
            </div>
            <div className="grid gap-3 rounded-xl border border-white/[0.07] bg-[#242629] p-4 text-sm sm:col-span-2 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Model
                </p>
                <p className="mt-1 text-slate-200">{result.model}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Threshold
                </p>
                <p className="mt-1 font-mono text-slate-200">
                  {result.threshold}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Input size
                </p>
                <p className="mt-1 font-mono text-slate-200">
                  {result.input_size.join(' × ')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:col-span-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                  Finding saved to case
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-200">
                  {result.message}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
                </p>
              </div>
              <span className="rounded-lg border border-emerald-300/15 bg-black/10 px-3 py-2 font-mono text-xs text-emerald-200">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-5 py-3 sm:px-7">
            <p className="text-xs leading-relaxed text-slate-500">
              This result is an AI-assisted assessment, not definitive proof
              that the image was manipulated.
            </p>
          </div>
        </section>
      )}
    </section>
  )
}
