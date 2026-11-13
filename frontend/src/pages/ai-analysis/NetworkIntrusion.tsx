
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
import {
  analyzeNetworkIntrusion,
  analyzeNetworkIntrusionCsv,
  type NetworkIntrusionFeatures,
  type NetworkIntrusionResponse,
  type NetworkIntrusionBatchResponse,
} from '../../services/aiAnalysisService'

type NetworkFeatureName = keyof NetworkIntrusionFeatures

const FEATURE_NAMES = [
  'duration',
  'protocol_type',
  'service',
  'flag',
  'src_bytes',
  'dst_bytes',
  'land',
  'wrong_fragment',
  'urgent',
  'hot',
  'num_failed_logins',
  'logged_in',
  'num_compromised',
  'root_shell',
  'su_attempted',
  'num_root',
  'num_file_creations',
  'num_shells',
  'num_access_files',
  'num_outbound_cmds',
  'is_host_login',
  'is_guest_login',
  'count',
  'srv_count',
  'serror_rate',
  'srv_serror_rate',
  'rerror_rate',
  'srv_rerror_rate',
  'same_srv_rate',
  'diff_srv_rate',
  'srv_diff_host_rate',
  'dst_host_count',
  'dst_host_srv_count',
  'dst_host_same_srv_rate',
  'dst_host_diff_srv_rate',
  'dst_host_same_src_port_rate',
  'dst_host_srv_diff_host_rate',
  'dst_host_serror_rate',
  'dst_host_srv_serror_rate',
  'dst_host_rerror_rate',
  'dst_host_srv_rerror_rate',
] as const satisfies readonly NetworkFeatureName[]

const FEATURE_GROUPS = [
  {
    title: 'Basic connection details',
    description: 'Protocol, service, connection status and data transfer.',
    features: [
      'duration', 'protocol_type', 'service', 'flag', 'src_bytes',
      'dst_bytes', 'land', 'wrong_fragment', 'urgent',
    ],
  },
  {
    title: 'Content and login features',
    description: 'Login, shell and access indicators.',
    features: [
      'hot', 'num_failed_logins', 'logged_in', 'num_compromised',
      'root_shell', 'su_attempted', 'num_root', 'num_file_creations',
      'num_shells', 'num_access_files', 'num_outbound_cmds',
      'is_host_login', 'is_guest_login',
    ],
  },
  {
    title: 'Traffic statistics',
    description: 'Connection counts and service/error rates.',
    features: [
      'count', 'srv_count', 'serror_rate', 'srv_serror_rate',
      'rerror_rate', 'srv_rerror_rate', 'same_srv_rate',
      'diff_srv_rate', 'srv_diff_host_rate',
    ],
  },
  {
    title: 'Host-based statistics',
    description: 'Destination host statistics and error rates.',
    features: [
      'dst_host_count', 'dst_host_srv_count',
      'dst_host_same_srv_rate', 'dst_host_diff_srv_rate',
      'dst_host_same_src_port_rate', 'dst_host_srv_diff_host_rate',
      'dst_host_serror_rate', 'dst_host_srv_serror_rate',
      'dst_host_rerror_rate', 'dst_host_srv_rerror_rate',
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

function isCategoricalFeature(
  name: NetworkFeatureName,
): name is CategoricalFeatureName {
  return (
    name === 'protocol_type' ||
    name === 'service' ||
    name === 'flag'
  )
}

function createEmptyFeatureValues(): Record<NetworkFeatureName, string> {
  return Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, '']),
  ) as Record<NetworkFeatureName, string>
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
      return 'border-red-400/20 bg-red-400/10 text-red-300'
    case 'MEDIUM':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
    default:
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
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
  }

  return error instanceof Error ? error.message : fallback
}

export default function NetworkIntrusion() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [featureValues, setFeatureValues] =
    useState<Record<NetworkFeatureName, string>>(
      createEmptyFeatureValues,
    )

  const [invalidFeatures, setInvalidFeatures] =
    useState<NetworkFeatureName[]>([])

  const [result, setResult] =
    useState<NetworkIntrusionResponse | null>(null)

  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvResult, setCsvResult] =
    useState<NetworkIntrusionBatchResponse | null>(null)

  const [csvError, setCsvError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [casesError, setCasesError] = useState('')

  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

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
    setFeatureValues((current) => ({
      ...current,
      [name]: value,
    }))

    setInvalidFeatures((current) =>
      current.filter((item) => item !== name),
    )

    setResult(null)
    setAnalysisError('')
  }

  function resetManualForm() {
    setFeatureValues(createEmptyFeatureValues())
    setInvalidFeatures([])
    setResult(null)
    setAnalysisError('')
  }

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
        return !CATEGORICAL_OPTIONS[name].some(
          (option) => option === value,
        )
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

  function handleFileChange(file: File | null) {
    setCsvFile(file)
    setCsvResult(null)
    setCsvError('')

    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvFile(null)
      setCsvError('Only CSV files are supported.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setCsvFile(null)
      setCsvError('CSV file size must be 5 MB or less.')
    }
  }

  async function handleCsvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionLock.current) return

    setCsvError('')
    setCsvResult(null)

    if (!caseId) {
      setCsvError('Select an investigation case first.')
      return
    }

    if (!csvFile) {
      setCsvError('Please select a CSV file.')
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)

    try {
      // Send the complete CSV file to the backend batch endpoint.
      // The backend processes all rows and saves one combined finding.
      const response = await analyzeNetworkIntrusionCsv(
        Number(caseId),
        csvFile,
      )

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
        setCasesError(
          getApiErrorMessage(error, 'Your cases could not be loaded.'),
        )
      })
      .finally(() => setIsLoadingCases(false))
  }

  function renderFeature(name: NetworkFeatureName) {
    const invalid = invalidFeatures.includes(name)
    const inputId = `network-feature-${name}`

    return (
      <div key={name} className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-xs font-medium capitalize text-slate-300"
        >
          {formatLabel(name)}
          <span className="ml-1 text-red-300">*</span>
        </label>

        {isCategoricalFeature(name) ? (
          <select
            id={inputId}
            value={featureValues[name]}
            onChange={(event) =>
              updateFeature(name, event.target.value)
            }
            required
            disabled={isAnalyzing}
            aria-invalid={invalid}
            className={`w-full rounded-lg border bg-[#242629] px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-4 disabled:opacity-60 ${
              invalid
                ? 'border-red-400/50 focus:ring-red-400/10'
                : 'border-white/10 focus:border-blue-500 focus:ring-blue-500/10'
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
            onChange={(event) =>
              updateFeature(name, event.target.value)
            }
            required
            disabled={isAnalyzing}
            aria-invalid={invalid}
            placeholder="Enter number"
            className={`w-full rounded-lg border bg-[#242629] px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-4 disabled:opacity-60 ${
              invalid
                ? 'border-red-400/50 focus:ring-red-400/10'
                : 'border-white/10 focus:border-blue-500 focus:ring-blue-500/10'
            }`}
          />
        )}

        {invalid && (
          <p className="text-xs text-red-300">
            Invalid or missing value.
          </p>
        )}
      </div>
    )
  }

  const selectedCase = cases.find(
    (item) => String(item.id) === caseId,
  )

  const completedFeatures = FEATURE_NAMES.filter((name) => {
    const value = featureValues[name].trim()

    if (isCategoricalFeature(name)) {
      return CATEGORICAL_OPTIONS[name].some(
        (option) => option === value,
      )
    }

    return value !== '' && Number.isFinite(Number(value))
  }).length

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Network Intrusion Detection
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Analyze KDD Cup 99 network traffic and save model assessments to an investigation case.
        </p>
      </header>

      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{casesError}</span>
          <button
            type="button"
            onClick={retryCases}
            className="self-start underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Shared case selection */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6">
        <label
          htmlFor="network-intrusion-case"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Investigation case
        </label>

        <select
          id="network-intrusion-case"
          value={caseId}
          onChange={(event) => {
            setCaseId(event.target.value)
            setResult(null)
            setCsvResult(null)
            setAnalysisError('')
            setCsvError('')
          }}
          disabled={isLoadingCases || cases.length === 0 || isAnalyzing}
          className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-60"
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
          <p className="mt-2 text-xs text-slate-500">
            Findings will be saved to {selectedCase.case_number}.
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Manual analysis */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5 rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <Network size={22} className="text-blue-300" />
            <div>
              <h2 className="font-semibold text-white">
                Manual analysis
              </h2>
              <p className="text-xs text-slate-400">
                Enter all 41 network traffic features.
              </p>
            </div>
          </div>

          {analysisError && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300"
            >
              {analysisError}
            </p>
          )}

          <div className="max-h-[650px] space-y-5 overflow-y-auto pr-2">
            {FEATURE_GROUPS.map((group) => (
              <fieldset
                key={group.title}
                className="min-w-0 space-y-4 rounded-xl border border-white/[0.07] bg-[#292b2e] p-4 sm:p-5"
              >
                <legend className="px-2 text-sm font-semibold text-slate-100">
                  {group.title}
                </legend>

                <p className="-mt-1 text-xs text-slate-500">
                  {group.description}
                </p>

                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  {group.features.map(renderFeature)}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {completedFeatures} of 41 features completed
            </p>

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetManualForm}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
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

        {/* CSV batch analysis */}
        <div className="space-y-5 rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={22} className="text-emerald-300" />
            <div>
              <h2 className="font-semibold text-white">
                CSV batch analysis
              </h2>
              <p className="text-xs text-slate-400">
                Analyze multiple network connections in one request.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-400/15 bg-blue-500/[0.05] p-4">
            <p className="text-sm font-medium text-blue-200">
              CSV requirements
            </p>

            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
              <li>One CSV file, maximum 5 MB.</li>
              <li>All 41 KDD Cup 99 feature columns are required.</li>
              <li>An optional class column is ignored by the model.</li>
              <li>The backend processes the complete CSV in one request.</li>
              <li>One combined finding is saved to the selected case.</li>
            </ul>
          </div>

          <form onSubmit={handleCsvSubmit} className="space-y-4">
            <label
              htmlFor="network-csv-file"
              className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15 bg-[#242629] p-6 text-center transition hover:border-blue-400/50"
            >
              <Upload size={30} className="mb-3 text-blue-300" />

              <span className="text-sm font-medium text-slate-200">
                Choose one CSV file
              </span>

              <span className="mt-1 text-xs text-slate-500">
                CSV format · Maximum 5 MB
              </span>

              {csvFile && (
                <span className="mt-3 break-all text-xs text-emerald-300">
                  {csvFile.name}
                </span>
              )}

              <input
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

            {csvError && (
              <p
                role="alert"
                className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300"
              >
                <AlertCircle size={15} className="mr-2 inline" />
                {csvError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                isAnalyzing ||
                !csvFile ||
                !caseId ||
                isLoadingCases
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <Upload size={17} />
              )}

              {isAnalyzing ? 'Processing CSV…' : 'Analyze CSV file'}
            </button>
          </form>

          {/* Batch response */}
          {csvResult && (
            <div className="space-y-4 border-t border-white/[0.07] pt-5">
              <div>
                <h3 className="font-semibold text-white">
                  CSV analysis summary
                </h3>
                <p className="mt-1 break-all text-xs text-slate-400">
                  {csvResult.filename}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
                  <p className="text-xs text-slate-400">
                    Total connections
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {csvResult.total_connections}
                  </p>
                </div>

                <div className="rounded-xl border border-red-400/15 bg-red-400/[0.06] p-4">
                  <p className="text-xs text-red-300">
                    Attack connections
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {csvResult.attack_connections}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4">
                  <p className="text-xs text-emerald-300">
                    Normal connections
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {csvResult.normal_connections}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
                  <p className="text-xs text-amber-300">
                    Attack percentage
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {csvResult.attack_percentage.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-3">
                  <p className="text-xs text-slate-500">Model</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {csvResult.model}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-3">
                  <p className="text-xs text-slate-500">Threshold</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {formatProbability(csvResult.threshold)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-3 sm:col-span-2">
                  <p className="text-xs text-slate-500">Dataset</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {csvResult.dataset}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="bg-[#242629] text-slate-400">
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
                        className="border-t border-white/[0.06] text-slate-300"
                      >
                        <td className="px-3 py-3">
                          {item.connection_index}
                        </td>

                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-1 ${
                              item.class === 1
                                ? 'border-red-400/20 bg-red-400/10 text-red-300'
                                : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
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

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
                <div className="flex items-start gap-2">
                  <BadgeCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-emerald-200">
                      Combined finding saved successfully
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {csvResult.message}
                    </p>
                  </div>
                </div>

                <span className="rounded-lg border border-emerald-300/15 bg-black/10 px-3 py-2 font-mono text-xs text-emerald-200">
                  Finding #{csvResult.finding_id}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual analysis result */}
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
            </div>

            <span
              className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${getSeverityStyle(result.severity)}`}
            >
              {result.severity} severity
            </span>
          </div>

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
              <div
                key={label}
                className="rounded-xl border border-white/[0.07] bg-[#242629] p-4"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-2 break-words text-sm font-semibold text-white">
                  {value}
                </p>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/70">
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

      <aside className="flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-4">
        <ShieldAlert
          size={18}
          className="mt-0.5 shrink-0 text-amber-300"
        />
        <p className="text-xs leading-relaxed text-slate-400">
          Predictions are AI-assisted decision support, not proof that an
          intrusion occurred. This model uses the KDD Cup 99 feature set.
          Real-world performance may differ.
        </p>
      </aside>
    </section>
  )
}
