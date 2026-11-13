
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  CreditCard,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react'

import { getCases, type Case } from '../../services/caseService'

import {
  analyzeCreditCardFraud,
  analyzeCreditCardFraudCsv,
  type CreditCardFraudFeatures,
  type CreditCardFraudResponse,
  type CreditCardFraudBatchResponse,
} from '../../services/aiAnalysisService'

type CreditCardFraudFeatureName = keyof CreditCardFraudFeatures

const MAX_CSV_SIZE = 5 * 1024 * 1024

const TRANSACTION_FEATURES = [
  'Time',
  'Amount',
] as const satisfies readonly CreditCardFraudFeatureName[]

const PCA_FEATURES = [
  'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7',
  'V8', 'V9', 'V10', 'V11', 'V12', 'V13',
  'V14', 'V15', 'V16', 'V17', 'V18', 'V19',
  'V20', 'V21', 'V22', 'V23', 'V24', 'V25',
  'V26', 'V27', 'V28',
] as const satisfies readonly CreditCardFraudFeatureName[]

const FEATURE_NAMES = [
  ...TRANSACTION_FEATURES,
  ...PCA_FEATURES,
] as const satisfies readonly CreditCardFraudFeatureName[]

function createEmptyFeatureValues(): Record<
  CreditCardFraudFeatureName,
  string
> {
  return Object.fromEntries(
    FEATURE_NAMES.map((featureName) => [featureName, '']),
  ) as Record<CreditCardFraudFeatureName, string>
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

      if (typeof detail === 'object' && detail !== null) {
        const detailMessage =
          'message' in detail && typeof detail.message === 'string'
            ? detail.message
            : null

        const missing =
          'missing_features' in detail &&
          Array.isArray(detail.missing_features)
            ? detail.missing_features.filter(
                (feature): feature is string =>
                  typeof feature === 'string',
              )
            : []

        const unexpected =
          'unexpected_features' in detail &&
          Array.isArray(detail.unexpected_features)
            ? detail.unexpected_features.filter(
                (feature): feature is string =>
                  typeof feature === 'string',
              )
            : []

        const invalidCells =
          'invalid_cells' in detail &&
          Array.isArray(detail.invalid_cells)
            ? detail.invalid_cells
                .slice(0, 10)
                .map((cell: unknown) => {
                  if (
                    typeof cell !== 'object' ||
                    cell === null ||
                    !('row' in cell) ||
                    !('column' in cell)
                  ) {
                    return null
                  }

                  return `Row ${cell.row}, column ${cell.column}`
                })
                .filter((value): value is string => value !== null)
            : []

        const details = [
          detailMessage,
          missing.length ? `Missing: ${missing.join(', ')}.` : null,
          unexpected.length
            ? `Unexpected: ${unexpected.join(', ')}.`
            : null,
          invalidCells.length
            ? `Invalid values at ${invalidCells.join('; ')}.`
            : null,
        ].filter((message): message is string => message !== null)

        if (details.length) return details.join(' ')
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

export default function CreditCardFraud() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [analysisMode, setAnalysisMode] = useState<
    'manual' | 'csv'
  >('manual')

  // Manual transaction state
  const [featureValues, setFeatureValues] =
    useState<Record<CreditCardFraudFeatureName, string>>(
      createEmptyFeatureValues,
    )

  const [validationErrors, setValidationErrors] = useState<
    CreditCardFraudFeatureName[]
  >([])

  const [result, setResult] =
    useState<CreditCardFraudResponse | null>(null)

  // CSV batch analysis state
  const [csvFile, setCsvFile] = useState<File | null>(null)

  const [csvResult, setCsvResult] =
    useState<CreditCardFraudBatchResponse | null>(null)

  const [csvError, setCsvError] = useState('')
  const [isUploadingCsv, setIsUploadingCsv] = useState(false)

  // Common state
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')

  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const submissionLock = useRef(false)
  const csvSubmissionLock = useRef(false)

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
            getApiErrorMessage(
              error,
              'Your cases could not be loaded.',
            ),
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

  function getNumericFeatures(): CreditCardFraudFeatures {
    return {
      Time: Number(featureValues.Time),
      V1: Number(featureValues.V1),
      V2: Number(featureValues.V2),
      V3: Number(featureValues.V3),
      V4: Number(featureValues.V4),
      V5: Number(featureValues.V5),
      V6: Number(featureValues.V6),
      V7: Number(featureValues.V7),
      V8: Number(featureValues.V8),
      V9: Number(featureValues.V9),
      V10: Number(featureValues.V10),
      V11: Number(featureValues.V11),
      V12: Number(featureValues.V12),
      V13: Number(featureValues.V13),
      V14: Number(featureValues.V14),
      V15: Number(featureValues.V15),
      V16: Number(featureValues.V16),
      V17: Number(featureValues.V17),
      V18: Number(featureValues.V18),
      V19: Number(featureValues.V19),
      V20: Number(featureValues.V20),
      V21: Number(featureValues.V21),
      V22: Number(featureValues.V22),
      V23: Number(featureValues.V23),
      V24: Number(featureValues.V24),
      V25: Number(featureValues.V25),
      V26: Number(featureValues.V26),
      V27: Number(featureValues.V27),
      V28: Number(featureValues.V28),
      Amount: Number(featureValues.Amount),
    }
  }

  // Manual transaction submission
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError(
        'Select a case before analyzing transaction features.',
      )
      return
    }

    const invalidFeatures = FEATURE_NAMES.filter((featureName) => {
      const value = featureValues[featureName].trim()

      return (
        value === '' ||
        !Number.isFinite(Number(value))
      )
    })

    setValidationErrors(invalidFeatures)

    if (invalidFeatures.length) {
      setAnalysisError(
        'Enter a finite numerical value for every feature before analysis.',
      )
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeCreditCardFraud(
        Number(caseId),
        getNumericFeatures(),
      )

      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'The transaction features could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // CSV file selection and validation
  function handleCsvFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null

    setCsvError('')
    setCsvResult(null)

    if (!file) {
      setCsvFile(null)
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvFile(null)
      setCsvError('Please select a CSV file.')
      event.target.value = ''
      return
    }

    if (file.size === 0) {
      setCsvFile(null)
      setCsvError('The selected CSV file is empty.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_CSV_SIZE) {
      setCsvFile(null)
      setCsvError('CSV file must be 5 MB or smaller.')
      event.target.value = ''
      return
    }

    setCsvFile(file)
  }

  // CSV batch submission
  async function handleCsvSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (csvSubmissionLock.current) return

    setCsvError('')
    setCsvResult(null)

    if (!caseId) {
      setCsvError(
        'Select an investigation case before uploading the CSV.',
      )
      return
    }

    if (!csvFile) {
      setCsvError('Please select a CSV file before uploading.')
      return
    }

    if (csvFile.size > MAX_CSV_SIZE) {
      setCsvError('CSV file must be 5 MB or smaller.')
      return
    }

    csvSubmissionLock.current = true
    setIsUploadingCsv(true)

    try {
      const response = await analyzeCreditCardFraudCsv(
        Number(caseId),
        csvFile,
      )

      setCsvResult(response)
    } catch (error) {
      setCsvError(
        getApiErrorMessage(
          error,
          'CSV batch analysis failed. Please try again.',
        ),
      )
    } finally {
      csvSubmissionLock.current = false
      setIsUploadingCsv(false)
    }
  }

  function updateFeature(
    featureName: CreditCardFraudFeatureName,
    value: string,
  ) {
    setFeatureValues((current) => ({
      ...current,
      [featureName]: value,
    }))

    setValidationErrors((current) =>
      current.filter(
        (invalidFeature) => invalidFeature !== featureName,
      ),
    )

    setResult(null)
    setAnalysisError('')
  }

  function resetAnalysis() {
    setFeatureValues(createEmptyFeatureValues())
    setValidationErrors([])
    setResult(null)
    setAnalysisError('')
  }

  function resetCsvAnalysis() {
    setCsvFile(null)
    setCsvResult(null)
    setCsvError('')

    const input = document.getElementById(
      'credit-fraud-csv',
    ) as HTMLInputElement | null

    if (input) input.value = ''
  }

  function retryCases() {
    setIsLoadingCases(true)
    setCasesError('')

    getCases()
      .then((data) => {
        setCases(data)

        setCaseId((current) =>
          data.some(
            (caseItem) => String(caseItem.id) === current,
          )
            ? current
            : data[0]
              ? String(data[0].id)
              : '',
        )
      })
      .catch((error: unknown) => {
        setCasesError(
          getApiErrorMessage(
            error,
            'Your cases could not be loaded.',
          ),
        )
      })
      .finally(() => setIsLoadingCases(false))
  }

  function renderFeatureInput(
    featureName: CreditCardFraudFeatureName,
  ) {
    const hasError = validationErrors.includes(featureName)

    return (
      <div key={featureName} className="space-y-1.5">
        <label
          htmlFor={`credit-feature-${featureName}`}
          className="block text-xs font-medium text-slate-300"
        >
          {featureName}
          <span className="ml-1 text-red-300" aria-hidden="true">
            *
          </span>
        </label>

        <input
          id={`credit-feature-${featureName}`}
          type="number"
          step="any"
          inputMode="decimal"
          value={featureValues[featureName]}
          onChange={(event) =>
            updateFeature(featureName, event.target.value)
          }
          required
          disabled={isAnalyzing}
          aria-invalid={hasError}
          aria-describedby={
            hasError
              ? `credit-feature-error-${featureName}`
              : undefined
          }
          className={`w-full rounded-lg border bg-[#242629] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:ring-4 disabled:opacity-60 ${
            hasError
              ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/10'
              : 'border-white/10 hover:border-white/20 focus:border-blue-500 focus:ring-blue-500/10'
          }`}
          placeholder="Enter value"
        />

        {hasError && (
          <p
            id={`credit-feature-error-${featureName}`}
            className="text-[11px] text-red-300"
          >
            Enter a finite number.
          </p>
        )}
      </div>
    )
  }

  const selectedCase = cases.find(
    (caseItem) => String(caseItem.id) === caseId,
  )

  const readyFeatureCount = FEATURE_NAMES.filter((featureName) => {
    const value = featureValues[featureName].trim()

    return (
      value !== '' &&
      Number.isFinite(Number(value))
    )
  }).length

  const isBusy = isAnalyzing || isUploadingCsv

  return (
    <section className="mx-auto max-w-6xl space-y-6">

      {/* Page heading */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Credit Card Fraud Detection
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Analyze individual transactions or upload a CSV
          containing multiple transactions using the trained
          Random Forest model.
        </p>
      </header>

      {/* Case loading errors */}
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

      {/* Common investigation case selector */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6">
        <label
          htmlFor="credit-fraud-case"
          className="block text-sm font-semibold text-slate-200"
        >
          Investigation case
        </label>

        <select
          id="credit-fraud-case"
          value={caseId}
          onChange={(event) => {
            setCaseId(event.target.value)
            setResult(null)
            setCsvResult(null)
            setAnalysisError('')
            setCsvError('')
          }}
          disabled={
            isLoadingCases ||
            cases.length === 0 ||
            isBusy
          }
          required
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
        >
          {cases.length === 0 && (
            <option value="">
              {isLoadingCases
                ? 'Loading cases…'
                : 'No cases available'}
            </option>
          )}

          {cases.map((caseItem) => (
            <option
              key={caseItem.id}
              value={caseItem.id}
            >
              {caseItem.case_number} — {caseItem.title}
            </option>
          ))}
        </select>

        {selectedCase && (
          <p className="mt-2 text-xs text-slate-500">
            Analysis findings will be saved to{' '}
            <span className="font-medium text-slate-300">
              {selectedCase.case_number} — {selectedCase.title}
            </span>
          </p>
        )}
      </div>

      {/* Analysis mode selector */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#303236] p-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setAnalysisMode('manual')
            setAnalysisError('')
            setCsvError('')
          }}
          disabled={isBusy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
            analysisMode === 'manual'
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/10'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <CreditCard size={17} aria-hidden="true" />
          Manual Transaction
        </button>

        <button
          type="button"
          onClick={() => {
            setAnalysisMode('csv')
            setAnalysisError('')
            setCsvError('')
          }}
          disabled={isBusy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
            analysisMode === 'csv'
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/10'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <FileSpreadsheet size={17} aria-hidden="true" />
          CSV Batch Analysis
        </button>
      </div>

      {/* Manual analysis error */}
      {analysisMode === 'manual' && analysisError && (
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

      {/* CSV analysis error */}
      {analysisMode === 'csv' && csvError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{csvError}</span>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">

        {/* Main analysis panel */}
        <div>

          {/* MANUAL TRANSACTION MODE */}
          {analysisMode === 'manual' && (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <CreditCard size={21} aria-hidden="true" />
                </span>

                <div>
                  <h2 className="text-base font-semibold text-white">
                    Transaction features
                  </h2>

                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Provide all 30 finite numeric features
                    expected by the model.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-6">

                <fieldset className="space-y-4 rounded-xl border border-white/[0.07] bg-[#292b2e] p-4 sm:p-5">
                  <legend className="px-2 text-sm font-semibold text-slate-100">
                    Transaction information
                  </legend>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {TRANSACTION_FEATURES.map(renderFeatureInput)}
                  </div>
                </fieldset>

                <fieldset className="space-y-4 rounded-xl border border-white/[0.07] bg-[#292b2e] p-4 sm:p-5">
                  <legend className="px-2 text-sm font-semibold text-slate-100">
                    PCA-transformed features
                  </legend>

                  <p className="-mt-1 text-xs leading-relaxed text-slate-500">
                    V1–V28 are transformed numerical features,
                    not ordinary card details. Use values from
                    an appropriate, authorized source.
                  </p>

                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                    {PCA_FEATURES.map(renderFeatureInput)}
                  </div>
                </fieldset>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {readyFeatureCount} of 30 numeric values entered
                </p>

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={resetAnalysis}
                    disabled={isAnalyzing}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 sm:py-2.5"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Reset
                  </button>

                  <button
                    type="submit"
                    disabled={
                      isAnalyzing ||
                      isLoadingCases ||
                      !caseId ||
                      readyFeatureCount !== FEATURE_NAMES.length
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

                    {isAnalyzing
                      ? 'Analyzing transaction…'
                      : 'Analyze transaction'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* CSV BATCH ANALYSIS MODE */}
          {analysisMode === 'csv' && (
            <form
              onSubmit={handleCsvSubmit}
              className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <FileSpreadsheet size={21} aria-hidden="true" />
                </span>

                <div>
                  <h2 className="text-base font-semibold text-white">
                    CSV Batch Analysis
                  </h2>

                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Upload a CSV file containing multiple
                    credit card transactions.
                  </p>
                </div>
              </div>

              <div className="mt-7 space-y-5">

                {/* File upload area */}
                <div>
                  <label
                    htmlFor="credit-fraud-csv"
                    className="mb-2 block text-sm font-medium text-slate-200"
                  >
                    Select CSV file
                  </label>

                  <label
                    htmlFor="credit-fraud-csv"
                    className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-[#242629] px-5 py-10 text-center transition hover:border-blue-400/50 hover:bg-blue-500/[0.04]"
                  >
                    <span className="flex size-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                      <Upload size={25} aria-hidden="true" />
                    </span>

                    <p className="mt-4 text-sm font-semibold text-white">
                      Click to select your CSV file
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      CSV format · Maximum file size 5 MB
                    </p>

                    <input
                      id="credit-fraud-csv"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCsvFileChange}
                      disabled={isUploadingCsv}
                      className="sr-only"
                    />
                  </label>
                </div>

                {/* Selected file */}
                {csvFile && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-400/20 bg-blue-500/[0.06] p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileSpreadsheet
                        size={22}
                        className="shrink-0 text-blue-300"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {csvFile.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {(csvFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={resetCsvAnalysis}
                      disabled={isUploadingCsv}
                      aria-label="Remove selected CSV"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  </div>
                )}

                {/* Required columns */}
                <div className="rounded-xl border border-white/[0.07] bg-[#292b2e] p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Required CSV columns
                  </h3>

                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    Your CSV must contain all 30 model features.
                    The optional Class column is ignored.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {FEATURE_NAMES.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-md border border-white/10 bg-[#242629] px-2 py-1 font-mono text-[11px] text-slate-300"
                      >
                        {feature}
                      </span>
                    ))}

                    <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 font-mono text-[11px] text-amber-200">
                      Class (optional)
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      size={18}
                      className="mt-0.5 shrink-0 text-amber-300"
                      aria-hidden="true"
                    />

                    <div>
                      <h3 className="text-sm font-semibold text-amber-100">
                        Important data requirements
                      </h3>

                      <p className="mt-2 text-xs leading-relaxed text-slate-400">
                        Time, V1–V28 and Amount must contain
                        finite numeric values. Use data with
                        compatible feature definitions and
                        preprocessing. Do not upload card
                        numbers, CVV, PINs or banking credentials.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* CSV buttons */}
              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {csvFile
                    ? 'CSV file ready for analysis'
                    : 'No CSV file selected'}
                </p>

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={resetCsvAnalysis}
                    disabled={isUploadingCsv}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 sm:py-2.5"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Reset
                  </button>

                  <button
                    type="submit"
                    disabled={
                      isUploadingCsv ||
                      isLoadingCases ||
                      !caseId ||
                      !csvFile
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
                  >
                    {isUploadingCsv ? (
                      <LoaderCircle
                        size={16}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ScanSearch size={16} aria-hidden="true" />
                    )}

                    {isUploadingCsv
                      ? 'Analyzing CSV…'
                      : 'Analyze CSV'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Information sidebar */}
        <aside className="space-y-4">

          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-amber-300"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-amber-100">
                  Do not enter payment-card details
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  This module does not request card numbers,
                  CVV, expiry dates, PINs or banking credentials.
                  V1–V28 are transformed model features.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-blue-300"
                aria-hidden="true"
              />

              <div>
                <h2 className="text-sm font-semibold text-blue-100">
                  AI-assisted assessment
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  This is an experimental decision-support
                  estimate, not a guarantee of fraud detection.
                  Incompatible or synthetic feature values may
                  produce misleading results.
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
              Successful case-linked analysis is automatically
              saved to the selected investigation case and
              returns a finding ID.
            </p>
          </div>
        </aside>
      </div>

      {/* MANUAL TRANSACTION RESULT */}
      {analysisMode === 'manual' && result && (
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
            </div>

            <span
              className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
            >
              {result.severity} severity
            </span>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">
            {[
              {
                label: 'Prediction',
                value: result.prediction,
              },
              {
                label: 'Confidence',
                value: formatProbability(result.confidence),
              },
              {
                label: 'Fraud probability',
                value: formatProbability(result.fraud_probability),
              },
              {
                label: 'Legitimate probability',
                value: formatProbability(result.legitimate_probability),
              },
              {
                label: 'Decision threshold',
                value: formatProbability(result.threshold),
              },
              {
                label: 'Model',
                value: `${result.model} · ${result.input_features} features`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/[0.07] bg-[#242629] p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {item.label}
                </p>

                <p className="mt-2 break-words text-lg font-semibold text-white">
                  {item.value}
                </p>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                  Finding saved to case #{result.case_id}
                  {selectedCase
                    ? ` · ${selectedCase.case_number}`
                    : ''}
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

      {/* CSV BATCH RESULT */}
      {analysisMode === 'csv' && csvResult && (
        <section
          aria-live="polite"
          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#303236]"
        >
          <div className="flex flex-col gap-3 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-400">
                Batch analysis completed
              </p>

              <h2 className="mt-1.5 text-lg font-semibold text-white">
                Credit Card Fraud Detection
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                File: {csvResult.filename}
              </p>
            </div>

            <span className="inline-flex self-start items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <BadgeCheck size={15} aria-hidden="true" />
              Analysis completed
            </span>
          </div>

          {/* Summary cards */}
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-7">

            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total transactions
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {csvResult.total_transactions}
              </p>
            </div>

            <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-300/70">
                Fraudulent
              </p>

              <p className="mt-2 text-2xl font-bold text-red-300">
                {csvResult.fraudulent_transactions}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                Legitimate
              </p>

              <p className="mt-2 text-2xl font-bold text-emerald-300">
                {csvResult.legitimate_transactions}
              </p>
            </div>

            <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/70">
                Fraud percentage
              </p>

              <p className="mt-2 text-2xl font-bold text-amber-300">
                {csvResult.fraud_percentage.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Model information */}
          <div className="mx-5 grid gap-3 rounded-xl border border-white/[0.07] bg-[#242629] p-4 sm:mx-7 sm:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Model
              </p>

              <p className="mt-1 text-sm font-semibold text-white">
                {csvResult.model}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Decision threshold
              </p>

              <p className="mt-1 text-sm font-semibold text-white">
                {formatProbability(csvResult.threshold)}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Finding ID
              </p>

              <p className="mt-1 text-sm font-semibold text-emerald-300">
                #{csvResult.finding_id}
              </p>
            </div>
          </div>

          {/* Transaction results table */}
          <div className="p-5 sm:p-7">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-white">
                Transaction-level predictions
              </h3>

              <p className="text-xs text-slate-500">
                {csvResult.results.length} transactions processed
              </p>
            </div>

            <div className="max-h-[480px] overflow-auto rounded-xl border border-white/[0.08]">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#242629]">
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold">
                      Transaction
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Prediction
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Fraud probability
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Legitimate probability
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Class
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {csvResult.results.map((transaction) => (
                    <tr
                      key={transaction.transaction_index}
                      className="border-b border-white/[0.05] transition hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3 font-medium text-slate-200">
                        #{transaction.transaction_index}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                            transaction.class === 1
                              ? 'border-red-400/20 bg-red-400/10 text-red-300'
                              : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                          }`}
                        >
                          {transaction.prediction}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-medium text-red-300">
                        {formatProbability(
                          transaction.fraud_probability,
                        )}
                      </td>

                      <td className="px-4 py-3 font-medium text-emerald-300">
                        {formatProbability(
                          transaction.legitimate_probability,
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {transaction.class}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Finding confirmation */}
          <div className="mx-5 mb-5 flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:mx-7 sm:mb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/70">
                Finding saved to case #{csvResult.case_id}
                {selectedCase
                  ? ` · ${selectedCase.case_number}`
                  : ''}
              </p>

              <p className="mt-1 text-sm font-medium text-emerald-200">
                {csvResult.message}
              </p>
            </div>

            <span className="self-start rounded-lg border border-emerald-300/15 bg-black/10 px-3 py-2 font-mono text-xs text-emerald-200">
              Finding #{csvResult.finding_id}
            </span>
          </div>
        </section>
      )}
    </section>
  )
}
