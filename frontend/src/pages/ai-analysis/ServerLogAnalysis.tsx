import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  FileSpreadsheet,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  X,
  Database,
  RefreshCw,
} from 'lucide-react'

import { getCases, type Case } from '../../services/caseService'
import {
  analyzeServerLog,
  analyzeServerLogCsv,
  analyzeServerLogEvidence,
  type ServerLogAnalysisResponse,
  type ServerLogBatchResponse,
  type ServerLogFeatures,
} from '../../services/aiAnalysisService'
import { getEvidenceByCase, type Evidence } from '../../services/evidenceService'

type ServerLogFeatureName = keyof ServerLogFeatures

const FEATURE_NAMES = [
  'E1', 'E2', 'E3', 'E4', 'E5',
  'E6', 'E7', 'E8', 'E9', 'E10',
  'E11', 'E12', 'E13', 'E14', 'E15',
  'E16', 'E17', 'E18', 'E19', 'E20',
  'E21', 'E22', 'E23', 'E24', 'E25',
  'E26', 'E27', 'E28', 'E29',
] as const satisfies readonly ServerLogFeatureName[]

const MAX_CSV_SIZE = 5 * 1024 * 1024

function createEmptyFeatureValues(): Record<ServerLogFeatureName, string> {
  return {
    E1: '', E2: '', E3: '', E4: '', E5: '',
    E6: '', E7: '', E8: '', E9: '', E10: '',
    E11: '', E12: '', E13: '', E14: '', E15: '',
    E16: '', E17: '', E18: '', E19: '', E20: '',
    E21: '', E22: '', E23: '', E24: '', E25: '',
    E26: '', E27: '', E28: '', E29: '',
  }
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    const data: unknown = error.response.data

    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const detail = data.detail

      if (typeof detail === 'string') return detail

      if (Array.isArray(detail)) {
        const messages = detail
          .map((item: unknown) => {
            if (typeof item !== 'object' || item === null || !('msg' in item)) {
              return null
            }
            return typeof item.msg === 'string' ? item.msg : null
          })
          .filter((item): item is string => item !== null)

        if (messages.length) return messages.join(' ')
      }

      if (typeof detail === 'object' && detail !== null) {
        const message =
          'message' in detail && typeof detail.message === 'string'
            ? detail.message
            : null

        const missing =
          'missing_features' in detail && Array.isArray(detail.missing_features)
            ? detail.missing_features.filter((x): x is string => typeof x === 'string')
            : []

        const unexpected =
          'unexpected_features' in detail && Array.isArray(detail.unexpected_features)
            ? detail.unexpected_features.filter((x): x is string => typeof x === 'string')
            : []

        const column =
          'column' in detail && typeof detail.column === 'string'
            ? `Column: ${detail.column}.`
            : null

        const rows =
          'csv_rows' in detail && Array.isArray(detail.csv_rows)
            ? `CSV rows: ${detail.csv_rows.join(', ')}.`
            : null

        const parts = [
          message,
          missing.length ? `Missing: ${missing.join(', ')}.` : null,
          unexpected.length ? `Unexpected: ${unexpected.join(', ')}.` : null,
          column,
          rows,
        ].filter((x): x is string => x !== null)

        if (parts.length) return parts.join(' ')
      }
    }

    if (error.response.status === 401) {
      return 'Your session may have expired. Please sign in again.'
    }
    if (error.response.status === 404) {
      return 'Case or evidence not found, or access denied.'
    }
    if (error.response.status === 413) {
      return 'The uploaded CSV file exceeds the 5 MB size limit.'
    }
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

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function ServerLogAnalysis() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [featureValues, setFeatureValues] = useState<
    Record<ServerLogFeatureName, string>
  >(createEmptyFeatureValues)

  const [invalidFeatures, setInvalidFeatures] = useState<ServerLogFeatureName[]>([])
  const [result, setResult] = useState<ServerLogAnalysisResponse | null>(null)
  const [batchResult, setBatchResult] = useState<ServerLogBatchResponse | null>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)

  // Existing evidence states
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([])
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('')
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')
  const [isAnalyzingEvidence, setIsAnalyzingEvidence] = useState(false)

  const csvInputRef = useRef<HTMLInputElement>(null)

  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const submissionLock = useRef(false)
  const csvSubmissionLock = useRef(false)
  const evidenceSubmissionLock = useRef(false)

  // ---------------------------------------------------------
  // LOAD CASES
  // ---------------------------------------------------------

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
          setCasesError(getApiErrorMessage(error, 'Your cases could not be loaded.'))
        }
      })
      .finally(() => {
        if (active) setIsLoadingCases(false)
      })

    return () => {
      active = false
    }
  }, [])

  // ---------------------------------------------------------
  // LOAD EXISTING CSV EVIDENCE WHEN CASE CHANGES
  // ---------------------------------------------------------

  useEffect(() => {
    let active = true

    setEvidenceList([])
    setSelectedEvidenceId('')
    setEvidenceError('')

    if (!caseId) {
      setIsLoadingEvidence(false)
      return
    }

    setIsLoadingEvidence(true)

    getEvidenceByCase(Number(caseId))
      .then((data) => {
        if (!active) return

        // Only CSV evidence can be used for this analysis.
        const csvEvidence = data.filter((item) =>
          item.original_filename.toLowerCase().endsWith('.csv'),
        )

        setEvidenceList(csvEvidence)
      })
      .catch((error: unknown) => {
        if (active) {
          setEvidenceError(
            getApiErrorMessage(error, 'Could not load evidence for this case.'),
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingEvidence(false)
      })

    return () => {
      active = false
    }
  }, [caseId])

  // ---------------------------------------------------------
  // FEATURE VALUES
  // ---------------------------------------------------------

  // ---------------------------------------------------------
  // FEATURE VALUES
  // ---------------------------------------------------------

  function getNumericFeatures(): ServerLogFeatures {
    const features = {} as ServerLogFeatures

    for (const name of FEATURE_NAMES) {
      features[name] = Number(featureValues[name])
    }

    return features
  }
  // ---------------------------------------------------------
  // MANUAL ANALYSIS
  // ---------------------------------------------------------

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)
    setBatchResult(null)

    if (!caseId) {
      setAnalysisError('Select an investigation case before analyzing.')
      return
    }

    const invalid = FEATURE_NAMES.filter((name) => {
      const value = featureValues[name].trim()
      return value === '' || !Number.isFinite(Number(value)) || Number(value) < 0
    })

    setInvalidFeatures(invalid)

    if (invalid.length) {
      setAnalysisError('Enter a finite, non-negative number for every feature.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const analysis = await analyzeServerLog(Number(caseId), getNumericFeatures())
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(error, 'Server log features could not be analyzed.'),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // ---------------------------------------------------------
  // CSV FILE SELECTION
  // ---------------------------------------------------------

  function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null

    setAnalysisError('')
    setBatchResult(null)

    if (!file) {
      setCsvFile(null)
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvFile(null)
      event.target.value = ''
      setAnalysisError('Please select a valid CSV file.')
      return
    }

    if (file.size === 0) {
      setCsvFile(null)
      event.target.value = ''
      setAnalysisError('The selected CSV file is empty.')
      return
    }

    if (file.size > MAX_CSV_SIZE) {
      setCsvFile(null)
      event.target.value = ''
      setAnalysisError('CSV file must be 5 MB or smaller.')
      return
    }

    setCsvFile(file)
  }

  function removeCsvFile() {
    setCsvFile(null)
    setBatchResult(null)
    setAnalysisError('')
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  // ---------------------------------------------------------
  // CSV UPLOAD ANALYSIS
  // ---------------------------------------------------------

  async function handleCsvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (csvSubmissionLock.current) return

    setAnalysisError('')
    setBatchResult(null)
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select a case before uploading a CSV.')
      return
    }
    if (!csvFile) {
      setAnalysisError('Please select a CSV file first.')
      return
    }
    if (!csvFile.name.toLowerCase().endsWith('.csv') || csvFile.size > MAX_CSV_SIZE) {
      setAnalysisError('Please select a valid CSV file (maximum 5 MB).')
      return
    }

    csvSubmissionLock.current = true
    setIsUploading(true)

    try {
      const analysis = await analyzeServerLogCsv(Number(caseId), csvFile)
      setBatchResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(error, 'Server log CSV analysis failed.'),
      )
    } finally {
      csvSubmissionLock.current = false
      setIsUploading(false)
    }
  }

  // ---------------------------------------------------------
  // ANALYZE EXISTING EVIDENCE
  // ---------------------------------------------------------

  async function handleExistingEvidenceSubmit() {
    if (evidenceSubmissionLock.current) return

    setAnalysisError('')
    setBatchResult(null)
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select a case before analyzing existing evidence.')
      return
    }

    if (!selectedEvidenceId) {
      setAnalysisError('Select a CSV evidence file to analyze.')
      return
    }

    evidenceSubmissionLock.current = true
    setIsAnalyzingEvidence(true)

    try {
      const analysis = await analyzeServerLogEvidence(
        Number(caseId),
        Number(selectedEvidenceId),
      )
      setBatchResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(error, 'Existing evidence analysis failed.'),
      )
    } finally {
      evidenceSubmissionLock.current = false
      setIsAnalyzingEvidence(false)
    }
  }

  // ---------------------------------------------------------
  // RETRY EVIDENCE LOADING
  // ---------------------------------------------------------

  function retryEvidence() {
    if (!caseId) return

    setEvidenceError('')
    setIsLoadingEvidence(true)

    getEvidenceByCase(Number(caseId))
      .then((data) => {
        const csvEvidence = data.filter((item) =>
          item.original_filename.toLowerCase().endsWith('.csv'),
        )
        setEvidenceList(csvEvidence)
        setSelectedEvidenceId('')
      })
      .catch((error: unknown) => {
        setEvidenceError(
          getApiErrorMessage(error, 'Could not load evidence for this case.'),
        )
      })
      .finally(() => setIsLoadingEvidence(false))
  }

  // ---------------------------------------------------------
  // UPDATE MANUAL INPUT
  // ---------------------------------------------------------

  function updateFeature(name: ServerLogFeatureName, value: string) {
    setFeatureValues((current) => ({ ...current, [name]: value }))
    setInvalidFeatures((current) => current.filter((item) => item !== name))
    setResult(null)
    setAnalysisError('')
  }

  function resetAnalysis() {
    setFeatureValues(createEmptyFeatureValues())
    setInvalidFeatures([])
    setResult(null)
    setAnalysisError('')
  }

  // ---------------------------------------------------------
  // RETRY CASE LOADING
  // ---------------------------------------------------------

  function retryCases() {
    setIsLoadingCases(true)
    setCasesError('')

    getCases()
      .then((data) => {
        setCases(data)
        setCaseId((current) =>
          data.some((item) => String(item.id) === current)
            ? current
            : data[0]
              ? String(data[0].id)
              : '',
        )
      })
      .catch((error: unknown) => {
        setCasesError(getApiErrorMessage(error, 'Your cases could not be loaded.'))
      })
      .finally(() => setIsLoadingCases(false))
  }

  // ---------------------------------------------------------
  // FEATURE INPUT
  // ---------------------------------------------------------

  function renderFeatureInput(name: ServerLogFeatureName) {
    const hasError = invalidFeatures.includes(name)

    return (
      <div key={name} className="space-y-1.5">
        <label
          htmlFor={`server-log-${name}`}
          className="block text-xs font-medium theme-text-secondary"
        >
          {name}
          <span className="ml-1 text-red-600 dark:text-red-300">*</span>
        </label>

        <input
          id={`server-log-${name}`}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={featureValues[name]}
          onChange={(event) => updateFeature(name, event.target.value)}
          required
          disabled={isAnalyzing}
          aria-invalid={hasError}
          className={`theme-input w-full rounded-lg px-3 py-2.5 text-sm outline-none transition focus:ring-4 disabled:opacity-60 ${
            hasError
              ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/10'
              : 'focus:border-purple-500 focus:ring-purple-500/10'
          }`}
          placeholder="Enter event count"
        />

        {hasError && (
          <p className="text-[11px] text-red-700 dark:text-red-300">
            Enter a finite number greater than or equal to zero.
          </p>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------

  const selectedCase = cases.find((item) => String(item.id) === caseId)

  const selectedEvidence = evidenceList.find(
    (item) => String(item.id) === selectedEvidenceId,
  )

  const completedFeatures = FEATURE_NAMES.filter((name) => {
    const value = featureValues[name].trim()
    return value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  }).length

  const isBusy = isAnalyzing || isUploading || isAnalyzingEvidence

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  return (
    <section className="mx-auto max-w-6xl space-y-6 theme-text">

      {/* HEADER */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600 dark:text-purple-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Server Log Analysis
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm theme-text-secondary">
          Analyze HDFS server log event-count features and save model assessments
          to an investigation case.
        </p>
      </header>

      {/* CASE SELECTION - SHARED BY ALL ANALYSIS MODES */}
      <section className="theme-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-400/20 dark:bg-purple-500/[0.08] dark:text-purple-300">
            <ShieldAlert size={21} />
          </span>
          <div>
            <h2 className="text-base font-semibold theme-text">Investigation Case</h2>
            <p className="mt-1 text-xs theme-text-secondary">
              Select a case. CSV upload, existing evidence, and manual analysis
              will all be linked to this case.
            </p>
          </div>
        </div>

        {casesError && (
          <div
            role="alert"
            className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-400/20 dark:bg-red-400/[0.07] sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle size={16} />
              {casesError}
            </p>
            <button
              type="button"
              onClick={retryCases}
              disabled={isLoadingCases}
              className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-300/20 dark:text-red-200 disabled:opacity-50"
            >
              {isLoadingCases ? 'Loading…' : 'Retry'}
            </button>
          </div>
        )}

        <div className="mt-5 space-y-2">
          <label htmlFor="server-log-case" className="block text-sm font-medium theme-text">
            Case
          </label>
          <select
            id="server-log-case"
            value={caseId}
            onChange={(event) => {
              setCaseId(event.target.value)
              setResult(null)
              setBatchResult(null)
              setAnalysisError('')
              setCsvFile(null)
              if (csvInputRef.current) csvInputRef.current.value = ''
            }}
            disabled={isLoadingCases || cases.length === 0 || isBusy}
            required
            className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
          >
            {cases.length === 0 && (
              <option value="">
                {isLoadingCases ? 'Loading cases…' : 'No cases available'}
              </option>
            )}
            {cases.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.case_number} — {item.title}
              </option>
            ))}
          </select>
        </div>

        {selectedCase && (
          <p className="mt-2 text-xs theme-text-muted">
            Selected: {selectedCase.case_number} · All successful analyses will
            automatically be saved to this case.
          </p>
        )}
      </section>

      {/* GLOBAL ANALYSIS ERROR */}
      {analysisError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{analysisError}</span>
        </p>
      )}

      {/* 1. CSV BATCH ANALYSIS */}
      <section className="theme-card p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-400/20 dark:bg-purple-500/[0.08] dark:text-purple-300">
            <FileSpreadsheet size={21} />
          </span>
          <div>
            <h2 className="text-base font-semibold theme-text">CSV Batch Analysis</h2>
            <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
              Upload a processed HDFS feature CSV to analyze multiple blocks.
            </p>
          </div>
        </div>

        <form onSubmit={handleCsvSubmit} className="mt-5 space-y-4">
          <div className="theme-card-secondary rounded-xl border-dashed p-5 transition hover:border-purple-400/50 sm:p-7">
            <input
              ref={csvInputRef}
              id="server-log-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileChange}
              disabled={isUploading || isLoadingCases || !caseId}
              className="hidden"
            />

            {!csvFile ? (
              <label
                htmlFor="server-log-csv"
                className="flex cursor-pointer flex-col items-center text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/[0.08] dark:text-purple-300">
                  <FileUp size={23} />
                </span>
                <span className="mt-3 text-sm font-semibold theme-text">
                  Click to upload CSV file
                </span>
                <span className="mt-1 text-xs theme-text-muted">
                  CSV format · Maximum file size 5 MB
                </span>
              </label>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/[0.08] dark:text-emerald-300">
                    <FileSpreadsheet size={21} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium theme-text">{csvFile.name}</p>
                    <p className="mt-1 text-xs theme-text-muted">
                      {formatFileSize(csvFile.size)} · Ready for analysis
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeCsvFile}
                  disabled={isUploading}
                  aria-label="Remove selected CSV"
                  className="theme-button flex size-9 shrink-0 items-center justify-center self-end rounded-lg transition hover:border-red-400/30 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:self-auto"
                >
                  <X size={17} />
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-400/[0.12] dark:bg-purple-500/[0.04]">
            <p className="text-xs font-medium text-purple-700 dark:text-purple-200">
              Required CSV format
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              Include all 29 numerical columns E1–E29. Optional metadata columns
              BlockId, Label, Type, and target_label are ignored by the model.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs theme-text-muted">
              Case: {selectedCase?.case_number ?? 'No case selected'}
            </p>
            <button
              type="submit"
              disabled={isUploading || isLoadingCases || !caseId || !csvFile}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2.5"
            >
              {isUploading ? <LoaderCircle size={16} className="animate-spin" /> : <ScanSearch size={16} />}
              {isUploading ? 'Analyzing CSV…' : 'Analyze CSV'}
            </button>
          </div>
        </form>
      </section>

      {/* 2. EXISTING EVIDENCE */}
      <section className="theme-card p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/[0.08] dark:text-blue-300">
            <Database size={21} />
          </span>
          <div>
            <h2 className="text-base font-semibold theme-text">Existing Evidence</h2>
            <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
              Analyze a CSV already uploaded to the selected case. No re-upload is
              required.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {isLoadingEvidence ? (
            <div className="theme-card-secondary flex items-center gap-2 rounded-xl p-4 text-sm theme-text-secondary">
              <LoaderCircle size={17} className="animate-spin" />
              Loading case evidence…
            </div>
          ) : evidenceError ? (
            <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-400/20 dark:bg-red-400/[0.07] sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle size={17} />
                {evidenceError}
              </p>
              <button
                type="button"
                onClick={retryEvidence}
                className="inline-flex items-center gap-2 self-start rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-300/20 dark:text-red-200"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          ) : evidenceList.length === 0 ? (
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-sm font-medium theme-text">No CSV evidence found</p>
              <p className="mt-1 text-xs theme-text-secondary">
                Upload a CSV file to this investigation case through Evidence
                Management first. It will appear here automatically.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="existing-server-log-evidence" className="block text-sm font-medium theme-text">
                  Select CSV evidence
                </label>
                <select
                  id="existing-server-log-evidence"
                  value={selectedEvidenceId}
                  onChange={(event) => {
                    setSelectedEvidenceId(event.target.value)
                    setBatchResult(null)
                    setResult(null)
                    setAnalysisError('')
                  }}
                  disabled={isAnalyzingEvidence || isLoadingCases || !caseId}
                  className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 disabled:opacity-60"
                >
                  <option value="">Choose an evidence file…</option>
                  {evidenceList.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.original_filename}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEvidence && (
                <div className="theme-card-secondary rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <FileSpreadsheet size={19} className="shrink-0 text-blue-600 dark:text-blue-300" />
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-medium theme-text">
                        {selectedEvidence.original_filename}
                      </p>
                      <p className="mt-1 text-xs theme-text-muted">
                        {formatFileSize(selectedEvidence.file_size)} · Uploaded{' '}
                        {new Date(selectedEvidence.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs theme-text-muted">
                  Evidence is integrity-verified by the backend before analysis.
                </p>
                <button
                  type="button"
                  onClick={handleExistingEvidenceSubmit}
                  disabled={
                    isAnalyzingEvidence ||
                    isUploading ||
                    isAnalyzing ||
                    isLoadingEvidence ||
                    isLoadingCases ||
                    !caseId ||
                    !selectedEvidenceId
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2.5"
                >
                  {isAnalyzingEvidence
                    ? <LoaderCircle size={16} className="animate-spin" />
                    : <ScanSearch size={16} />}
                  {isAnalyzingEvidence ? 'Analyzing evidence…' : 'Analyze Existing Evidence'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 3. MANUAL FEATURE ANALYSIS */}
      <form onSubmit={handleSubmit} noValidate className="theme-card p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-400/20 dark:bg-purple-500/[0.08] dark:text-purple-300">
            <Activity size={21} />
          </span>
          <div>
            <h2 className="text-base font-semibold theme-text">Manual Feature Analysis</h2>
            <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
              Enter the 29 HDFS event-count features manually.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="theme-card-secondary rounded-xl p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold theme-text">Event-count values</h3>
                <p className="mt-1 text-xs theme-text-muted">
                  All 29 model input features are required.
                </p>
              </div>
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-700 dark:border-purple-400/[0.15] dark:bg-purple-500/[0.07] dark:text-purple-200">
                {completedFeatures} / 29 complete
              </span>
            </div>

            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_NAMES.map(renderFeatureInput)}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 theme-divider border-t pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={resetAnalysis}
            disabled={isAnalyzing}
            className="theme-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition theme-hover disabled:opacity-50 sm:py-2.5"
          >
            <RotateCcw size={15} />
            Reset
          </button>
          <button
            type="submit"
            disabled={isAnalyzing || isUploading || isAnalyzingEvidence || isLoadingCases || !caseId || completedFeatures !== 29}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
          >
            {isAnalyzing ? <LoaderCircle size={16} className="animate-spin" /> : <ScanSearch size={16} />}
            {isAnalyzing ? 'Analyzing features…' : 'Analyze server features'}
          </button>
        </div>
      </form>

      {/* INFORMATION PANEL */}
      <aside className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 dark:border-purple-400/[0.15] dark:bg-purple-500/[0.045] sm:p-6">
          <div className="flex items-start gap-3">
            <Activity size={19} className="mt-0.5 shrink-0 text-purple-600 dark:text-purple-300" />
            <div>
              <h2 className="text-sm font-semibold text-purple-800 dark:text-purple-100">
                Feature-based input
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                The model expects numerical HDFS block-level event occurrence
                features. Manual input sends one block for prediction.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/[0.15] dark:bg-amber-400/[0.04] sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
            <div>
              <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-100">
                AI-assisted assessment
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                An anomaly prediction is not definitive proof of intrusion.
                Treat model output as decision support. Independent evaluation
                is required for real-world use.
              </p>
            </div>
          </div>
        </div>

        <div className="theme-card p-5 sm:p-6 md:col-span-2">
          <div className="flex items-center gap-2">
            <BadgeCheck size={17} className="text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-sm font-semibold theme-text">Automatically saved finding</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed theme-text-secondary">
            Successful case-linked analysis is automatically saved to the selected
            case and returns a finding ID.
          </p>
        </div>
      </aside>

      {/* 4. BATCH RESULTS (CSV UPLOAD OR EXISTING EVIDENCE) */}
      {batchResult && (
        <section aria-live="polite" className="theme-card overflow-hidden">
          <div className="flex flex-col gap-3 theme-divider border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-purple-600 dark:text-purple-400">
                Batch Analysis Results
              </p>
              <h2 className="mt-1.5 text-lg font-semibold theme-text">Server Log Analysis</h2>
              <p className="mt-1 text-xs theme-text-muted">{batchResult.filename}</p>
              {batchResult.input_source === 'existing_evidence' && (
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                  Source: Existing case evidence (no re-upload)
                </p>
              )}
            </div>
            <span className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase ${getSeverityStyle(batchResult.severity)}`}>
              {batchResult.severity} severity
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-7">
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Total blocks</p>
              <p className="mt-2 text-2xl font-bold theme-text">{batchResult.total_blocks}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-400/[0.12] dark:bg-red-400/[0.035]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300/70">Anomalies</p>
              <p className="mt-2 text-2xl font-bold text-red-700 dark:text-red-300">{batchResult.anomaly_blocks}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/[0.12] dark:bg-emerald-400/[0.035]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300/70">Normal blocks</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{batchResult.normal_blocks}</p>
            </div>
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Anomaly rate</p>
              <p className="mt-2 text-2xl font-bold theme-text">{batchResult.anomaly_percentage.toFixed(2)}%</p>
            </div>
          </div>

          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3 sm:px-7">
            <div className="theme-card-secondary rounded-lg p-3">
              <p className="text-[11px] theme-text-muted">Average confidence</p>
              <p className="mt-1 text-sm font-semibold theme-text">{formatProbability(batchResult.average_confidence)}</p>
            </div>
            <div className="theme-card-secondary rounded-lg p-3">
              <p className="text-[11px] theme-text-muted">Decision threshold</p>
              <p className="mt-1 text-sm font-semibold theme-text">{formatProbability(batchResult.threshold)}</p>
            </div>
            <div className="theme-card-secondary rounded-lg p-3">
              <p className="text-[11px] theme-text-muted">Model</p>
              <p className="mt-1 text-sm font-semibold theme-text">{batchResult.model}</p>
            </div>
          </div>

          <div className="theme-divider border-t">
            <div className="flex flex-wrap items-center justify-between gap-2 p-5 sm:px-7">
              <div>
                <h3 className="text-sm font-semibold theme-text">Individual block predictions</h3>
                <p className="mt-1 text-xs theme-text-muted">Predictions for each HDFS block.</p>
              </div>
              <span className="theme-button rounded-full px-3 py-1 text-xs theme-text-secondary">
                {batchResult.results.length} records
              </span>
            </div>

            <div className="overflow-x-auto theme-scroll">
              <table className="theme-table w-full min-w-[760px] text-left text-xs">
                <thead className="theme-table-header">
                  <tr>
                    <th className="px-5 py-3 font-semibold sm:px-7">#</th>
                    <th className="px-4 py-3 font-semibold">Block ID</th>
                    <th className="px-4 py-3 font-semibold">Prediction</th>
                    <th className="px-4 py-3 font-semibold">Anomaly probability</th>
                    <th className="px-4 py-3 font-semibold">Normal probability</th>
                    <th className="px-4 py-3 font-semibold">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y theme-divider">
                  {batchResult.results.map((item) => (
                    <tr key={item.block_index} className="transition theme-hover">
                      <td className="px-5 py-3.5 theme-text-muted sm:px-7">{item.block_index}</td>
                      <td className="px-4 py-3.5 font-mono theme-text-secondary">
                        {item.block_id ?? `Block ${item.block_index}`}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                          item.class === 1
                            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
                        }`}>
                          {item.prediction}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-red-700 dark:text-red-300">{formatProbability(item.anomaly_probability)}</td>
                      <td className="px-4 py-3.5 text-emerald-700 dark:text-emerald-300">{formatProbability(item.normal_probability)}</td>
                      <td className="px-4 py-3.5 font-medium theme-text">{formatProbability(item.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="m-5 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/[0.15] dark:bg-emerald-400/[0.035] sm:m-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <BadgeCheck size={15} />
                Finding successfully saved
              </p>
              <p className="mt-1 text-xs theme-text-secondary">{batchResult.message}</p>
            </div>
            <span className="self-start rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 font-mono text-xs text-emerald-800 dark:border-emerald-300/[0.15] dark:bg-black/10 dark:text-emerald-200">
              Finding #{batchResult.finding_id}
            </span>
          </div>
        </section>
      )}

      {/* 5. MANUAL ANALYSIS RESULTS */}
      {result && (
        <section aria-live="polite" className="theme-card overflow-hidden">
          <div className="flex flex-col gap-4 theme-divider border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-purple-600 dark:text-purple-400">
                Manual Analysis Result
              </p>
              <h2 className="mt-1.5 text-lg font-semibold theme-text">{result.module}</h2>
            </div>
            <span className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}>
              {result.severity} severity
            </span>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Prediction</p>
              <p className="mt-2 text-lg font-semibold theme-text">{result.prediction}</p>
              <p className="mt-1 text-xs theme-text-secondary">Classification: {result.class}</p>
            </div>
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Confidence</p>
              <p className="mt-2 text-lg font-semibold theme-text">{formatProbability(result.confidence)}</p>
            </div>
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Anomaly probability</p>
              <p className="mt-2 text-lg font-semibold text-red-700 dark:text-red-300">{formatProbability(result.anomaly_probability)}</p>
            </div>
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Normal probability</p>
              <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300">{formatProbability(result.normal_probability)}</p>
            </div>
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Decision threshold</p>
              <p className="mt-2 text-lg font-semibold theme-text">{formatProbability(result.threshold)}</p>
            </div>
            <div className="theme-card-secondary rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide theme-text-muted">Model and dataset</p>
              <p className="mt-2 text-sm font-medium theme-text">{result.model}</p>
              <p className="mt-1 text-xs theme-text-muted">{result.dataset} · {result.input_features} features</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/[0.15] dark:bg-emerald-400/[0.035] sm:col-span-2 lg:col-span-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300/70">
                  Finding saved to case #{result.case_id}
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-200">{result.message}</p>
              </div>
              <span className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 font-mono text-xs text-emerald-800 dark:border-emerald-300/[0.15] dark:bg-black/10 dark:text-emerald-200">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>
        </section>
      )}
    </section>
  )
}