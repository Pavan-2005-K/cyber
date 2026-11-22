
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
import { getEvidenceByCase } from '../../services/evidenceService'
import {
  analyzeImageForgery,
  analyzeImageForgeryEvidence,
  type ImageForgeryResponse,
} from '../../services/aiAnalysisService'

// =========================================================
// CONFIGURATION
// =========================================================

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024

type InputMode = 'upload' | 'existing'

// =========================================================
// ERROR HANDLING
// =========================================================

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
              'msg' in item && typeof item.msg === 'string'
                ? item.msg
                : null

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

// =========================================================
// STYLING HELPERS
// =========================================================

function getSeverityStyle(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'border-red-400/30 bg-red-400/10 text-red-700 dark:text-red-300'

    case 'MEDIUM':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300'

    default:
      return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'
  }
}

function getExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase()
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

// =========================================================
// MAIN COMPONENT
// =========================================================

export default function ImageForgery() {
  // Case state
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('upload')

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  // Existing evidence state
  const [evidenceList, setEvidenceList] = useState<any[]>([])
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('')
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')

  // Result state
  const [result, setResult] = useState<ImageForgeryResponse | null>(null)

  // Error state
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [fileError, setFileError] = useState('')

  // Loading state
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const submissionLock = useRef(false)

  // =======================================================
  // LOAD CASES
  // =======================================================

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

  // =======================================================
  // LOAD EXISTING IMAGE EVIDENCE WHEN CASE CHANGES
  // =======================================================

  useEffect(() => {
    let active = true

    setEvidenceList([])
    setSelectedEvidenceId('')
    setEvidenceError('')

    if (!caseId || inputMode !== 'existing') {
      setIsLoadingEvidence(false)
      return
    }

    setIsLoadingEvidence(true)

    getEvidenceByCase(Number(caseId))
      .then((data) => {
        if (!active) return

        const imageEvidence = data.filter((item) => {
          const extension = getExtension(item.original_filename || '')

          return ACCEPTED_EXTENSIONS.includes(extension)
        })

        setEvidenceList(imageEvidence)
      })
      .catch((error: unknown) => {
        if (active) {
          setEvidenceError(
            getApiErrorMessage(
              error,
              'Existing case evidence could not be loaded.',
            ),
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingEvidence(false)
      })

    return () => {
      active = false
    }
  }, [caseId, inputMode])

  // =======================================================
  // PREVIEW CLEANUP
  // =======================================================

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    },
    [],
  )

  // =======================================================
  // UPDATE IMAGE PREVIEW
  // =======================================================

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

  // =======================================================
  // FILE VALIDATION
  // =======================================================

  function validateFile(candidate: File): string | null {
    if (!ACCEPTED_EXTENSIONS.includes(getExtension(candidate.name))) {
      return `Unsupported file type. Choose ${ACCEPTED_EXTENSIONS.join(', ')}.`
    }

    if (candidate.size === 0) {
      return 'The selected image is empty.'
    }

    if (candidate.size > MAX_FILE_SIZE) {
      return 'The image file cannot exceed 10 MB.'
    }

    return null
  }

  // =======================================================
  // SELECT FILE
  // =======================================================

  function selectFile(candidate: File | undefined) {
    setAnalysisError('')
    setResult(null)

    if (!candidate) return

    const validationError = validateFile(candidate)

    if (validationError) {
      updatePreview(null)
      setFileError(validationError)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      return
    }

    setFileError('')
    updatePreview(candidate)
  }

  // =======================================================
  // FILE INPUT CHANGE
  // =======================================================

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
  }

  // =======================================================
  // DRAG AND DROP
  // =======================================================

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    if (isAnalyzing || inputMode !== 'upload') return

    selectFile(event.dataTransfer.files[0])
  }

  // =======================================================
  // IMAGE ANALYSIS
  // =======================================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select a case before analyzing an image.')
      return
    }

    // Validate based on selected mode
    if (inputMode === 'upload') {
      if (!file) {
        setFileError('Choose an image file to analyze.')
        return
      }

      const validationError = validateFile(file)

      if (validationError) {
        setFileError(validationError)
        return
      }
    } else {
      if (!selectedEvidenceId) {
        setAnalysisError('Select an existing image evidence file.')
        return
      }
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      let analysis: ImageForgeryResponse

      if (inputMode === 'upload' && file) {
        analysis = await analyzeImageForgery(Number(caseId), file)
      } else {
        analysis = await analyzeImageForgeryEvidence(
          Number(caseId),
          Number(selectedEvidenceId),
        )
      }

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

  // =======================================================
  // REMOVE FILE
  // =======================================================

  function removeFile() {
    updatePreview(null)
    setFileError('')
    setAnalysisError('')
    setResult(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // =======================================================
  // RESET ANALYSIS
  // =======================================================

  function resetAnalysis() {
    removeFile()
    setSelectedEvidenceId('')
    setResult(null)
  }

  // =======================================================
  // RETRY CASES
  // =======================================================

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

  // =======================================================
  // SELECTED CASE
  // =======================================================

  const selectedCase = cases.find(
    (caseItem) => String(caseItem.id) === caseId,
  )

  const selectedEvidence = evidenceList.find(
    (item) => String(item.id) === selectedEvidenceId,
  )

  // =======================================================
  // UI
  // =======================================================

  return (
    <section className="mx-auto max-w-6xl space-y-6 theme-text">
      {/* HEADER */}

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7954c8] dark:text-[#b6a1f5]">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          Image Forgery Detection
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
          Analyze an image for potential signs of manipulation and save the
          assessment to an investigation case.
        </p>
      </header>

      {/* CASE LOADING ERROR */}

      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-400/30 bg-red-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={17} aria-hidden="true" />
            {casesError}
          </p>

          <button
            type="button"
            onClick={retryCases}
            className="self-start rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-400/10 dark:text-red-300 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {/* FILE ERROR */}

      {fileError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-700 dark:text-amber-200"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{fileError}</span>
        </p>
      )}

      {/* ANALYSIS ERROR */}

      {analysisError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{analysisError}</span>
        </p>
      )}

      {/* =================================================
          ANALYSIS FORM
      ================================================= */}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        {/* IMAGE ANALYSIS FORM */}

        <form onSubmit={handleSubmit} className="theme-card p-5 sm:p-7">
          {/* FORM HEADER */}

          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10 text-[#7954c8] dark:text-[#b6a1f5]">
              <FileImage size={21} aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Image analysis
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                Select a case and choose a new image or existing case evidence.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {/* CASE SELECTOR */}

            <div className="space-y-2">
              <label
                htmlFor="image-forgery-case"
                className="block text-sm font-medium text-[var(--text-primary)]"
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
                  setSelectedEvidenceId('')
                }}
                disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
                required
                className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
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

            {/* INPUT MODE SWITCH */}

            <div className="space-y-2">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Image source
              </span>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('upload')
                    setSelectedEvidenceId('')
                    setEvidenceError('')
                    setAnalysisError('')
                    setResult(null)
                  }}
                  disabled={isAnalyzing}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    inputMode === 'upload'
                      ? 'bg-[#9b82e8] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  Upload New Image
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInputMode('existing')
                    updatePreview(null)
                    setFileError('')
                    setAnalysisError('')
                    setResult(null)
                  }}
                  disabled={isAnalyzing}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    inputMode === 'existing'
                      ? 'bg-[#9b82e8] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  Select Existing Evidence
                </button>
              </div>
            </div>

            {/* UPLOAD MODE */}

            {inputMode === 'upload' && (
              <div className="space-y-2">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
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
                  className={`rounded-xl border border-dashed p-4 transition sm:p-5 ${
                    isDragging
                      ? 'border-[#9b82e8] bg-purple-500/[0.08]'
                      : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[#9b82e8]/50'
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
                      <span className="flex size-12 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10 text-[#7954c8] dark:text-[#b6a1f5]">
                        <ImageUp size={22} aria-hidden="true" />
                      </span>

                      <span className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                        Drop an image here or{' '}
                        <span className="text-[#7954c8] dark:text-[#b6a1f5]">
                          browse files
                        </span>
                      </span>

                      <span className="mt-1.5 text-xs text-[var(--text-muted)]">
                        JPG, JPEG, PNG, or WEBP · Maximum 10 MB
                      </span>
                    </label>
                  ) : (
                    /* IMAGE PREVIEW */

                    <div className="space-y-4">
                      {previewUrl && (
                        <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                          <img
                            src={previewUrl}
                            alt={`Selected image preview: ${file.name}`}
                            className="max-h-80 w-full object-contain"
                          />
                        </div>
                      )}

                      {/* FILE INFORMATION */}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card-hover)] text-[var(--text-secondary)]">
                            <FileImage size={17} aria-hidden="true" />
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

                        {/* REMOVE FILE */}

                        <button
                          type="button"
                          onClick={removeFile}
                          disabled={isAnalyzing}
                          className="theme-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition hover:border-red-400/30 hover:bg-red-400/[0.06] hover:text-red-600 dark:hover:text-red-300 disabled:opacity-50"
                        >
                          <X size={14} aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* EXISTING EVIDENCE MODE */}

            {inputMode === 'existing' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label
                    htmlFor="image-forgery-evidence"
                    className="block text-sm font-medium text-[var(--text-primary)]"
                  >
                    Existing image evidence
                  </label>

                  <select
                    id="image-forgery-evidence"
                    value={selectedEvidenceId}
                    onChange={(event) => {
                      setSelectedEvidenceId(event.target.value)
                      setAnalysisError('')
                      setResult(null)
                    }}
                    disabled={isLoadingEvidence || isAnalyzing || evidenceList.length === 0}
                    className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-[#9b82e8] focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
                  >
                    <option value="">
                      {isLoadingEvidence
                        ? 'Loading evidence…'
                        : evidenceList.length === 0
                          ? 'No supported image evidence found'
                          : 'Select an image evidence file'}
                    </option>

                    {evidenceList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.original_filename} ({formatFileSize(item.file_size)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* LOADING */}

                {isLoadingEvidence && (
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3 text-xs text-[var(--text-secondary)]">
                    <LoaderCircle size={15} className="animate-spin" />
                    Loading case evidence…
                  </div>
                )}

                {/* EVIDENCE ERROR */}

                {evidenceError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3 py-3 text-xs text-red-600 dark:text-red-300"
                  >
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{evidenceError}</span>
                  </div>
                )}

                {/* EMPTY STATE */}

                {!isLoadingEvidence && !evidenceError && evidenceList.length === 0 && (
                  <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-200">
                    This case has no supported image evidence. Upload an image in
                    the case Evidence section first, or switch to Upload New Image.
                  </p>
                )}

                {/* SELECTED EVIDENCE DETAILS */}

                {selectedEvidence && (
                  <div className="rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/[0.05] p-3">
                    <div className="flex items-start gap-2">
                      <FileImage
                        size={17}
                        className="mt-0.5 shrink-0 text-[#7954c8] dark:text-[#b6a1f5]"
                      />

                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium text-[var(--text-primary)]">
                          {selectedEvidence.original_filename}
                        </p>

                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {formatFileSize(selectedEvidence.file_size)}
                        </p>

                        {selectedEvidence.sha256_hash && (
                          <p className="mt-2 break-all font-mono text-[10px] text-[var(--text-muted)]">
                            SHA-256: {selectedEvidence.sha256_hash}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 border-t border-[#9b82e8]/15 pt-2 text-[11px] text-[var(--text-muted)]">
                      Stored evidence · Integrity verification performed by backend
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FORM BUTTONS */}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t theme-divider pt-5 sm:flex-row sm:justify-end">
            {(file || selectedEvidenceId || result) && (
              <button
                type="button"
                onClick={resetAnalysis}
                disabled={isAnalyzing}
                className="theme-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition hover:bg-[var(--bg-card-hover)] disabled:opacity-50 sm:py-2.5"
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
                (inputMode === 'upload' ? !file : !selectedEvidenceId) ||
                (inputMode === 'existing' && isLoadingEvidence)
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#9b82e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8b72d9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
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

              {isAnalyzing
                ? 'Analyzing image…'
                : inputMode === 'existing'
                  ? 'Analyze Existing Image'
                  : 'Analyze image'}
            </button>
          </div>
        </form>

        {/* =================================================
            INFORMATION SIDEBAR
        ================================================= */}

        <aside className="space-y-4">
          {/* FORENSIC INFORMATION */}

          <div className="rounded-xl border border-purple-400/20 bg-purple-500/[0.045] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-[#7954c8] dark:text-[#b6a1f5]"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-[#7954c8] dark:text-[#d2c5ff]">
                  Forensic decision support
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  AI-based image-forgery detection is an assessment, not
                  definitive proof of manipulation. False positives and false
                  negatives are possible; use independent forensic examination
                  for important decisions.
                </p>
              </div>
            </div>
          </div>

          {/* SAVED FINDING INFORMATION */}

          <div className="theme-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <BadgeCheck
                size={17}
                className="text-emerald-600 dark:text-emerald-300"
                aria-hidden="true"
              />

              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Automatically saved finding
              </h2>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Successful case-linked analysis is automatically saved to the
              selected case. The result includes its finding ID.
            </p>
          </div>
        </aside>
      </div>

      {/* =================================================
          ANALYSIS RESULTS
      ================================================= */}

      {result && (
        <section aria-live="polite" className="theme-card overflow-hidden">
          {/* RESULT HEADER */}

          <div className="flex flex-col gap-4 border-b theme-divider p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#7954c8] dark:text-[#b6a1f5]">
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

          {/* RESULT CARDS */}

          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
            {/* PREDICTION */}

            <div className="theme-card-secondary p-4">
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

            {/* CONFIDENCE */}

            <div className="theme-card-secondary p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Confidence
                </p>

                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {formatProbability(result.confidence)}
                </p>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-card-hover)]">
                <div
                  className="h-full rounded-full bg-[#9b82e8]"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, result.confidence * 100),
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* TAMPERED PROBABILITY */}

            <div className="theme-card-secondary p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Tampered probability
              </p>

              <p className="mt-2 text-lg font-semibold text-red-600 dark:text-red-300">
                {formatProbability(result.tampered_probability)}
              </p>
            </div>

            {/* AUTHENTIC PROBABILITY */}

            <div className="theme-card-secondary p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Authentic probability
              </p>

              <p className="mt-2 text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                {formatProbability(result.authentic_probability)}
              </p>
            </div>

            {/* MODEL DETAILS */}

            <div className="theme-card-secondary grid gap-3 p-4 text-sm sm:col-span-2 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Model
                </p>

                <p className="mt-1 break-words text-[var(--text-primary)]">
                  {result.model}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Threshold
                </p>

                <p className="mt-1 font-mono text-[var(--text-primary)]">
                  {result.threshold}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Input size
                </p>

                <p className="mt-1 font-mono text-[var(--text-primary)]">
                  {result.input_size.join(' × ')}
                </p>
              </div>
            </div>

            {/* SAVED FINDING */}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4 sm:col-span-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/70">
                  Finding saved to case
                </p>

                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                  {result.message}
                </p>

                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
                </p>
              </div>

              <span className="rounded-lg border border-emerald-400/30 bg-[var(--bg-card)] px-3 py-2 font-mono text-xs text-emerald-700 dark:text-emerald-200">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>

          {/* DISCLAIMER */}

          <div className="border-t theme-divider px-5 py-3 sm:px-7">
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              This result is an AI-assisted assessment, not definitive proof
              that the image was manipulated.
            </p>
          </div>
        </section>
      )}
    </section>
  )
}
