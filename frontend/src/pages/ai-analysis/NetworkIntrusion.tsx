import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  FileSpreadsheet,
  LoaderCircle,
  Network,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  Upload,
} from 'lucide-react'

import { getCases, type Case } from '../../services/caseService'
import { getEvidenceByCase, type Evidence } from '../../services/evidenceService'

import {
  analyzeNetworkIntrusion,
  analyzeNetworkIntrusionCsv,
  analyzeNetworkIntrusionEvidence,
  type NetworkIntrusionFeatures,
  type NetworkIntrusionResponse,
  type NetworkIntrusionBatchResponse,
} from '../../services/aiAnalysisService'

type NetworkFeatureName = keyof NetworkIntrusionFeatures
type CsvSource = 'upload' | 'evidence'

const FEATURE_NAMES = [
  'duration', 'protocol_type', 'service', 'flag', 'src_bytes', 'dst_bytes',
  'land', 'wrong_fragment', 'urgent', 'hot', 'num_failed_logins', 'logged_in',
  'num_compromised', 'root_shell', 'su_attempted', 'num_root',
  'num_file_creations', 'num_shells', 'num_access_files', 'num_outbound_cmds',
  'is_host_login', 'is_guest_login', 'count', 'srv_count', 'serror_rate',
  'srv_serror_rate', 'rerror_rate', 'srv_rerror_rate', 'same_srv_rate',
  'diff_srv_rate', 'srv_diff_host_rate', 'dst_host_count',
  'dst_host_srv_count', 'dst_host_same_srv_rate', 'dst_host_diff_srv_rate',
  'dst_host_same_src_port_rate', 'dst_host_srv_diff_host_rate',
  'dst_host_serror_rate', 'dst_host_srv_serror_rate',
  'dst_host_rerror_rate', 'dst_host_srv_rerror_rate',
] as const satisfies readonly NetworkFeatureName[]

const FEATURE_GROUPS = [
  {
    title: 'Basic connection details',
    description: 'Protocol, service, connection status and data transfer.',
    features: [
      'duration', 'protocol_type', 'service', 'flag', 'src_bytes', 'dst_bytes',
      'land', 'wrong_fragment', 'urgent',
    ],
  },
  {
    title: 'Content and login features',
    description: 'Login, shell and access indicators.',
    features: [
      'hot', 'num_failed_logins', 'logged_in', 'num_compromised', 'root_shell',
      'su_attempted', 'num_root', 'num_file_creations', 'num_shells',
      'num_access_files', 'num_outbound_cmds', 'is_host_login',
      'is_guest_login',
    ],
  },
  {
    title: 'Traffic statistics',
    description: 'Connection counts and service/error rates.',
    features: [
      'count', 'srv_count', 'serror_rate', 'srv_serror_rate', 'rerror_rate',
      'srv_rerror_rate', 'same_srv_rate', 'diff_srv_rate', 'srv_diff_host_rate',
    ],
  },
  {
    title: 'Host-based statistics',
    description: 'Destination host statistics and error rates.',
    features: [
      'dst_host_count', 'dst_host_srv_count', 'dst_host_same_srv_rate',
      'dst_host_diff_srv_rate', 'dst_host_same_src_port_rate',
      'dst_host_srv_diff_host_rate', 'dst_host_serror_rate',
      'dst_host_srv_serror_rate', 'dst_host_rerror_rate',
      'dst_host_srv_rerror_rate',
    ],
  },
] as const satisfies readonly {
  title: string
  description: string
  features: readonly NetworkFeatureName[]
}[]

const CATEGORICAL_OPTIONS = {
  protocol_type: ['tcp'],
  service: ['http'],
  flag: ['SF'],
} as const

type CategoricalFeatureName = keyof typeof CATEGORICAL_OPTIONS

const MAX_CSV_SIZE = 5 * 1024 * 1024

function isCategoricalFeature(
  name: NetworkFeatureName,
): name is CategoricalFeatureName {
  return name === 'protocol_type' || name === 'service' || name === 'flag'
}

function createEmptyFeatureValues(): Record<NetworkFeatureName, string> {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, ''])) as Record<
    NetworkFeatureName,
    string
  >
}

function formatLabel(name: string): string {
  return name.replaceAll('_', ' ')
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function getSeverityStyle(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300'
    case 'MEDIUM':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    default:
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  }
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection.'
    }

    const data: unknown = error.response.data

    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const detail = data.detail

      if (typeof detail === 'string') return detail

      if (
        typeof detail === 'object' &&
        detail !== null &&
        'message' in detail &&
        typeof detail.message === 'string'
      ) {
        return detail.message
      }
    }

    if (error.response.status === 404) {
      return 'API endpoint not found (404). Check the network intrusion CSV route.'
    }

    if (error.response.status === 401) {
      return 'Your session may have expired. Please sign in again.'
    }

    if (error.response.status === 413) {
      return 'The CSV file is too large.'
    }

    if (error.response.status === 422) {
      return 'CSV validation failed. Check the required 41 feature columns and their values.'
    }
  }

  return error instanceof Error ? error.message : fallback
}

function isCsvEvidence(evidence: Evidence): boolean {
  const filename = evidence.original_filename?.toLowerCase() ?? ''

  return (
    filename.endsWith('.csv') &&
    Number(evidence.file_size) > 0 &&
    Number(evidence.file_size) <= MAX_CSV_SIZE
  )
}

export default function NetworkIntrusion() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [featureValues, setFeatureValues] =
    useState<Record<NetworkFeatureName, string>>(createEmptyFeatureValues)

  const [invalidFeatures, setInvalidFeatures] =
    useState<NetworkFeatureName[]>([])

  const [result, setResult] = useState<NetworkIntrusionResponse | null>(null)

  // CSV state
  const [csvSource, setCsvSource] = useState<CsvSource>('upload')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvResult, setCsvResult] =
    useState<NetworkIntrusionBatchResponse | null>(null)

  // Existing evidence state
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([])
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('')
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false)
  const [evidenceLoadError, setEvidenceLoadError] = useState('')

  // Error state
  const [csvError, setCsvError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [casesError, setCasesError] = useState('')

  // Loading state
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const submissionLock = useRef(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // LOAD CASES
  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (!active) return
        setCases(data)
        setCaseId(data[0] ? String(data[0].id) : '')
      })
      .catch((error: unknown) => {
        if (!active) return
        setCasesError(getApiErrorMessage(error, 'Your cases could not be loaded.'))
      })
      .finally(() => {
        if (active) setIsLoadingCases(false)
      })

    return () => {
      active = false
    }
  }, [])

  // LOAD CSV EVIDENCE FOR SELECTED CASE
  useEffect(() => {
    let active = true

    setEvidenceList([])
    setSelectedEvidenceId('')
    setEvidenceLoadError('')

    if (!caseId) {
      setIsLoadingEvidence(false)
      return
    }

    setIsLoadingEvidence(true)

    getEvidenceByCase(Number(caseId))
      .then((data) => {
        if (!active) return
        setEvidenceList(data.filter(isCsvEvidence))
      })
      .catch((error: unknown) => {
        if (!active) return
        setEvidenceLoadError(
          getApiErrorMessage(error, 'Existing case evidence could not be loaded.'),
        )
      })
      .finally(() => {
        if (active) setIsLoadingEvidence(false)
      })

    return () => {
      active = false
    }
  }, [caseId])

  // MANUAL FEATURE HELPERS
  function getValidatedFeatures(): NetworkIntrusionFeatures {
    const features = {} as NetworkIntrusionFeatures

    for (const name of FEATURE_NAMES) {
      const value = featureValues[name].trim()

      if (isCategoricalFeature(name)) {
        Object.assign(features, { [name]: value })
      } else {
        Object.assign(features, { [name]: Number(value) })
      }
    }

    return features
  }

  function updateFeature(name: NetworkFeatureName, value: string) {
    setFeatureValues((current) => ({ ...current, [name]: value }))
    setInvalidFeatures((current) => current.filter((item) => item !== name))
    setResult(null)
    setAnalysisError('')
  }

  function resetManualForm() {
    setFeatureValues(createEmptyFeatureValues())
    setInvalidFeatures([])
    setResult(null)
    setAnalysisError('')
  }

  // MANUAL ANALYSIS
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)

    if (!caseId) {
      setAnalysisError('Select an investigation case first.')
      return
    }

    const invalid = FEATURE_NAMES.filter((name) => {
      const value = featureValues[name].trim()

      if (isCategoricalFeature(name)) {
        return !CATEGORICAL_OPTIONS[name].some((option => option === value))
      }

      return !value || !Number.isFinite(Number(value))
    })

    setInvalidFeatures(invalid)

    if (invalid.length > 0) {
      setAnalysisError('Complete all 41 features before analysis.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      const response = await analyzeNetworkIntrusion(
        Number(caseId),
        getValidatedFeatures(),
      )
      setResult(response)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(error, 'Network traffic analysis failed.'),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // CSV SOURCE SWITCH
  function handleCsvSourceChange(source: CsvSource) {
    if (isAnalyzing) return

    setCsvSource(source)
    setCsvFile(null)
    setSelectedEvidenceId('')
    setCsvResult(null)
    setCsvError('')
    setEvidenceLoadError('')

    if (csvInputRef.current) {
      csvInputRef.current.value = ''
    }
  }

  // CSV FILE VALIDATION
  function handleFileChange(file: File | null) {
    setCsvFile(null)
    setCsvResult(null)
    setCsvError('')

    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Only CSV files are supported.')
      return
    }

    if (file.size === 0) {
      setCsvError('The selected CSV file is empty.')
      return
    }

    if (file.size > MAX_CSV_SIZE) {
      setCsvError('CSV file size must be 5 MB or less.')
      return
    }

    setCsvFile(file)
  }

  // CSV ANALYSIS - UPLOAD OR EXISTING EVIDENCE
  async function handleCsvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    setCsvError('')
    setCsvResult(null)

    if (!caseId) {
      setCsvError('Select an investigation case first.')
      return
    }

    if (csvSource === 'upload' && !csvFile) {
      setCsvError('Please select a CSV file.')
      return
    }

    if (csvSource === 'evidence' && !selectedEvidenceId) {
      setCsvError('Please select an existing CSV evidence file.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      let response: NetworkIntrusionBatchResponse

      if (csvSource === 'upload' && csvFile) {
        response = await analyzeNetworkIntrusionCsv(Number(caseId), csvFile)
      } else {
        response = await analyzeNetworkIntrusionEvidence(
          Number(caseId),
          Number(selectedEvidenceId),
        )
      }

      setCsvResult(response)
    } catch (error) {
      setCsvError(
        getApiErrorMessage(error, 'CSV analysis could not be completed.'),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  // RETRY CASE LOADING
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

  // RESET CSV FORM
  function resetCsvForm() {
    setCsvFile(null)
    setSelectedEvidenceId('')
    setCsvResult(null)
    setCsvError('')
    setEvidenceLoadError('')

    if (csvInputRef.current) {
      csvInputRef.current.value = ''
    }
  }

  // MANUAL FEATURE INPUT RENDERER
  function renderFeature(name: NetworkFeatureName) {
    const invalid = invalidFeatures.includes(name)
    const inputId = `network-feature-${name}`

    return (
      <div key={name} className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-xs font-medium capitalize theme-text-secondary"
        >
          {formatLabel(name)}
          <span className="ml-1 text-red-600 dark:text-red-400">*</span>
        </label>

        {isCategoricalFeature(name) ? (
          <select
            id={inputId}
            value={featureValues[name]}
            onChange={(event) => updateFeature(name, event.target.value)}
            required
            disabled={isAnalyzing}
            aria-invalid={invalid}
            className={`theme-input w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-4 disabled:opacity-60 ${
              invalid
                ? 'border-red-400/60 focus:ring-red-400/10'
                : 'focus:border-purple-500 focus:ring-purple-500/10'
            }`}
          >
            <option value="">Select {formatLabel(name)}</option>
            {CATEGORICAL_OPTIONS[name].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            type="number"
            step="any"
            inputMode="decimal"
            value={featureValues[name]}
            onChange={(event) => updateFeature(name, event.target.value)}
            required
            disabled={isAnalyzing}
            aria-invalid={invalid}
            placeholder="Enter number"
            className={`theme-input w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-4 disabled:opacity-60 ${
              invalid
                ? 'border-red-400/60 focus:ring-red-400/10'
                : 'focus:border-purple-500 focus:ring-purple-500/10'
            }`}
          />
        )}

        {invalid && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Invalid or missing value.
          </p>
        )}
      </div>
    )
  }

  // SELECTED CASE & FORM PROGRESS
  const selectedCase = cases.find((item) => String(item.id) === caseId)

  const completedFeatures = FEATURE_NAMES.filter((name) => {
    const value = featureValues[name].trim()

    if (isCategoricalFeature(name)) {
      return CATEGORICAL_OPTIONS[name].some((option) => option === value)
    }

    return value !== '' && Number.isFinite(Number(value))
  }).length

  const selectedEvidence = evidenceList.find(
    (item) => String(item.id) === selectedEvidenceId,
  )

  // UI
  return (
    <section className="mx-auto max-w-6xl space-y-6 theme-text">
      {/* Page header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600 dark:text-purple-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight theme-text sm:text-3xl">
          Network Intrusion Detection
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm theme-text-secondary">
          Analyze KDD Cup 99 network traffic and save model assessments to an investigation case.
        </p>
      </header>

      {/* Case loading error */}
      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{casesError}</span>
          <button type="button" onClick={retryCases} className="self-start underline">
            Retry
          </button>
        </div>
      )}

      {/* SHARED CASE SELECTION */}
      <div className="theme-card rounded-2xl p-5 sm:p-6">
        <label
          htmlFor="network-intrusion-case"
          className="mb-2 block text-sm font-medium theme-text"
        >
          Investigation case
        </label>

        <select
          id="network-intrusion-case"
          value={caseId}
          onChange={(event) => {
            setCaseId(event.target.value)
            setResult(null)
            setCsvFile(null)
            setCsvResult(null)
            setSelectedEvidenceId('')
            setAnalysisError('')
            setCsvError('')
            setEvidenceLoadError('')

            if (csvInputRef.current) {
              csvInputRef.current.value = ''
            }
          }}
          disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
          className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500 disabled:opacity-60"
        >
          {cases.length === 0 && (
            <option value="">
              {isLoadingCases ? 'Loading cases…' : 'No cases available'}
            </option>
          )}

          {cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.case_number} — {item.title}
            </option>
          ))}
        </select>

        {selectedCase && (
          <p className="mt-2 text-xs theme-text-muted">
            Findings will be saved to {selectedCase.case_number}.
          </p>
        )}
      </div>

      {/* VERTICAL LAYOUT: CSV FIRST, MANUAL SECOND */}
      <div className="space-y-6">

        {/* ==================================================
            CSV BATCH ANALYSIS — FIRST
        ================================================== */}
        <div className="theme-card space-y-5 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <FileSpreadsheet
              size={22}
              className="text-emerald-600 dark:text-emerald-400"
            />
            <div>
              <h2 className="font-semibold theme-text">CSV batch analysis</h2>
              <p className="text-xs theme-text-secondary">
                Analyze multiple network connections in one request.
              </p>
            </div>
          </div>

          {/* CSV requirements */}
          <div className="rounded-xl border border-purple-400/30 bg-purple-500/5 p-4">
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              CSV requirements
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed theme-text-secondary">
              <li>One CSV file, maximum 5 MB.</li>
              <li>All 41 KDD Cup 99 feature columns are required.</li>
              <li>An optional class column is ignored by the model.</li>
              <li>The backend processes the complete CSV in one request.</li>
              <li>One combined finding is saved to the selected case.</li>
            </ul>
          </div>

          {/* CSV source toggle */}
          <div className="space-y-2">
            <p className="text-sm font-medium theme-text">CSV input source</p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCsvSourceChange('upload')}
                disabled={isAnalyzing}
                className={`rounded-xl border px-3 py-3 text-sm font-medium transition disabled:opacity-50 ${
                  csvSource === 'upload'
                    ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                    : 'theme-button theme-hover theme-text'
                }`}
              >
                <Upload size={15} className="mr-2 inline" />
                Upload CSV
              </button>

              <button
                type="button"
                onClick={() => handleCsvSourceChange('evidence')}
                disabled={isAnalyzing}
                className={`rounded-xl border px-3 py-3 text-sm font-medium transition disabled:opacity-50 ${
                  csvSource === 'evidence'
                    ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                    : 'theme-button theme-hover theme-text'
                }`}
              >
                <FileSpreadsheet size={15} className="mr-2 inline" />
                Existing Evidence
              </button>
            </div>
          </div>

          {/* CSV form */}
          <form onSubmit={handleCsvSubmit} className="space-y-4">
            {/* Upload source */}
            {csvSource === 'upload' && (
              <label
                htmlFor="network-csv-file"
                className="theme-elevated theme-hover flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-400/30 p-6 text-center transition hover:border-purple-400/60"
              >
                <Upload
                  size={30}
                  className="mb-3 text-purple-600 dark:text-purple-400"
                />
                <span className="text-sm font-medium theme-text">
                  Choose one CSV file
                </span>
                <span className="mt-1 text-xs theme-text-muted">
                  CSV format · Maximum 5 MB
                </span>

                {csvFile && (
                  <span className="mt-3 break-all text-xs text-emerald-700 dark:text-emerald-300">
                    {csvFile.name}
                  </span>
                )}

                <input
                  ref={csvInputRef}
                  id="network-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={isAnalyzing}
                  className="sr-only"
                  onChange={(event) =>
                    handleFileChange(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            )}

            {/* Existing evidence source */}
            {csvSource === 'evidence' && (
              <div className="space-y-3">
                <div className="theme-elevated rounded-xl p-4">
                  <p className="text-sm font-medium theme-text">
                    Select existing CSV evidence
                  </p>
                  <p className="mt-1 text-xs leading-relaxed theme-text-secondary">
                    Select a CSV file already uploaded to this investigation case.
                    The original evidence will not be uploaded again.
                  </p>
                </div>

                {isLoadingEvidence && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border theme-divider p-5 text-sm theme-text-secondary">
                    <LoaderCircle size={16} className="animate-spin" />
                    Loading case evidence…
                  </div>
                )}

                {evidenceLoadError && !isLoadingEvidence && (
                  <div
                    role="alert"
                    className="space-y-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
                  >
                    <p>{evidenceLoadError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!caseId) return
                        setEvidenceLoadError('')
                        setIsLoadingEvidence(true)

                        getEvidenceByCase(Number(caseId))
                          .then((data) => setEvidenceList(data.filter(isCsvEvidence)))
                          .catch((error: unknown) => {
                            setEvidenceLoadError(
                              getApiErrorMessage(
                                error,
                                'Existing case evidence could not be loaded.',
                              ),
                            )
                          })
                          .finally(() => setIsLoadingEvidence(false))
                      }}
                      className="underline"
                    >
                      Retry loading evidence
                    </button>
                  </div>
                )}

                {!isLoadingEvidence && !evidenceLoadError && (
                  <>
                    <select
                      id="network-existing-evidence"
                      value={selectedEvidenceId}
                      onChange={(event) => {
                        setSelectedEvidenceId(event.target.value)
                        setCsvResult(null)
                        setCsvError('')
                      }}
                      disabled={isAnalyzing || evidenceList.length === 0}
                      className="theme-input w-full rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500 disabled:opacity-60"
                    >
                      <option value="">
                        {evidenceList.length === 0
                          ? 'No eligible CSV evidence found'
                          : 'Select CSV evidence'}
                      </option>

                      {evidenceList.map((evidence) => (
                        <option key={evidence.id} value={evidence.id}>
                          {evidence.original_filename} (
                          {(Number(evidence.file_size) / 1024).toFixed(1)} KB)
                        </option>
                      ))}
                    </select>

                    {selectedEvidence && (
                      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Selected evidence
                        </p>
                        <p className="mt-1 break-all text-sm theme-text">
                          {selectedEvidence.original_filename}
                        </p>
                        <p className="mt-1 text-xs theme-text-muted">
                          Size: {(Number(selectedEvidence.file_size) / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CSV error */}
            {csvError && (
              <p
                role="alert"
                className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
              >
                <AlertCircle size={15} className="mr-2 inline" />
                {csvError}
              </p>
            )}

            {/* CSV actions */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={
                  isAnalyzing ||
                  !caseId ||
                  isLoadingCases ||
                  (csvSource === 'upload' && !csvFile) ||
                  (csvSource === 'evidence' &&
                    (!selectedEvidenceId || isLoadingEvidence || !!evidenceLoadError))
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <ScanSearch size={17} />
                )}
                {isAnalyzing
                  ? 'Processing CSV…'
                  : csvSource === 'upload'
                    ? 'Analyze CSV file'
                    : 'Analyze existing evidence'}
              </button>

              <button
                type="button"
                onClick={resetCsvForm}
                disabled={isAnalyzing}
                className="theme-button theme-hover inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition disabled:opacity-50"
              >
                <RotateCcw size={15} />
                Reset
              </button>
            </div>
          </form>

          {/* BATCH RESPONSE */}
          {csvResult && (
            <div className="space-y-4 border-t theme-divider pt-5">
              <div>
                <h3 className="font-semibold theme-text">CSV analysis summary</h3>
                <p className="mt-1 break-all text-xs theme-text-secondary">
                  {csvResult.filename}
                </p>
              </div>

              {/* Batch statistics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="theme-elevated rounded-xl p-4">
                  <p className="text-xs theme-text-secondary">Total connections</p>
                  <p className="mt-1 text-2xl font-semibold theme-text">
                    {csvResult.total_connections}
                  </p>
                </div>

                <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
                  <p className="text-xs text-red-700 dark:text-red-300">
                    Attack connections
                  </p>
                  <p className="mt-1 text-2xl font-semibold theme-text">
                    {csvResult.attack_connections}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Normal connections
                  </p>
                  <p className="mt-1 text-2xl font-semibold theme-text">
                    {csvResult.normal_connections}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Attack percentage
                  </p>
                  <p className="mt-1 text-2xl font-semibold theme-text">
                    {csvResult.attack_percentage.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Batch model details */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="theme-elevated rounded-xl p-3">
                  <p className="text-xs theme-text-muted">Model</p>
                  <p className="mt-1 text-sm font-medium theme-text">
                    {csvResult.model}
                  </p>
                </div>

                <div className="theme-elevated rounded-xl p-3">
                  <p className="text-xs theme-text-muted">Threshold</p>
                  <p className="mt-1 text-sm font-medium theme-text">
                    {formatProbability(csvResult.threshold)}
                  </p>
                </div>

                <div className="theme-elevated rounded-xl p-3 sm:col-span-2">
                  <p className="text-xs theme-text-muted">Dataset</p>
                  <p className="mt-1 text-sm font-medium theme-text">
                    {csvResult.dataset}
                  </p>
                </div>
              </div>

              {/* Connection results table */}
              <div className="overflow-x-auto rounded-xl border theme-divider">
                <table className="theme-table w-full min-w-[480px] text-left text-xs">
                  <thead className="theme-table-header">
                    <tr>
                      <th className="px-3 py-3">Connection</th>
                      <th className="px-3 py-3">Prediction</th>
                      <th className="px-3 py-3">Attack probability</th>
                      <th className="px-3 py-3">Normal probability</th>
                    </tr>
                  </thead>

                  <tbody>
                    {csvResult.results.map((item) => (
                      <tr
                        key={item.connection_index}
                        className="border-t theme-divider theme-text-secondary"
                      >
                        <td className="px-3 py-3">{item.connection_index}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-1 ${
                              item.class === 1
                                ? 'border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300'
                                : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {item.prediction}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {formatProbability(item.attack_probability)}
                        </td>
                        <td className="px-3 py-3">
                          {formatProbability(item.normal_probability)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Finding saved */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-2">
                  <BadgeCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      Combined finding saved successfully
                    </p>
                    <p className="mt-1 text-xs theme-text-secondary">
                      {csvResult.message}
                    </p>
                  </div>
                </div>

                <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 font-mono text-xs text-emerald-700 dark:text-emerald-300">
                  Finding #{csvResult.finding_id}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ==================================================
            MANUAL ANALYSIS — UNDER CSV
        ================================================== */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="theme-card space-y-5 rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <Network
              size={22}
              className="text-purple-600 dark:text-purple-400"
            />
            <div>
              <h2 className="font-semibold theme-text">Manual analysis</h2>
              <p className="text-xs theme-text-secondary">
                Enter all 41 network traffic features.
              </p>
            </div>
          </div>

          {/* Manual analysis error */}
          {analysisError && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
            >
              {analysisError}
            </p>
          )}

          {/* Feature groups */}
          <div className="theme-scroll max-h-[650px] space-y-5 overflow-y-auto pr-2">
            {FEATURE_GROUPS.map((group) => (
              <fieldset
                key={group.title}
                className="theme-card-secondary min-w-0 space-y-4 rounded-xl p-4 sm:p-5"
              >
                <legend className="px-2 text-sm font-semibold theme-text">
                  {group.title}
                </legend>
                <p className="-mt-1 text-xs theme-text-muted">
                  {group.description}
                </p>

                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  {group.features.map(renderFeature)}
                </div>
              </fieldset>
            ))}
          </div>

          {/* Manual form actions */}
          <div className="flex flex-col-reverse gap-3 border-t theme-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs theme-text-muted">
              {completedFeatures} of 41 features completed
            </p>

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetManualForm}
                disabled={isAnalyzing}
                className="theme-button theme-hover inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition disabled:opacity-50"
              >
                <RotateCcw size={15} />
                Reset
              </button>

              <button
                type="submit"
                disabled={
                  isAnalyzing ||
                  isLoadingCases ||
                  !caseId ||
                  completedFeatures !== 41
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnalyzing ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <ScanSearch size={16} />
                )}
                {isAnalyzing ? 'Analyzing…' : 'Analyze traffic'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* MANUAL ANALYSIS RESULT */}
      {result && (
        <section
          aria-live="polite"
          className="theme-card overflow-hidden rounded-2xl"
        >
          {/* Result header */}
          <div className="flex flex-col gap-4 border-b theme-divider p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
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

          {/* Result details */}
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">
            {[
              ['Prediction', result.prediction],
              ['Classification', String(result.class)],
              ['Confidence', formatProbability(result.confidence)],
              ['Attack probability', formatProbability(result.attack_probability)],
              ['Normal probability', formatProbability(result.normal_probability)],
              ['Decision threshold', formatProbability(result.threshold)],
              ['Model', result.model],
              ['Dataset', result.dataset],
              ['Input features', String(result.input_features)],
            ].map(([label, value]) => (
              <div key={label} className="theme-elevated rounded-xl p-4">
                <p className="text-xs theme-text-muted">{label}</p>
                <p className="mt-2 break-words text-sm font-semibold theme-text">
                  {value}
                </p>
              </div>
            ))}

            {/* Finding saved confirmation */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Finding saved to case #{result.case_id}
                  {selectedCase ? ` · ${selectedCase.case_number}` : ''}
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  {result.message}
                </p>
              </div>

              <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 font-mono text-xs text-emerald-700 dark:text-emerald-300">
                Finding #{result.finding_id}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <aside className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
        <ShieldAlert
          size={18}
          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <p className="text-xs leading-relaxed theme-text-secondary">
          Predictions are AI-assisted decision support, not proof that an
          intrusion occurred. This model uses the KDD Cup 99 feature set.
          Real-world performance may differ.
        </p>
      </aside>
    </section>
  )
}