import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  CreditCard,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeCreditCardFraud,
  type CreditCardFraudFeatures,
  type CreditCardFraudResponse,
} from '../../services/aiAnalysisService'

type CreditCardFraudFeatureName = keyof CreditCardFraudFeatures

const TRANSACTION_FEATURES = ['Time', 'Amount'] as const satisfies readonly CreditCardFraudFeatureName[]
const PCA_FEATURES = [
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
  'V7',
  'V8',
  'V9',
  'V10',
  'V11',
  'V12',
  'V13',
  'V14',
  'V15',
  'V16',
  'V17',
  'V18',
  'V19',
  'V20',
  'V21',
  'V22',
  'V23',
  'V24',
  'V25',
  'V26',
  'V27',
  'V28',
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

export default function CreditCardFraud() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [featureValues, setFeatureValues] =
    useState<Record<CreditCardFraudFeatureName, string>>(
      createEmptyFeatureValues,
    )
  const [validationErrors, setValidationErrors] = useState<
    CreditCardFraudFeatureName[]
  >([])
  const [result, setResult] = useState<CreditCardFraudResponse | null>(null)
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    setAnalysisError('')
    setResult(null)
    if (!caseId) {
      setAnalysisError('Select a case before analyzing transaction features.')
      return
    }

    const invalidFeatures = FEATURE_NAMES.filter((featureName) => {
      const value = featureValues[featureName].trim()
      return value === '' || !Number.isFinite(Number(value))
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

  function updateFeature(
    featureName: CreditCardFraudFeatureName,
    value: string,
  ) {
    setFeatureValues((current) => ({ ...current, [featureName]: value }))
    setValidationErrors((current) =>
      current.filter((invalidFeature) => invalidFeature !== featureName),
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

  function renderFeatureInput(featureName: CreditCardFraudFeatureName) {
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
            hasError ? `credit-feature-error-${featureName}` : undefined
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

  const selectedCase = cases.find((caseItem) => String(caseItem.id) === caseId)
  const readyFeatureCount = FEATURE_NAMES.filter((featureName) => {
    const value = featureValues[featureName].trim()
    return value !== '' && Number.isFinite(Number(value))
  }).length

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Credit Card Fraud Detection
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Submit the transaction feature values required by the model and save
          its assessment to an investigation case.
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
              <CreditCard size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                Transaction features
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Provide all 30 finite numeric features expected by the model.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="credit-fraud-case"
                className="block text-sm font-medium text-slate-200"
              >
                Investigation case
              </label>
              <select
                id="credit-fraud-case"
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
                  The backend saves a successful analysis to this case.
                </p>
              )}
            </div>

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
                V1–V28 are transformed numerical features, not ordinary card
                details. Use values from an appropriate, authorized source.
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
                {isAnalyzing ? 'Analyzing transaction…' : 'Analyze transaction'}
              </button>
            </div>
          </div>
        </form>

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
                  This form does not request card numbers, CVV, expiry dates,
                  PINs, or banking credentials. V1–V28 are transformed model
                  features, not fields to replace with ordinary card data.
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
                  This is an experimental decision-support estimate, not a
                  guarantee of fraud detection. Incompatible or synthetic
                  feature values may produce misleading results.
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
                Fraud probability
              </p>
              <p className="mt-2 text-lg font-semibold text-red-200">
                {formatProbability(result.fraud_probability)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#242629] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Legitimate probability
              </p>
              <p className="mt-2 text-lg font-semibold text-emerald-200">
                {formatProbability(result.legitimate_probability)}
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
                {result.input_features} input features
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
