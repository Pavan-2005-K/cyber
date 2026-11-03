import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  CircleHelp,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  UserRoundSearch,
} from 'lucide-react'
import { getCases, type Case } from '../../services/caseService'
import {
  analyzeFakeProfile,
  type FakeProfileRequest,
  type FakeProfileResponse,
} from '../../services/aiAnalysisService'

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
        <span className="mt-1 block text-xs text-slate-500">{description}</span>
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

export default function FakeProfile() {
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [profile, setProfile] = useState<FakeProfileRequest>(EMPTY_PROFILE)
  const [result, setResult] = useState<FakeProfileResponse | null>(null)
  const [casesError, setCasesError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
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

  function updateProfile<K extends keyof FakeProfileRequest>(
    key: K,
    value: FakeProfileRequest[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }))
    setResult(null)
    setAnalysisError('')
    setSuccessMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return
    setAnalysisError('')
    setSuccessMessage('')
    setResult(null)

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
      setAnalysisError('Profile description cannot exceed 5,000 characters.')
      return
    }
    if (profile.external_url.length > 2048) {
      setAnalysisError('External URL cannot exceed 2,048 characters.')
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
      const analysis = await analyzeFakeProfile(Number(caseId), requestData)
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

  function resetAnalysis() {
    setProfile(EMPTY_PROFILE)
    setResult(null)
    setAnalysisError('')
    setSuccessMessage('')
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

  function handleTextChange(
    key: 'username' | 'fullname' | 'description' | 'external_url',
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    updateProfile(key, event.target.value)
  }

  const selectedCase = cases.find((caseItem) => String(caseItem.id) === caseId)

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          AI Analysis
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Fake Profile Detection
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          Analyze profile attributes with the CyberFusion model and associate
          the result with an investigation case.
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

      {successMessage && result && (
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
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
                Profile attributes
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Enter the available profile details. Optional fields can be
                left blank.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
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
                  setResult(null)
                  setAnalysisError('')
                  setSuccessMessage('')
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
                  The analysis finding will be saved to this case.
                </p>
              )}
            </div>

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
                  onChange={(event) => handleTextChange('username', event)}
                  minLength={1}
                  maxLength={100}
                  required
                  disabled={isAnalyzing}
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
                  onChange={(event) => handleTextChange('fullname', event)}
                  maxLength={200}
                  disabled={isAnalyzing}
                  placeholder="Example User"
                  className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
                />
                <p className="text-right text-[11px] text-slate-600">
                  {profile.fullname.length}/200
                </p>
              </div>
            </div>

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
                onChange={(event) => handleTextChange('description', event)}
                maxLength={5000}
                rows={4}
                disabled={isAnalyzing}
                placeholder="Enter the profile bio or description"
                className="w-full resize-y rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
              />
              <p className="text-right text-[11px] text-slate-600">
                {profile.description.length}/5000
              </p>
            </div>

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
                onChange={(event) => handleTextChange('external_url', event)}
                maxLength={2048}
                disabled={isAnalyzing}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
              />
              <p className="text-right text-[11px] text-slate-600">
                {profile.external_url.length}/2048
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleField
                id="has_profile_picture"
                label="Profile picture"
                description="Does the account have a profile photo?"
                checked={profile.has_profile_picture}
                disabled={isAnalyzing}
                onChange={(checked) =>
                  updateProfile('has_profile_picture', checked)
                }
              />
              <ToggleField
                id="is_private"
                label="Private account"
                description="Is the profile set to private?"
                checked={profile.is_private}
                disabled={isAnalyzing}
                onChange={(checked) => updateProfile('is_private', checked)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                id="posts"
                label="Posts"
                value={profile.posts}
                disabled={isAnalyzing}
                onChange={(value) => updateProfile('posts', value)}
              />
              <NumberField
                id="followers"
                label="Followers"
                value={profile.followers}
                disabled={isAnalyzing}
                onChange={(value) => updateProfile('followers', value)}
              />
              <NumberField
                id="following"
                label="Following"
                value={profile.following}
                disabled={isAnalyzing}
                onChange={(value) => updateProfile('following', value)}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:justify-end">
            {(result || profile.username) && (
              <button
                type="button"
                onClick={resetAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 sm:py-2.5"
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset
              </button>
            )}
            <button
              type="submit"
              disabled={
                isAnalyzing || isLoadingCases || !caseId || !profile.username.trim()
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

        <aside className="space-y-4">
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
                  The result is a model-based estimate. It does not verify
                  account ownership or prove that a profile is fake. Use it as
                  decision support alongside independent investigation.
                </p>
              </div>
            </div>
          </div>

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
              Successful analysis automatically saves a detection finding to
              the selected case. No extra save action is needed.
            </p>
          </div>

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
                    {(result.confidence * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-blue-400"
                    style={{
                      width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
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
