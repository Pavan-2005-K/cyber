
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  CircleHelp,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  UploadCloud,
  UserRoundSearch,
} from 'lucide-react'

import { getCases, type Case } from '../../services/caseService'

import {
  analyzeFakeProfile,
  analyzeFakeProfileCsv,
  type FakeProfileRequest,
  type FakeProfileResponse,
  type FakeProfileBatchResponse,
} from '../../services/aiAnalysisService'

// =========================================================
// DEFAULT PROFILE
// =========================================================

const EMPTY_PROFILE: FakeProfileRequest = {
  username: '',
  fullname: '',
  description: '',
  external_url: '',
  has_profile_picture: false,
  is_private: false,
  posts: 0,
  followers: 0,
  following: 0,
}

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

      if (typeof detail === 'object' && detail !== null) {
        if ('message' in detail && typeof detail.message === 'string') {
          const row =
            'row' in detail && typeof detail.row === 'number'
              ? ` (CSV row ${detail.row})`
              : ''

          const errorMessage =
            'error' in detail && typeof detail.error === 'string'
              ? ` ${detail.error}`
              : ''

          return `${detail.message}${row}${errorMessage}`
        }

        if ('missing_columns' in detail && Array.isArray(detail.missing_columns)) {
          return `Missing CSV columns: ${detail.missing_columns.join(', ')}`
        }

        if ('unexpected_columns' in detail && Array.isArray(detail.unexpected_columns)) {
          return `Unexpected CSV columns: ${detail.unexpected_columns.join(', ')}`
        }
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
      return 'border-red-400/20 bg-red-400/10 text-red-300'

    case 'MEDIUM':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'

    default:
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  }
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function formatBatchPercentage(value: number): string {
  return `${value.toFixed(2)}%`
}

// =========================================================
// NUMBER FIELD
// =========================================================

function NumberField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: 'posts' | 'followers' | 'following'
  label: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-200"
      >
        {label}
      </label>

      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.valueAsNumber
          onChange(Number.isNaN(nextValue) ? 0 : nextValue)
        }}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
      />
    </div>
  )
}

// =========================================================
// TOGGLE FIELD
// =========================================================

function ToggleField({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: 'has_profile_picture' | 'is_private'
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#242629] p-4 transition hover:border-white/15"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">
          {label}
        </span>

        <span className="mt-1 block text-xs text-slate-500">
          {description}
        </span>
      </span>

      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />

        <span className="h-6 w-11 rounded-full bg-slate-700 transition peer-checked:bg-blue-500 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-400/30 peer-disabled:opacity-50" />

        <span className="pointer-events-none absolute left-1 top-1 size-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

// =========================================================
// SUMMARY CARD
// =========================================================

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string
  value: string | number
  description?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>

      <p className="mt-2 break-words text-2xl font-semibold text-white">
        {value}
      </p>

      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
    </div>
  )
}

// =========================================================
// MAIN COMPONENT
// =========================================================

export default function FakeProfile() {
  // Case state
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  // Manual analysis state
  const [profile, setProfile] =
    useState<FakeProfileRequest>(EMPTY_PROFILE)

  const [result, setResult] =
    useState<FakeProfileResponse | null>(null)

  // CSV batch state
  const [csvFile, setCsvFile] = useState<File | null>(null)

  const [batchResult, setBatchResult] =
    useState<FakeProfileBatchResponse | null>(null)

  const [isUploading, setIsUploading] = useState(false)

  // General state
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Prevent duplicate submissions
  const submissionLock = useRef(false)
  const csvSubmissionLock = useRef(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // -------------------------------------------------------
  // Load investigation cases
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // Clear previous results
  // -------------------------------------------------------

  function clearResults() {
    setResult(null)
    setBatchResult(null)
    setAnalysisError('')
    setSuccessMessage('')
  }

  // -------------------------------------------------------
  // Update manual profile
  // -------------------------------------------------------

  function updateProfile<K extends keyof FakeProfileRequest>(
    key: K,
    value: FakeProfileRequest[K],
  ) {
    setProfile((current) => ({
      ...current,
      [key]: value,
    }))

    clearResults()
  }

  // -------------------------------------------------------
  // Manual profile analysis
  // -------------------------------------------------------

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    clearResults()

    const normalizedUsername = profile.username.trim()

    if (!caseId) {
      setAnalysisError('Select a case before analyzing a profile.')
      return
    }

    if (!normalizedUsername) {
      setAnalysisError('Enter the profile username.')
      return
    }

    if (normalizedUsername.length > 100) {
      setAnalysisError('Username cannot exceed 100 characters.')
      return
    }

    if (profile.fullname.length > 200) {
      setAnalysisError('Full name cannot exceed 200 characters.')
      return
    }

    if (profile.description.length > 5000) {
      setAnalysisError(
        'Profile description cannot exceed 5,000 characters.',
      )
      return
    }

    if (profile.external_url.length > 2048) {
      setAnalysisError(
        'External URL cannot exceed 2,048 characters.',
      )
      return
    }

    if (
      !Number.isInteger(profile.posts) ||
      !Number.isInteger(profile.followers) ||
      !Number.isInteger(profile.following) ||
      profile.posts < 0 ||
      profile.followers < 0 ||
      profile.following < 0
    ) {
      setAnalysisError(
        'Posts, followers, and following must be non-negative whole numbers.',
      )
      return
    }

    const requestData: FakeProfileRequest = {
      ...profile,
      username: normalizedUsername,
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeFakeProfile(
        Number(caseId),
        requestData,
      )

      setResult(analysis)
      setSuccessMessage(analysis.message)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The profile could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // -------------------------------------------------------
  // CSV file selection
  // -------------------------------------------------------

  function handleCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null

    setCsvFile(null)
    setBatchResult(null)
    setResult(null)
    setAnalysisError('')
    setSuccessMessage('')

    if (!selectedFile) return

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setAnalysisError('Please select a valid CSV file.')
      event.target.value = ''
      return
    }

    if (selectedFile.size === 0) {
      setAnalysisError('The selected CSV file is empty.')
      event.target.value = ''
      return
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setAnalysisError('CSV file size must not exceed 5 MB.')
      event.target.value = ''
      return
    }

    setCsvFile(selectedFile)
  }

  // -------------------------------------------------------
  // CSV batch analysis
  // -------------------------------------------------------

  async function handleCsvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (csvSubmissionLock.current) return

    clearResults()

    if (!caseId) {
      setAnalysisError('Select an investigation case first.')
      return
    }

    if (!csvFile) {
      setAnalysisError('Please select a CSV file before uploading.')
      return
    }

    csvSubmissionLock.current = true
    setIsUploading(true)

    try {
      const analysis = await analyzeFakeProfileCsv(
        Number(caseId),
        csvFile,
      )

      setBatchResult(analysis)
      setSuccessMessage(analysis.message)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'Fake profile CSV batch analysis failed. Please try again.',
        ),
      )
    } finally {
      csvSubmissionLock.current = false
      setIsUploading(false)
    }
  }

  // -------------------------------------------------------
  // Reset manual and CSV analysis
  // -------------------------------------------------------

  function resetAnalysis() {
    setProfile(EMPTY_PROFILE)
    setCsvFile(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    clearResults()
  }

  // -------------------------------------------------------
  // Retry loading cases
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // Text field change
  // -------------------------------------------------------

  function handleTextChange(
    key: 'username' | 'fullname' | 'description' | 'external_url',
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    updateProfile(key, event.target.value)
  }

  const selectedCase = cases.find(
    (caseItem) => String(caseItem.id) === caseId,
  )

  // =======================================================
  // UI
  // =======================================================

  return (
    <section className="mx-auto max-w-6xl space-y-6">

      {/* HEADER */}

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Fake Profile Detection
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Analyze social media profiles individually or in batches
          using the CyberFusion detection model.
        </p>
      </header>

      {/* CASE LOADING ERROR */}

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

      {/* ANALYSIS ERROR */}

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

      {/* SUCCESS MESSAGE */}

      {successMessage && (result || batchResult) && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-300"
        >
          <BadgeCheck
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{successMessage}</span>
        </p>
      )}

      {/* =================================================
          CSV BATCH UPLOAD
      ================================================= */}

      <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7">

        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-300">
            <FileSpreadsheet size={21} aria-hidden="true" />
          </span>

          <div>
            <h2 className="text-base font-semibold text-white">
              CSV Batch Analysis
            </h2>

            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Upload a CSV containing multiple social media profiles
              to analyze them together.
            </p>
          </div>
        </div>

        <form onSubmit={handleCsvSubmit} className="mt-6 space-y-4">

          {/* FILE INPUT */}

          <div>
            <label
              htmlFor="fake-profile-csv"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Upload profile CSV
            </label>

            <div className="rounded-xl border border-dashed border-white/15 bg-[#242629] p-5 transition hover:border-blue-400/40">

              <label
                htmlFor="fake-profile-csv"
                className="flex cursor-pointer flex-col items-center justify-center gap-3 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                  <UploadCloud size={24} aria-hidden="true" />
                </span>

                <span className="text-sm font-medium text-slate-200">
                  Click to select a CSV file
                </span>

                <span className="text-xs text-slate-500">
                  CSV format only · Maximum file size 5 MB
                </span>
              </label>

              <input
                ref={fileInputRef}
                id="fake-profile-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvChange}
                disabled={isUploading || isAnalyzing}
                className="sr-only"
              />
            </div>
          </div>

          {/* SELECTED FILE */}

          {csvFile && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-400/15 bg-blue-500/[0.06] p-3">

              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet
                  size={20}
                  className="shrink-0 text-blue-300"
                  aria-hidden="true"
                />

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {csvFile.name}
                  </p>

                  <p className="text-xs text-slate-500">
                    {(csvFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCsvFile(null)
                  setBatchResult(null)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
                disabled={isUploading}
                className="text-xs font-medium text-red-300 transition hover:text-red-200 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

            <button
              type="button"
              onClick={resetAnalysis}
              disabled={isUploading || isAnalyzing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50"
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reset
            </button>

            <button
              type="submit"
              disabled={
                isUploading ||
                isAnalyzing ||
                isLoadingCases ||
                !caseId ||
                !csvFile
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <UploadCloud size={16} aria-hidden="true" />
              )}

              {isUploading ? 'Analyzing CSV…' : 'Upload & Analyze CSV'}
            </button>

          </div>
        </form>
      </div>

      {/* =================================================
          CSV BATCH RESULTS
      ================================================= */}

      {batchResult && (
        <div
          aria-live="polite"
          className="space-y-5 rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
        >

          <div className="flex flex-wrap items-start justify-between gap-3">

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-purple-400">
                CSV Batch Results
              </p>

              <h2 className="mt-1.5 text-lg font-semibold text-white">
                {batchResult.module}
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                {batchResult.filename}
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase ${getSeverityStyle(batchResult.severity)}`}
            >
              {batchResult.severity} severity
            </span>

          </div>

          {/* SUMMARY CARDS */}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

            <SummaryCard
              label="Total profiles"
              value={batchResult.total_profiles}
            />

            <SummaryCard
              label="Fake profiles"
              value={batchResult.fake_profiles}
            />

            <SummaryCard
              label="Genuine profiles"
              value={batchResult.genuine_profiles}
            />

            <SummaryCard
              label="Fake profile rate"
              value={formatBatchPercentage(batchResult.fake_percentage)}
            />

            <SummaryCard
              label="Average confidence"
              value={formatPercentage(batchResult.average_confidence)}
            />

            <SummaryCard
              label="Model"
              value={batchResult.model}
            />

          </div>

          {/* SAVED FINDING */}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                Finding successfully saved
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Case #{batchResult.case_id}
              </p>
            </div>

            <span className="rounded-lg border border-emerald-300/15 bg-black/10 px-3 py-2 font-mono text-sm text-emerald-200">
              Finding #{batchResult.finding_id}
            </span>

          </div>

          {/* INDIVIDUAL PREDICTIONS TABLE */}

          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">
                Individual Profile Predictions
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                Predictions for each social media profile in the uploaded CSV.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/[0.07]">

              <table className="w-full min-w-[850px] text-left text-xs">

                <thead className="bg-[#242629] text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Username</th>
                    <th className="px-4 py-3 font-semibold">Prediction</th>
                    <th className="px-4 py-3 font-semibold">
                      Fake probability
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Genuine probability
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Confidence
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/[0.06]">

                  {batchResult.results.map((item) => (
                    <tr
                      key={item.row_number}
                      className="transition hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3 text-slate-500">
                        {item.row_number}
                      </td>

                      <td className="px-4 py-3 font-medium text-slate-200">
                        {item.username}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            item.class === 1
                              ? 'border-red-400/20 bg-red-400/10 text-red-300'
                              : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                          }`}
                        >
                          {item.prediction}
                        </span>
                      </td>

                      <td className="px-4 py-3 tabular-nums text-slate-300">
                        {formatPercentage(item.fake_probability)}
                      </td>

                      <td className="px-4 py-3 tabular-nums text-slate-300">
                        {formatPercentage(item.genuine_probability)}
                      </td>

                      <td className="px-4 py-3 tabular-nums font-medium text-white">
                        {formatPercentage(item.confidence)}
                      </td>
                    </tr>
                  ))}

                </tbody>

              </table>

            </div>

            <p className="mt-2 text-right text-xs text-slate-500">
              {batchResult.results.length} records
            </p>

          </div>

          {/* WARNING */}

          <p className="text-xs leading-relaxed text-slate-400">
            These are experimental model-based estimates. They do not
            independently verify account ownership or prove that a profile
            is fake.
          </p>

        </div>
      )}

      {/* =================================================
          MANUAL FEATURE ANALYSIS
      ================================================= */}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">

        {/* MANUAL PROFILE FORM */}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
        >

          <div className="flex items-start gap-3">

            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <UserRoundSearch size={21} aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-base font-semibold text-white">
                Manual Profile Analysis
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Enter one social media profile's details for individual prediction.
              </p>
            </div>

          </div>

          <div className="mt-6 space-y-5">

            {/* CASE SELECTOR */}

            <div className="space-y-2">

              <label
                htmlFor="fake-profile-case"
                className="block text-sm font-medium text-slate-200"
              >
                Investigation case
              </label>

              <select
                id="fake-profile-case"
                value={caseId}
                onChange={(event) => {
                  setCaseId(event.target.value)
                  clearResults()
                }}
                disabled={
                  isLoadingCases ||
                  cases.length === 0 ||
                  isAnalyzing ||
                  isUploading
                }
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
                  The analysis finding will be saved to this case.
                </p>
              )}

            </div>

            {/* USERNAME AND FULL NAME */}

            <div className="grid gap-5 sm:grid-cols-2">

              <div className="space-y-2">

                <label
                  htmlFor="profile-username"
                  className="block text-sm font-medium text-slate-200"
                >
                  Username <span className="text-red-300">*</span>
                </label>

                <input
                  id="profile-username"
                  value={profile.username}
                  onChange={(event) =>
                    handleTextChange('username', event)
                  }
                  minLength={1}
                  maxLength={100}
                  required
                  disabled={isAnalyzing || isUploading}
                  placeholder="example_user"
                  className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
                />

                <p className="text-right text-[11px] text-slate-600">
                  {profile.username.length}/100
                </p>

              </div>

              <div className="space-y-2">

                <label
                  htmlFor="profile-fullname"
                  className="block text-sm font-medium text-slate-200"
                >
                  Full name <span className="text-slate-500">(optional)</span>
                </label>

                <input
                  id="profile-fullname"
                  value={profile.fullname}
                  onChange={(event) =>
                    handleTextChange('fullname', event)
                  }
                  maxLength={200}
                  disabled={isAnalyzing || isUploading}
                  placeholder="Example User"
                  className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
                />

                <p className="text-right text-[11px] text-slate-600">
                  {profile.fullname.length}/200
                </p>

              </div>

            </div>

            {/* DESCRIPTION */}

            <div className="space-y-2">

              <label
                htmlFor="profile-description"
                className="block text-sm font-medium text-slate-200"
              >
                Profile description{' '}
                <span className="text-slate-500">(optional)</span>
              </label>

              <textarea
                id="profile-description"
                value={profile.description}
                onChange={(event) =>
                  handleTextChange('description', event)
                }
                maxLength={5000}
                rows={4}
                disabled={isAnalyzing || isUploading}
                placeholder="Enter the profile bio or description"
                className="w-full resize-y rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
              />

              <p className="text-right text-[11px] text-slate-600">
                {profile.description.length}/5000
              </p>

            </div>

            {/* EXTERNAL URL */}

            <div className="space-y-2">

              <label
                htmlFor="profile-external-url"
                className="block text-sm font-medium text-slate-200"
              >
                External URL{' '}
                <span className="text-slate-500">(optional)</span>
              </label>

              <input
                id="profile-external-url"
                type="text"
                inputMode="url"
                value={profile.external_url}
                onChange={(event) =>
                  handleTextChange('external_url', event)
                }
                maxLength={2048}
                disabled={isAnalyzing || isUploading}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
              />

              <p className="text-right text-[11px] text-slate-600">
                {profile.external_url.length}/2048
              </p>

            </div>

            {/* TOGGLES */}

            <div className="grid gap-3 sm:grid-cols-2">

              <ToggleField
                id="has_profile_picture"
                label="Profile picture"
                description="Does the account have a profile photo?"
                checked={profile.has_profile_picture}
                disabled={isAnalyzing || isUploading}
                onChange={(checked) =>
                  updateProfile('has_profile_picture', checked)
                }
              />

              <ToggleField
                id="is_private"
                label="Private account"
                description="Is the profile set to private?"
                checked={profile.is_private}
                disabled={isAnalyzing || isUploading}
                onChange={(checked) =>
                  updateProfile('is_private', checked)
                }
              />

            </div>

            {/* NUMBER FIELDS */}

            <div className="grid gap-4 sm:grid-cols-3">

              <NumberField
                id="posts"
                label="Posts"
                value={profile.posts}
                disabled={isAnalyzing || isUploading}
                onChange={(value) =>
                  updateProfile('posts', value)
                }
              />

              <NumberField
                id="followers"
                label="Followers"
                value={profile.followers}
                disabled={isAnalyzing || isUploading}
                onChange={(value) =>
                  updateProfile('followers', value)
                }
              />

              <NumberField
                id="following"
                label="Following"
                value={profile.following}
                disabled={isAnalyzing || isUploading}
                onChange={(value) =>
                  updateProfile('following', value)
                }
              />

            </div>

          </div>

          {/* FORM BUTTONS */}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:justify-end">

            {(result || profile.username) && (
              <button
                type="button"
                onClick={resetAnalysis}
                disabled={isAnalyzing || isUploading}
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
                isUploading ||
                isLoadingCases ||
                !caseId ||
                !profile.username.trim()
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

              {isAnalyzing ? 'Analyzing profile…' : 'Analyze Profile'}

            </button>

          </div>

        </form>

        {/* =================================================
            INFORMATION AND MANUAL RESULT
        ================================================= */}

        <aside className="space-y-4">

          {/* MODEL INFORMATION */}

          <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.055] p-5 sm:p-6">

            <div className="flex items-start gap-3">

              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-blue-300"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-blue-100">
                  Experimental model assessment
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  The result is a model-based estimate. It does not
                  verify account ownership or prove that a profile is fake.
                  Use it as decision support alongside independent investigation.
                </p>
              </div>

            </div>

          </div>

          {/* CASE INFORMATION */}

          <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6">

            <div className="flex items-center gap-2">

              <CircleHelp
                size={17}
                className="text-slate-300"
                aria-hidden="true"
              />

              <h2 className="text-sm font-semibold text-white">
                Case-linked analysis
              </h2>

            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Successful analysis automatically saves a detection finding
              to the selected case. No extra save action is needed.
            </p>

          </div>

          {/* MANUAL RESULT */}

          {result && (
            <div
              aria-live="polite"
              className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6"
            >

              <div className="flex flex-wrap items-start justify-between gap-3">

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-400">
                    Analysis result
                  </p>

                  <h2 className="mt-1.5 text-base font-semibold text-white">
                    {result.module}
                  </h2>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
                >
                  {result.severity}
                </span>

              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">

                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Prediction
                </p>

                <p className="mt-2 break-words text-lg font-semibold text-white">
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
                    {formatPercentage(result.confidence)}
                  </p>

                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">

                  <div
                    className="h-full rounded-full bg-blue-400"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, result.confidence * 100),
                      )}%`,
                    }}
                  />

                </div>

              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                    Saved finding
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Case #{result.case_id}
                  </p>
                </div>

                <span className="rounded-lg border border-emerald-300/15 bg-black/10 px-3 py-2 font-mono text-xs text-emerald-200">
                  #{result.finding_id}
                </span>

              </div>

              <p className="text-xs leading-relaxed text-slate-400">
                {result.message}
              </p>

            </div>
          )}

        </aside>

      </div>

    </section>
  )
}
