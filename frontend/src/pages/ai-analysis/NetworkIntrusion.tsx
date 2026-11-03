import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  LoaderCircle,
  Network,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeNetworkIntrusion,
  type NetworkIntrusionFeatures,
  type NetworkIntrusionResponse,
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
    description: 'Connection protocol, service, status, duration, and bytes.',
    features: [
      'duration',
      'protocol_type',
      'service',
      'flag',
      'src_bytes',
      'dst_bytes',
      'land',
      'wrong_fragment',
      'urgent',
    ],
  },
  {
    title: 'Content and login features',
    description: 'Host access, login, shell, and content indicators.',
    features: [
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
    ],
  },
  {
    title: 'Traffic statistics',
    description: 'Connection counts and service/error rates.',
    features: [
      'count',
      'srv_count',
      'serror_rate',
      'srv_serror_rate',
      'rerror_rate',
      'srv_rerror_rate',
      'same_srv_rate',
      'diff_srv_rate',
      'srv_diff_host_rate',
    ],
  },
  {
    title: 'Host-based statistics',
    description: 'Destination-host counts, service rates, and error rates.',
    features: [
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
  featureName: NetworkFeatureName,
): featureName is CategoricalFeatureName {
  return (
    featureName === 'protocol_type' ||
    featureName === 'service' ||
    featureName === 'flag'
  )
}

function isValidCategoricalValue(
  featureName: CategoricalFeatureName,
  value: string,
): boolean {
  switch (featureName) {
    case 'protocol_type':
      return CATEGORICAL_OPTIONS.protocol_type.some(
        (option) => option === value,
      )
    case 'service':
      return CATEGORICAL_OPTIONS.service.some((option) => option === value)
    case 'flag':
      return CATEGORICAL_OPTIONS.flag.some((option) => option === value)
  }
}

function createEmptyFeatureValues(): Record<NetworkFeatureName, string> {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, ''])) as Record<
    NetworkFeatureName,
    string
  >
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
            ? detail.missing_features.filter(
                (feature): feature is string => typeof feature === 'string',
              )
            : []
        const unexpected =
          'unexpected_features' in detail &&
          Array.isArray(detail.unexpected_features)
            ? detail.unexpected_features.filter(
                (feature): feature is string => typeof feature === 'string',
              )
            : []
        const details = [
          detailMessage,
          missing.length ? `Missing: ${missing.join(', ')}.` : null,
          unexpected.length ? `Unexpected: ${unexpected.join(', ')}.` : null,
        ].filter((message): message is string => message !== null)
        if (details.length) return details.join(' ')
      }

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

function formatFeatureLabel(featureName: NetworkFeatureName): string {
  return featureName.replaceAll('_', ' ')
}

export default function NetworkIntrusion() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [featureValues, setFeatureValues] =
    useState<Record<NetworkFeatureName, string>>(createEmptyFeatureValues)
  const [invalidFeatures, setInvalidFeatures] = useState<NetworkFeatureName[]>(
    [],
  )
  const [result, setResult] = useState<NetworkIntrusionResponse | null>(null)
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
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
    return {
      duration: Number(featureValues.duration),
      protocol_type: featureValues.protocol_type.trim(),
      service: featureValues.service.trim(),
      flag: featureValues.flag.trim(),
      src_bytes: Number(featureValues.src_bytes),
      dst_bytes: Number(featureValues.dst_bytes),
      land: Number(featureValues.land),
      wrong_fragment: Number(featureValues.wrong_fragment),
      urgent: Number(featureValues.urgent),
      hot: Number(featureValues.hot),
      num_failed_logins: Number(featureValues.num_failed_logins),
      logged_in: Number(featureValues.logged_in),
      num_compromised: Number(featureValues.num_compromised),
      root_shell: Number(featureValues.root_shell),
      su_attempted: Number(featureValues.su_attempted),
      num_root: Number(featureValues.num_root),
      num_file_creations: Number(featureValues.num_file_creations),
      num_shells: Number(featureValues.num_shells),
      num_access_files: Number(featureValues.num_access_files),
      num_outbound_cmds: Number(featureValues.num_outbound_cmds),
      is_host_login: Number(featureValues.is_host_login),
      is_guest_login: Number(featureValues.is_guest_login),
      count: Number(featureValues.count),
      srv_count: Number(featureValues.srv_count),
      serror_rate: Number(featureValues.serror_rate),
      srv_serror_rate: Number(featureValues.srv_serror_rate),
      rerror_rate: Number(featureValues.rerror_rate),
      srv_rerror_rate: Number(featureValues.srv_rerror_rate),
      same_srv_rate: Number(featureValues.same_srv_rate),
      diff_srv_rate: Number(featureValues.diff_srv_rate),
      srv_diff_host_rate: Number(featureValues.srv_diff_host_rate),
      dst_host_count: Number(featureValues.dst_host_count),
      dst_host_srv_count: Number(featureValues.dst_host_srv_count),
      dst_host_same_srv_rate: Number(featureValues.dst_host_same_srv_rate),
      dst_host_diff_srv_rate: Number(featureValues.dst_host_diff_srv_rate),
      dst_host_same_src_port_rate: Number(
        featureValues.dst_host_same_src_port_rate,
      ),
      dst_host_srv_diff_host_rate: Number(
        featureValues.dst_host_srv_diff_host_rate,
      ),
      dst_host_serror_rate: Number(featureValues.dst_host_serror_rate),
      dst_host_srv_serror_rate: Number(featureValues.dst_host_srv_serror_rate),
      dst_host_rerror_rate: Number(featureValues.dst_host_rerror_rate),
      dst_host_srv_rerror_rate: Number(
        featureValues.dst_host_srv_rerror_rate,
      ),
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)
    if (!caseId) {
      setAnalysisError('Select a case before analyzing network traffic.')
      return
    }

    const invalid = FEATURE_NAMES.filter((featureName) => {
      const value = featureValues[featureName].trim()
      if (isCategoricalFeature(featureName)) {
        return value === '' || !isValidCategoricalValue(featureName, value)
      }
      return value === '' || !Number.isFinite(Number(value))
    })
    setInvalidFeatures(invalid)
    if (invalid.length) {
      setAnalysisError(
        'Complete every feature with an allowed category or finite number before analysis.',
      )
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)
    try {
      const analysis = await analyzeNetworkIntrusion(
        Number(caseId),
        getValidatedFeatures(),
      )
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'Network traffic could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function updateFeature(featureName: NetworkFeatureName, value: string) {
    setFeatureValues((current) => ({ ...current, [featureName]: value }))
    setInvalidFeatures((current) =>
      current.filter((invalidFeature) => invalidFeature !== featureName),
    )
    setResult(null)
    setAnalysisError('')
  }

  function resetAnalysis() {
    setFeatureValues(createEmptyFeatureValues())
    setInvalidFeatures([])
    setResult(null)
    setAnalysisError('')
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

  function renderFeature(featureName: NetworkFeatureName) {
    const inputId = `network-feature-${featureName}`
    const hasError = invalidFeatures.includes(featureName)

    return (
      <div key={featureName} className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-xs font-medium capitalize text-slate-300"
        >
          {formatFeatureLabel(featureName)}
          <span className="ml-1 text-red-300" aria-hidden="true">
            *
          </span>
        </label>
        {isCategoricalFeature(featureName) ? (
          <select
            id={inputId}
            value={featureValues[featureName]}
            onChange={(event) =>
              updateFeature(featureName, event.target.value)
            }
            required
            disabled={isAnalyzing}
            aria-invalid={hasError}
            className={`w-full rounded-lg border bg-[#242629] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:ring-4 disabled:opacity-60 ${
              hasError
                ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/10'
                : 'border-white/10 hover:border-white/20 focus:border-blue-500 focus:ring-blue-500/10'
            }`}
          >
            <option value="">Select {formatFeatureLabel(featureName)}</option>
            {CATEGORICAL_OPTIONS[featureName].map((option) => (
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
            value={featureValues[featureName]}
            onChange={(event) =>
              updateFeature(featureName, event.target.value)
            }
            required
            disabled={isAnalyzing}
            aria-invalid={hasError}
            className={`w-full rounded-lg border bg-[#242629] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:ring-4 disabled:opacity-60 ${
              hasError
                ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/10'
                : 'border-white/10 hover:border-white/20 focus:border-blue-500 focus:ring-blue-500/10'
            }`}
            placeholder="Enter finite number"
          />
        )}
        {hasError && (
          <p className="text-[11px] text-red-300">
            {isCategoricalFeature(featureName)
              ? 'Select a confirmed category.'
              : 'Enter a finite number.'}
          </p>
        )}
      </div>
    )
  }

  const selectedCase = cases.find((caseItem) => String(caseItem.id) === caseId)
  const completedFeatures = FEATURE_NAMES.filter((featureName) => {
    const value = featureValues[featureName].trim()
    if (isCategoricalFeature(featureName)) {
      return isValidCategoricalValue(featureName, value)
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
          Analyze KDD Cup 99 network-traffic features and save the model
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <Network size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                Network traffic features
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Complete all 41 fields. Numeric fields must be finite values;
                categorical fields must use a listed option.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="network-intrusion-case"
                className="block text-sm font-medium text-slate-200"
              >
                Investigation case
              </label>
              <select
                id="network-intrusion-case"
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
                  Successful analysis is saved to this case automatically.
                </p>
              )}
            </div>

            <div className="grid gap-4 2xl:grid-cols-2">
              {FEATURE_GROUPS.map((group) => (
                <fieldset
                  key={group.title}
                  className="min-w-0 space-y-4 rounded-xl border border-white/[0.07] bg-[#292b2e] p-4 sm:p-5"
                >
                  <legend className="px-2 text-sm font-semibold text-slate-100">
                    {group.title}
                  </legend>
                  <p className="-mt-1 text-xs leading-relaxed text-slate-500">
                    {group.description}
                  </p>
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                    {group.features.map(renderFeature)}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {completedFeatures} of 41 features completed
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
                  completedFeatures !== FEATURE_NAMES.length
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
                {isAnalyzing ? 'Analyzing traffic…' : 'Analyze network traffic'}
              </button>
            </div>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Activity
                size={19}
                className="mt-0.5 shrink-0 text-blue-300"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold text-blue-100">
                  KDD Cup 99 assessment
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  The model uses a KDD Cup 99 network-traffic feature set.
                  Results are AI-assisted decision support, not proof that an
                  actual intrusion occurred. Performance on real-world traffic
                  may differ.
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
              selected case and returns a finding ID.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={18}
                className="mt-0.5 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-slate-400">
                Enter authorized, appropriately transformed traffic features
                only. Do not enter network passwords or other sensitive
                credentials.
              </p>
            </div>
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
                Attack probability
              </p>
              <p className="mt-2 text-lg font-semibold text-red-200">
                {formatProbability(result.attack_probability)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Normal probability
              </p>
              <p className="mt-2 text-lg font-semibold text-emerald-200">
                {formatProbability(result.normal_probability)}
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
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Model
              </p>
              <p className="mt-2 text-sm font-medium text-slate-100">
                {result.model}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {result.dataset} · {result.input_features} features
              </p>
            </div>
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
