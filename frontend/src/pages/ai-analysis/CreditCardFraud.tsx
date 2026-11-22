import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
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
import { getEvidenceByCase, type Evidence } from '../../services/evidenceService'

import {
  analyzeCreditCardFraud,
  analyzeCreditCardFraudCsv,
  analyzeCreditCardFraudEvidence,
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

function createEmptyFeatureValues(): Record<CreditCardFraudFeatureName, string> {
  return Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, '']),
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
          'missing_features' in detail && Array.isArray(detail.missing_features)
            ? detail.missing_features.filter((f): f is string => typeof f === 'string')
            : []

        const unexpected =
          'unexpected_features' in detail && Array.isArray(detail.unexpected_features)
            ? detail.unexpected_features.filter((f): f is string => typeof f === 'string')
            : []

        const invalidCells =
          'invalid_cells' in detail && Array.isArray(detail.invalid_cells)
            ? detail.invalid_cells.slice(0, 10).map((cell: unknown) => {
                if (
                  typeof cell !== 'object' ||
                  cell === null ||
                  !('row' in cell) ||
                  !('column' in cell)
                ) return null

                return `Row ${cell.row}, column ${cell.column}`
              }).filter((v): v is string => v !== null)
            : []

        const details = [
          detailMessage,
          missing.length ? `Missing: ${missing.join(', ')}.` : null,
          unexpected.length ? `Unexpected: ${unexpected.join(', ')}.` : null,
          invalidCells.length ? `Invalid values at ${invalidCells.join('; ')}.` : null,
        ].filter((v): v is string => v !== null)

        if (details.length) return details.join(' ')
      }

      if (Array.isArray(detail)) {
        const messages = detail.map((item: unknown) => {
          if (typeof item !== 'object' || item === null) return null

          const message = 'msg' in item && typeof item.msg === 'string' ? item.msg : null
          if (!message) return null

          const location =
            'loc' in item && Array.isArray(item.loc)
              ? item.loc.filter((p): p is string | number =>
                  typeof p === 'string' || typeof p === 'number')
              : []

          return location.length
            ? `${location.slice(1).join('.') || location.join('.')}: ${message}`
            : message
        }).filter((v): v is string => v !== null)

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

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function getPredictionLabel(prediction: unknown): string {
  if (typeof prediction === 'number') return prediction === 1 ? 'Fraudulent' : 'Legitimate'

  const value = String(prediction).toUpperCase()
  if (['1', 'FRAUD', 'FRAUDULENT', 'TRUE'].includes(value)) return 'Fraudulent'

  return 'Legitimate'
}

function getPredictionStyle(prediction: unknown): string {
  return getPredictionLabel(prediction) === 'Fraudulent'
    ? 'border-red-400/30 bg-red-400/10 text-red-600 dark:text-red-300'
    : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'
}

export default function CreditCardFraud() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [analysisMode, setAnalysisMode] = useState<'manual' | 'csv'>('manual')

  const [featureValues, setFeatureValues] = useState<Record<CreditCardFraudFeatureName, string>>(
    createEmptyFeatureValues,
  )
  const [validationErrors, setValidationErrors] = useState<CreditCardFraudFeatureName[]>([])
  const [result, setResult] = useState<CreditCardFraudResponse | null>(null)

  const [csvSource, setCsvSource] = useState<'upload' | 'evidence'>('upload')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvResult, setCsvResult] = useState<CreditCardFraudBatchResponse | null>(null)
  const [csvError, setCsvError] = useState('')
  const [isUploadingCsv, setIsUploadingCsv] = useState(false)

  const [evidenceList, setEvidenceList] = useState<Evidence[]>([])
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('')
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false)

  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const submissionLock = useRef(false)
  const csvSubmissionLock = useRef(false)

  // Load cases
  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (!active) return
        setCases(data)
        setCaseId(data[0] ? String(data[0].id) : '')
      })
      .catch((error: unknown) => {
        if (active) setCasesError(getApiErrorMessage(error, 'Your cases could not be loaded.'))
      })
      .finally(() => {
        if (active) setIsLoadingCases(false)
      })

    return () => { active = false }
  }, [])

  // Load CSV evidence whenever the selected case changes
  useEffect(() => {
    let active = true

    setEvidenceList([])
    setSelectedEvidenceId('')
    setCsvResult(null)
    setCsvError('')

    if (!caseId) {
      setIsLoadingEvidence(false)
      return
    }

    setIsLoadingEvidence(true)

    getEvidenceByCase(Number(caseId))
      .then((data) => {
        if (!active) return

        const csvEvidence = data.filter((item) => {
          const isCsv = item.original_filename.toLowerCase().endsWith('.csv')
          return isCsv && item.file_size > 0 && item.file_size <= MAX_CSV_SIZE
        })

        setEvidenceList(csvEvidence)
      })
      .catch((error: unknown) => {
        if (active) {
          setCsvError(getApiErrorMessage(error, 'Could not load case evidence.'))
        }
      })
      .finally(() => {
        if (active) setIsLoadingEvidence(false)
      })

    return () => { active = false }
  }, [caseId])

function getNumericFeatures(): CreditCardFraudFeatures {
  const features = Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, Number(featureValues[name])]),
  )

  return features as unknown as CreditCardFraudFeatures
}
  // Manual transaction analysis
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select a case before analyzing transaction features.')
      return
    }

    const invalidFeatures = FEATURE_NAMES.filter((name => {
      const value = featureValues[name].trim()
      return value === '' || !Number.isFinite(Number(value))
    }))

    setValidationErrors(invalidFeatures)

    if (invalidFeatures.length) {
      setAnalysisError('Enter a finite numerical value for every feature before analysis.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeCreditCardFraud(Number(caseId), getNumericFeatures())
      setResult(analysis)
    } catch (error) {
      setAnalysisError(getApiErrorMessage(error, 'The transaction features could not be analyzed. Please try again.'))
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
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

  // Analyze an uploaded CSV or existing evidence
  async function handleCsvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (csvSubmissionLock.current) return

    setCsvError('')
    setCsvResult(null)

    if (!caseId) {
      setCsvError('Select an investigation case before analyzing CSV data.')
      return
    }

    if (csvSource === 'upload') {
      if (!csvFile) {
        setCsvError('Please select a CSV file before uploading.')
        return
      }

      if (csvFile.size > MAX_CSV_SIZE) {
        setCsvError('CSV file must be 5 MB or smaller.')
        return
      }
    } else if (!selectedEvidenceId) {
      setCsvError('Select a CSV evidence file from this case.')
      return
    }

    csvSubmissionLock.current = true
    setIsUploadingCsv(true)

    try {
      const response = csvSource === 'upload'
        ? await analyzeCreditCardFraudCsv(Number(caseId), csvFile!)
        : await analyzeCreditCardFraudEvidence(Number(caseId), Number(selectedEvidenceId))

      setCsvResult(response)
    } catch (error) {
      setCsvError(getApiErrorMessage(error, 'CSV batch analysis failed. Please try again.'))
    } finally {
      csvSubmissionLock.current = false
      setIsUploadingCsv(false)
    }
  }

  function updateFeature(featureName: CreditCardFraudFeatureName, value: string) {
    setFeatureValues((current) => ({ ...current, [featureName]: value }))
    setValidationErrors((current) => current.filter((name) => name !== featureName))
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
    setSelectedEvidenceId('')
    setCsvResult(null)
    setCsvError('')

    const input = document.getElementById('credit-fraud-csv') as HTMLInputElement | null
    if (input) input.value = ''
  }

  function retryCases() {
    setIsLoadingCases(true)
    setCasesError('')

    getCases()
      .then((data) => {
        setCases(data)
        setCaseId((current) =>
          data.some((item) => String(item.id) === current)
            ? current
            : data[0] ? String(data[0].id) : '',
        )
      })
      .catch((error: unknown) => {
        setCasesError(getApiErrorMessage(error, 'Your cases could not be loaded.'))
      })
      .finally(() => setIsLoadingCases(false))
  }

  function renderFeatureInput(featureName: CreditCardFraudFeatureName) {
    const hasError = validationErrors.includes(featureName)

    return (
      <div key={featureName} className="space-y-1.5">
        <label htmlFor={`credit-feature-${featureName}`} className="block text-xs font-medium text-[var(--text-secondary)]">
          {featureName}<span className="ml-1 text-red-500" aria-hidden="true">*</span>
        </label>

        <input
          id={`credit-feature-${featureName}`}
          type="number"
          step="any"
          inputMode="decimal"
          value={featureValues[featureName]}
          onChange={(event) => updateFeature(featureName, event.target.value)}
          required
          disabled={isAnalyzing}
          aria-invalid={hasError}
          aria-describedby={hasError ? `credit-feature-error-${featureName}` : undefined}
          className={`theme-input w-full rounded-lg px-3 py-2.5 text-sm outline-none transition placeholder:text-[var(--text-muted)] focus:ring-4 disabled:opacity-60 ${hasError ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/10' : 'hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/10'}`}
          placeholder="Enter value"
        />

        {hasError && (
          <p id={`credit-feature-error-${featureName}`} className="text-[11px] text-red-500 dark:text-red-300">
            Enter a finite number.
          </p>
        )}
      </div>
    )
  }

  const selectedCase = cases.find((item) => String(item.id) === caseId)
  const readyFeatureCount = FEATURE_NAMES.filter((name => {
    const value = featureValues[name].trim()
    return value !== '' && Number.isFinite(Number(value))
  })).length
  const isBusy = isAnalyzing || isUploadingCsv

  return (
    <section className="mx-auto max-w-6xl space-y-6 theme-text">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7954c8] dark:text-[#b6a1f5]">AI Analysis</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">Credit Card Fraud Detection</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
          Analyze individual transactions or CSV datasets using the trained Random Forest model.
        </p>
      </header>

      {casesError && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-400/30 bg-red-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300"><AlertCircle size={17} />{casesError}</p>
          <button type="button" onClick={retryCases} className="self-start rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-400/10 dark:text-red-200 sm:self-auto">Retry</button>
        </div>
      )}

      {/* Case selector */}
      <div className="theme-card p-5 sm:p-6">
        <label htmlFor="credit-fraud-case" className="block text-sm font-semibold text-[var(--text-primary)]">Investigation case</label>
        <select
          id="credit-fraud-case"
          value={caseId}
          onChange={(event) => {
            setCaseId(event.target.value)
            setResult(null)
            setCsvResult(null)
            setAnalysisError('')
            setCsvError('')
            setCsvFile(null)
            setSelectedEvidenceId('')
          }}
          disabled={isLoadingCases || cases.length === 0 || isBusy}
          required
          className="theme-input mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 disabled:opacity-60"
        >
          {cases.length === 0 && <option value="">{isLoadingCases ? 'Loading cases…' : 'No cases available'}</option>}
          {cases.map((item) => <option key={item.id} value={item.id}>{item.case_number} — {item.title}</option>)}
        </select>
        {selectedCase && <p className="mt-2 text-xs text-[var(--text-muted)]">Findings saved to <span className="font-medium text-[var(--text-secondary)]">{selectedCase.case_number} — {selectedCase.title}</span></p>}
      </div>

      {/* Mode selector */}
      <div className="theme-card flex flex-col gap-2 p-2 sm:flex-row">
        <button type="button" onClick={() => { setAnalysisMode('manual'); setAnalysisError(''); setCsvError('') }} disabled={isBusy} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${analysisMode === 'manual' ? 'bg-[#9b82e8] text-white shadow-lg shadow-[#9b82e8]/10' : 'text-[var(--text-secondary)] theme-hover hover:text-[var(--text-primary)]'}`}>
          <CreditCard size={17} />Manual Transaction
        </button>
        <button type="button" onClick={() => { setAnalysisMode('csv'); setAnalysisError(''); setCsvError('') }} disabled={isBusy} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${analysisMode === 'csv' ? 'bg-[#9b82e8] text-white shadow-lg shadow-[#9b82e8]/10' : 'text-[var(--text-secondary)] theme-hover hover:text-[var(--text-primary)]'}`}>
          <FileSpreadsheet size={17} />CSV Batch Analysis
        </button>
      </div>

      {analysisMode === 'manual' && analysisError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{analysisError}</span></p>
      )}
      {analysisMode === 'csv' && csvError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{csvError}</span></p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div>
          {/* Manual input form */}
          {analysisMode === 'manual' && (
            <form onSubmit={handleSubmit} noValidate className="theme-card p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/10 text-[#7954c8] dark:text-[#b6a1f5"><CreditCard size={21} /></span>
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Transaction features</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Provide all 30 finite numeric features expected by the model.</p>
                </div>
              </div>

              <div className="mt-6 space-y-6">
                <fieldset className="theme-card-secondary space-y-4 p-4 sm:p-5">
                  <legend className="px-2 text-sm font-semibold text-[var(--text-primary)]">Transaction information</legend>
                  <div className="grid gap-4 sm:grid-cols-2">{TRANSACTION_FEATURES.map(renderFeatureInput)}</div>
                </fieldset>
                <fieldset className="theme-card-secondary space-y-4 p-4 sm:p-5">
                  <legend className="px-2 text-sm font-semibold text-[var(--text-primary)]">PCA-transformed features</legend>
                  <p className="-mt-1 text-xs leading-relaxed text-[var(--text-muted)]">V1–V28 are transformed numerical features, not ordinary card details. Use values from an appropriate, authorized source.</p>
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">{PCA_FEATURES.map(renderFeatureInput)}</div>
                </fieldset>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 border-t theme-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--text-muted)]">{readyFeatureCount} of 30 numeric values entered</p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" onClick={resetAnalysis} disabled={isAnalyzing} className="theme-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition theme-hover disabled:opacity-50 sm:py-2.5"><RotateCcw size={15} />Reset</button>
                  <button type="submit" disabled={isAnalyzing || isLoadingCases || !caseId || readyFeatureCount !== FEATURE_NAMES.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#9b82e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8b72d9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#9b82e8]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5">
                    {isAnalyzing ? <LoaderCircle size={16} className="animate-spin" /> : <ScanSearch size={16} />}
                    {isAnalyzing ? 'Analyzing transaction…' : 'Analyze transaction'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* CSV analysis form */}
          {analysisMode === 'csv' && (
            <form onSubmit={handleCsvSubmit} className="theme-card p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/10 text-[#7954c8] dark:text-[#b6a1f5]"><FileSpreadsheet size={21} /></span>
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">CSV Batch Analysis</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Analyze a CSV upload or an existing CSV evidence file linked to this case.</p>
                </div>
              </div>

              {/* Source selector */}
              <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border theme-divider bg-[var(--bg-input)] p-2">
                <button type="button" onClick={() => { setCsvSource('upload'); setCsvError(''); setCsvResult(null); setSelectedEvidenceId('') }} disabled={isUploadingCsv} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${csvSource === 'upload' ? 'bg-[#9b82e8] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                  <Upload size={15} className="mr-2 inline" />Upload CSV
                </button>
                <button type="button" onClick={() => { setCsvSource('evidence'); setCsvError(''); setCsvResult(null); setCsvFile(null) }} disabled={isUploadingCsv} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${csvSource === 'evidence' ? 'bg-[#9b82e8] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                  <FileSpreadsheet size={15} className="mr-2 inline" />Existing Evidence
                </button>
              </div>

              {/* Upload file picker */}
              {csvSource === 'upload' && (
                <div className="mt-5">
                  <label htmlFor="credit-fraud-csv" className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">Select CSV file</label>
                  <label htmlFor="credit-fraud-csv" className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-input)] px-5 py-10 text-center transition hover:border-[#9b82e8]/50 hover:bg-[#9b82e8]/[0.04]">
                    <span className="flex size-14 items-center justify-center rounded-2xl border border-[#9b82e8]/20 bg-[#9b82e8]/10 text-[#7954c8] dark:text-[#b6a1f5]"><Upload size={25} /></span>
                    <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Click to select your CSV file</p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">CSV format · Maximum file size 5 MB</p>
                    <input id="credit-fraud-csv" type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} disabled={isUploadingCsv} className="sr-only" />
                  </label>
                </div>
              )}

              {/* Existing evidence dropdown */}
              {csvSource === 'evidence' && (
                <div className="mt-5">
                  <label htmlFor="credit-fraud-evidence" className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">Select existing CSV evidence</label>
                  <select id="credit-fraud-evidence" value={selectedEvidenceId} onChange={(event) => { setSelectedEvidenceId(event.target.value); setCsvError(''); setCsvResult(null) }} disabled={isLoadingEvidence || isUploadingCsv || evidenceList.length === 0} className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 disabled:opacity-60">
                    <option value="">{isLoadingEvidence ? 'Loading evidence…' : evidenceList.length ? 'Choose CSV evidence' : 'No eligible CSV evidence found'}</option>
                    {evidenceList.map((evidence) => (
                      <option key={evidence.id} value={evidence.id}>
                        {evidence.original_filename} — {(evidence.file_size / 1024).toFixed(1)} KB
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Only CSV evidence belonging to the selected case and within the 5 MB limit is listed.
                  </p>
                  {!isLoadingEvidence && evidenceList.length === 0 && (
                    <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-amber-700 dark:text-amber-200">
                      No eligible CSV evidence is available for this case. Upload a CSV through the Evidence section first, or switch to Upload CSV.
                    </p>
                  )}
                </div>
              )}

              {/* Selected uploaded file */}
              {csvSource === 'upload' && csvFile && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/[0.06] p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileSpreadsheet size={22} className="shrink-0 text-[#7954c8] dark:text-[#b6a1f5]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{csvFile.name}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{(csvFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                  <button type="button" onClick={resetCsvAnalysis} disabled={isUploadingCsv} aria-label="Remove selected CSV" className="rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/10 disabled:opacity-50"><X size={17} /></button>
                </div>
              )}

              {/* CSV column requirements */}
              <div className="theme-card-secondary mt-5 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Required CSV columns</h3>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">Your CSV must contain all 30 model features. The optional Class column is ignored.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {FEATURE_NAMES.map((feature) => <span key={feature} className="rounded-md border theme-divider bg-[var(--bg-card)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">{feature}</span>)}
                  <span className="rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-2 py-1 font-mono text-[11px] text-amber-700 dark:text-amber-200">Class (optional)</span>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.045] p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-100">Important data requirements</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">Time, V1–V28 and Amount must contain finite numeric values. Use data with compatible feature definitions and preprocessing. Do not upload card numbers, CVV, PINs or banking credentials.</p>
                  </div>
                </div>
              </div>

              {/* CSV action buttons */}
              <div className="mt-6 flex flex-col-reverse gap-3 border-t theme-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--text-muted)]">
                  {csvSource === 'upload'
                    ? csvFile ? 'CSV file ready for analysis' : 'No CSV file selected'
                    : selectedEvidenceId ? 'Existing evidence selected' : 'No evidence selected'}
                </p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" onClick={resetCsvAnalysis} disabled={isUploadingCsv} className="theme-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition theme-hover disabled:opacity-50 sm:py-2.5"><RotateCcw size={15} />Reset</button>
                  <button type="submit" disabled={isUploadingCsv || isLoadingCases || isLoadingEvidence || !caseId || (csvSource === 'upload' ? !csvFile : !selectedEvidenceId)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#9b82e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8b72d9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#9b82e8]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5">
                    {isUploadingCsv ? <LoaderCircle size={16} className="animate-spin" /> : <ScanSearch size={16} />}
                    {isUploadingCsv ? 'Analyzing CSV…' : csvSource === 'evidence' ? 'Analyze Existing Evidence' : 'Analyze CSV'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Information sidebar */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.045] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
              <div>
                <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-100">Do not enter payment-card details</h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">This module does not request card numbers, CVV, expiry dates, PINs or banking credentials. V1–V28 are transformed model features.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#69aef0]/30 bg-[#69aef0]/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert size={19} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-100">AI-assisted assessment</h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">This is an experimental decision-support estimate, not a guarantee of fraud detection. Incompatible or synthetic feature values may produce misleading results.</p>
              </div>
            </div>
          </div>

          <div className="theme-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <BadgeCheck size={17} className="text-emerald-600 dark:text-[#39b99b]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Automatically saved finding</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">Successful case-linked analysis is automatically saved to the selected investigation case and returns a finding ID.</p>
          </div>
        </aside>
      </div>

      {/* Manual result */}
      {analysisMode === 'manual' && result && (
        <section className="theme-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b theme-divider p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#7954c8] dark:text-[#b6a1f5]">Analysis result</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Transaction assessment</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">AI model prediction for the submitted transaction.</p>
            </div>
            <span className={`inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold ${getPredictionStyle(result.prediction)}`}><ShieldAlert size={16} />{getPredictionLabel(result.prediction)}</span>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Prediction</p><p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{getPredictionLabel(result.prediction)}</p></div>
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Confidence</p><p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{formatProbability(result.confidence)}</p></div>
              <div className="rounded-xl border border-red-400/30 bg-red-400/[0.07] p-4"><p className="text-xs text-red-600 dark:text-red-300">Fraud probability</p><p className="mt-2 text-xl font-semibold text-red-600 dark:text-red-300">{formatProbability(result.fraud_probability)}</p></div>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4"><p className="text-xs text-emerald-700 dark:text-emerald-300">Legitimate probability</p><p className="mt-2 text-xl font-semibold text-emerald-700 dark:text-emerald-300">{formatProbability(result.legitimate_probability)}</p></div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Detection threshold</p><p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{formatProbability(result.threshold)}</p></div>
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Model</p><p className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{result.model}</p></div>
            </div>
            {result.message && <p className="mt-5 rounded-xl border theme-divider bg-[var(--bg-input)] p-4 text-sm text-[var(--text-secondary)]">{result.message}</p>}
            <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
              <div className="flex items-start gap-3">
                <BadgeCheck size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Finding saved successfully</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Finding ID: <span className="font-mono text-[var(--text-primary)]">{result.finding_id}</span></p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Case ID: {result.case_id}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CSV batch result */}
      {analysisMode === 'csv' && csvResult && (
        <section className="theme-card overflow-hidden">
          <div className="border-b theme-divider p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#7954c8] dark:text-[#b6a1f5]">Batch analysis result</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">CSV Transaction Analysis</h2>
                <p className="mt-1 break-all text-sm text-[var(--text-secondary)]">{csvResult.filename}</p>
              </div>
              <span className="inline-flex items-center gap-2 self-start rounded-full border border-[#9b82e8]/30 bg-[#9b82e8]/10 px-3 py-2 text-sm font-medium text-[#7954c8] dark:text-[#b6a1f5]"><FileSpreadsheet size={16} />Batch complete</span>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Total transactions</p><p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{csvResult.total_transactions}</p></div>
              <div className="rounded-xl border border-red-400/30 bg-red-400/[0.07] p-4"><p className="text-xs text-red-600 dark:text-red-300">Fraudulent</p><p className="mt-2 text-2xl font-semibold text-red-600 dark:text-red-300">{csvResult.fraudulent_transactions}</p></div>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4"><p className="text-xs text-emerald-700 dark:text-emerald-300">Legitimate</p><p className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{csvResult.legitimate_transactions}</p></div>
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Fraud percentage</p><p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{Number(csvResult.fraud_percentage).toFixed(2)}%</p></div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Detection threshold</p><p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{formatProbability(csvResult.threshold)}</p></div>
              <div className="theme-card-secondary p-4"><p className="text-xs text-[var(--text-secondary)]">Model</p><p className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{csvResult.model}</p></div>
            </div>

            {csvResult.message && <p className="mt-5 rounded-xl border theme-divider bg-[var(--bg-input)] p-4 text-sm text-[var(--text-secondary)]">{csvResult.message}</p>}

            {/* Transaction results table */}
            {csvResult.results?.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Transaction-level results</h3>
                  <p className="text-xs text-[var(--text-muted)]">{csvResult.results.length} records</p>
                </div>
                <div className="theme-scroll overflow-x-auto rounded-xl border theme-divider">
                  <table className="theme-table min-w-full divide-y theme-divider text-sm">
                    <thead className="theme-table-header">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold">Transaction</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold">Prediction</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold">Fraud probability</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold">Legitimate probability</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold">Class</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y theme-divider">
                      {csvResult.results.map((transaction, index) => (
                        <tr key={transaction.transaction_index ?? index} className="theme-hover transition">
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">#{transaction.transaction_index ?? index + 1}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPredictionStyle(transaction.prediction)}`}>{getPredictionLabel(transaction.prediction)}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-red-600 dark:text-red-300">{formatProbability(transaction.fraud_probability)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-700 dark:text-emerald-300">{formatProbability(transaction.legitimate_probability)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{transaction.class ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Finding confirmation */}
            <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
              <div className="flex items-start gap-3">
                <BadgeCheck size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Batch finding saved successfully</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Finding ID: <span className="font-mono text-[var(--text-primary)]">{csvResult.finding_id}</span></p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Case ID: {csvResult.case_id}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </section>
  )
}
