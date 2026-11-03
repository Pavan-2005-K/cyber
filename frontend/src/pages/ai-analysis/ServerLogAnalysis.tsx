import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  FileSearch,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeServerLog,
  type ServerLogAnalysisResponse,
  type ServerLogFeatures,
} from '../../services/aiAnalysisService'

type ServerLogFeatureName = keyof ServerLogFeatures

const FEATURE_NAMES = [
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'E6',
  'E7',
  'E8',
  'E9',
  'E10',
  'E11',
  'E12',
  'E13',
  'E14',
  'E15',
  'E16',
  'E17',
  'E18',
  'E19',
  'E20',
  'E21',
  'E22',
  'E23',
  'E24',
  'E25',
  'E26',
  'E27',
  'E28',
  'E29',
] as const satisfies readonly ServerLogFeatureName[]

function createEmptyFeatureValues(): Record<ServerLogFeatureName, string> {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, ''])) as Record<
    ServerLogFeatureName,
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

export default function ServerLogAnalysis() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [featureValues, setFeatureValues] =
    useState<Record<ServerLogFeatureName, string>>(createEmptyFeatureValues)
  const [invalidFeatures, setInvalidFeatures] = useState<
    ServerLogFeatureName[]
  >([])
  const [result, setResult] = useState<ServerLogAnalysisResponse | null>(null)
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

  function getNumericFeatures(): ServerLogFeatures {
    return {
      E1: Number(featureValues.E1),
      E2: Number(featureValues.E2),
      E3: Number(featureValues.E3),
      E4: Number(featureValues.E4),
      E5: Number(featureValues.E5),
      E6: Number(featureValues.E6),
      E7: Number(featureValues.E7),
      E8: Number(featureValues.E8),
      E9: Number(featureValues.E9),
      E10: Number(featureValues.E10),
      E11: Number(featureValues.E11),
      E12: Number(featureValues.E12),
      E13: Number(featureValues.E13),
      E14: Number(featureValues.E14),
      E15: Number(featureValues.E15),
      E16: Number(featureValues.E16),
      E17: Number(featureValues.E17),
      E18: Number(featureValues.E18),
      E19: Number(featureValues.E19),
      E20: Number(featureValues.E20),
      E21: Number(featureValues.E21),
      E22: Number(featureValues.E22),
      E23: Number(featureValues.E23),
      E24: Number(featureValues.E24),
      E25: Number(featureValues.E25),
      E26: Number(featureValues.E26),
      E27: Number(featureValues.E27),
      E28: Number(featureValues.E28),
      E29: Number(featureValues.E29),
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)
    if (!caseId) {
      setAnalysisError('Select a case before analyzing event-count features.')
      return
    }

    const invalid = FEATURE_NAMES.filter((featureName) => {
      const value = featureValues[featureName].trim()
      return value === '' || !Number.isFinite(Number(value)) || Number(value) < 0
    })
    setInvalidFeatures(invalid)
    if (invalid.length) {
      setAnalysisError(
        'Enter a finite, non-negative number for every event-count feature.',
      )
      return
    }

    submissionLock.current = true
    setIsAnalyzing(true)
    try {
      const analysis = await analyzeServerLog(
        Number(caseId),
        getNumericFeatures(),
      )
      setResult(analysis)
    } catch (error) {
      setAnalysisError(
        getApiErrorMessage(
          error,
          'Server log features could not be analyzed. Please try again.',
        ),
      )
    } finally {
      submissionLock.current = false
      setIsAnalyzing(false)
    }
  }

  function updateFeature(featureName: ServerLogFeatureName, value: string) {
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

  function renderFeatureInput(featureName: ServerLogFeatureName) {
    const hasError = invalidFeatures.includes(featureName)

    return (
      <div key={featureName} className="space-y-1.5">
        <label
          htmlFor={`server-log-${featureName}`}
          className="block text-xs font-medium text-slate-300"
        >
          {featureName}
          <span className="ml-1 text-red-300" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={`server-log-${featureName}`}
          type="number"
          min="0"
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
            hasError ? `server-log-error-${featureName}` : undefined
          }
          className={`w-full rounded-lg border bg-[#242629] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:ring-4 disabled:opacity-60 ${
            hasError
              ? 'border-red-400/50 focus:border-red-400 focus:ring-red-400/10'
              : 'border-white/10 hover:border-white/20 focus:border-blue-500 focus:ring-blue-500/10'
          }`}
          placeholder="Enter event count"
        />
        {hasError && (
          <p
            id={`server-log-error-${featureName}`}
            className="text-[11px] text-red-300"
          >
            Enter a finite number greater than or equal to zero.
          </p>
        )}
      </div>
    )
  }

  const selectedCase = cases.find((caseItem) => String(caseItem.id) === caseId)
  const completedFeatures = FEATURE_NAMES.filter((featureName) => {
    const value = featureValues[featureName].trim()
    return value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  }).length

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Server Log Analysis
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Submit numerical event-count features for model assessment and save
          the result to an investigation case.
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:p-7"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
              <Activity size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                HDFS event-count features
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Enter all 29 non-negative numerical feature values.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="server-log-case"
                className="block text-sm font-medium text-slate-200"
              >
                Investigation case
              </label>
              <select
                id="server-log-case"
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

            <div className="rounded-xl border border-white/[0.07] bg-[#292b2e] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Event-count values
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    The backend configuration does not define descriptions or
                    subgroups for individual E-fields.
                  </p>
                </div>
                <span className="rounded-full border border-blue-400/15 bg-blue-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-blue-200">
                  {completedFeatures} / 29 complete
                </span>
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURE_NAMES.map(renderFeatureInput)}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:justify-end">
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
              {isAnalyzing ? 'Analyzing features…' : 'Analyze server features'}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <FileSearch
                size={19}
                className="mt-0.5 shrink-0 text-blue-300"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold text-blue-100">
                  Feature-based input
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  The model expects numerical HDFS block-level event
                  occurrence counts. This page sends feature values; it does
                  not directly parse or upload raw server log files.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={19}
                className="mt-0.5 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold text-amber-100">
                  AI-assisted assessment
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  An anomaly prediction is not definitive proof of an
                  intrusion. Treat model output as decision support; real-world
                  performance requires independent evaluation.
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
                Anomaly probability
              </p>
              <p className="mt-2 text-lg font-semibold text-red-200">
                {formatProbability(result.anomaly_probability)}
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
                Model &amp; dataset
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
