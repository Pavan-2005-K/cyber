import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  BadgeCheck,
  Clock3,
  FileCheck2,
  FilePlus2,
  FileWarning,
  Fingerprint,
  FolderOpen,
  History,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Upload,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getCases, type Case } from '../../services/caseService'
import {
  getEvidenceByCase,
  getEvidenceIntegrityRecords,
  recordEvidenceIntegrity,
  uploadEvidence,
  verifyCaseIntegrityChain,
  verifyEvidence,
  type CaseIntegrityChainResponse,
  type Evidence,
  type EvidenceVerificationResponse,
  type IntegrityRecord,
  type IntegrityRecordResponse,
} from '../../services/evidenceService'

const ACCEPTED_EXTENSIONS = [
  '.eml',
  '.txt',
  '.csv',
  '.json',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]
const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',')
const MAX_FILE_SIZE = 10 * 1024 * 1024

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
            if (location.length === 0) return message

            const [source, ...fieldPath] = location
            const field = fieldPath.length ? fieldPath.join('.') : String(source)
            if ('type' in item && item.type === 'missing') {
              return `Missing required field: ${field}.`
            }
            return `${field}: ${message}`
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

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function VerificationBadge({
  result,
}: {
  result?: EvidenceVerificationResponse
}) {
  if (!result) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-400">
        <Clock3 size={13} aria-hidden="true" />
        Not verified
      </span>
    )
  }

  if (result.status === 'FILE_MISSING') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-300">
        <FileWarning size={13} aria-hidden="true" />
        File Missing
      </span>
    )
  }

  if (result.status === 'INTEGRITY_VERIFIED' && result.integrity_verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">
        <BadgeCheck size={13} aria-hidden="true" />
        Integrity Verified
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[11px] text-red-300">
      <ShieldX size={13} aria-hidden="true" />
      Hash Mismatch
    </span>
  )
}

type UploadEvidenceModalProps = {
  cases: Case[]
  initialCaseId: string
  onClose: () => void
  onUploaded: (caseId: number, result: Awaited<ReturnType<typeof uploadEvidence>>) => void
}

function UploadEvidenceModal({
  cases,
  initialCaseId,
  onClose,
  onUploaded,
}: UploadEvidenceModalProps) {
  const [caseId, setCaseId] = useState(initialCaseId)
  const [file, setFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionLock = useRef(false)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setErrorMessage('')
    setFile(event.target.files?.[0] ?? null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return
    setErrorMessage('')

    if (!caseId) {
      setErrorMessage('Select a case for this evidence.')
      return
    }
    if (!file) {
      setErrorMessage('Choose a file to upload.')
      return
    }
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setErrorMessage(
        `Unsupported file type. Accepted types: ${ACCEPTED_EXTENSIONS.join(', ')}.`,
      )
      return
    }
    if (file.size === 0) {
      setErrorMessage('Empty files are not allowed.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('The file cannot exceed 10 MiB.')
      return
    }

    submissionLock.current = true
    setIsSubmitting(true)
    try {
      const result = await uploadEvidence(Number(caseId), file)
      onUploaded(Number(caseId), result)
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, 'Evidence could not be uploaded. Try again.'),
      )
    } finally {
      submissionLock.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-evidence-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#303236] p-5 shadow-2xl shadow-black/50 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
              Evidence management
            </p>
            <h2
              id="upload-evidence-title"
              className="mt-2 text-xl font-semibold text-white"
            >
              Upload evidence
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Associate a file with one of your investigation cases.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
            >
              {errorMessage}
            </p>
          )}

          <div className="space-y-2">
            <label
              htmlFor="evidence-case"
              className="block text-sm font-medium text-slate-200"
            >
              Case <span className="text-red-300">*</span>
            </label>
            <select
              id="evidence-case"
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              required
              disabled={isSubmitting}
              className="w-full rounded-xl border border-white/10 bg-[#242629] px-4 py-3 text-sm text-slate-100 outline-none transition hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
            >
              {cases.map((caseItem) => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.case_number} — {caseItem.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="evidence-file"
              className="block text-sm font-medium text-slate-200"
            >
              Evidence file <span className="text-red-300">*</span>
            </label>
            <input
              id="evidence-file"
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="block w-full cursor-pointer rounded-xl border border-white/10 bg-[#242629] text-sm text-slate-300 file:mr-4 file:border-0 file:bg-blue-500/15 file:px-4 file:py-3 file:font-medium file:text-blue-300 hover:file:bg-blue-500/25"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              Accepted: {ACCEPTED_EXTENSIONS.join(', ')}. Maximum size: 10 MiB.
            </p>
            {file && (
              <p className="break-all rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs text-slate-300">
                {file.name} <span className="text-slate-500">·</span>{' '}
                {formatFileSize(file.size)}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 sm:py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !caseId || !file}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5"
            >
              {isSubmitting ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Upload size={16} aria-hidden="true" />
              )}
              {isSubmitting ? 'Uploading…' : 'Upload evidence'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

type EvidenceRowProps = {
  evidence: Evidence
  verification?: EvidenceVerificationResponse
  isExpanded: boolean
  records?: IntegrityRecord[]
  isActionBusy: boolean
  isLoadingRecords: boolean
  onVerify: (evidenceId: number) => void
  onRecord: (evidenceId: number) => void
  onToggleRecords: (evidenceId: number) => void
}

function EvidenceRow({
  evidence,
  verification,
  isExpanded,
  records,
  isActionBusy,
  isLoadingRecords,
  onVerify,
  onRecord,
  onToggleRecords,
}: EvidenceRowProps) {
  return (
    <>
      <tr className="align-top transition hover:bg-white/[0.025]">
        <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-400">
          #{evidence.id}
        </td>
        <td className="max-w-56 px-4 py-4">
          <p
            className="break-all text-sm font-medium text-slate-100"
            title={evidence.original_filename}
          >
            {evidence.original_filename}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Case #{evidence.case_id}
          </p>
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-300">
          {formatFileSize(evidence.file_size)}
        </td>
        <td className="max-w-36 break-all px-4 py-4 text-xs text-slate-400">
          {evidence.media_type || 'Unknown'}
        </td>
        <td className="max-w-52 px-4 py-4">
          <code
            className="block break-all font-mono text-[11px] leading-relaxed text-slate-400"
            title={evidence.sha256_hash}
          >
            {evidence.sha256_hash}
          </code>
        </td>
        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-400">
          {formatDate(evidence.uploaded_at)}
        </td>
        <td className="whitespace-nowrap px-4 py-4">
          <VerificationBadge result={verification} />
        </td>
        <td className="px-4 py-4">
          <div className="flex min-w-40 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onVerify(evidence.id)}
              disabled={isActionBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400/20 bg-blue-500/10 px-2.5 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={14} aria-hidden="true" />
              Verify
            </button>
            <button
              type="button"
              onClick={() => onRecord(evidence.id)}
              disabled={isActionBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Fingerprint size={14} aria-hidden="true" />
              Record integrity
            </button>
            <button
              type="button"
              onClick={() => onToggleRecords(evidence.id)}
              disabled={isActionBusy}
              aria-expanded={isExpanded}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <History size={14} aria-hidden="true" />
              {isExpanded ? 'Hide records' : 'Records'}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-t border-white/[0.04] bg-[#242629]/70">
          <td colSpan={8} className="px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Integrity records
            </p>
            {isLoadingRecords ? (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
                Loading integrity records…
              </p>
            ) : records?.length ? (
              <div className="space-y-3">
                {records.map((record) => (
                  <div
                    key={record.record_id}
                    className="grid gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs sm:grid-cols-2 xl:grid-cols-4"
                  >
                    <p className="text-slate-400">
                      Record{' '}
                      <span className="font-mono text-slate-200">
                        #{record.record_id}
                      </span>
                    </p>
                    <p className="text-slate-400">
                      Chain / sequence:{' '}
                      <span className="text-slate-200">
                        {record.chain_id ?? 'Legacy'} /{' '}
                        {record.sequence_number ?? '—'}
                      </span>
                    </p>
                    <p className="text-slate-400">
                      Recorded: {formatDate(record.recorded_at)}
                    </p>
                    <p className="text-slate-400">
                      Version: {record.hash_version ?? 'Legacy'}
                    </p>
                    <p className="text-slate-400">
                      Signature:{' '}
                      <span className="text-slate-200">
                        {record.checkpoint === undefined
                          ? 'Not reported'
                          : record.checkpoint
                            ? `Ed25519 · ${record.checkpoint.key_id}`
                            : 'Historical unsigned'}
                      </span>
                    </p>
                    <p className="break-all text-slate-500 sm:col-span-2">
                      Evidence SHA-256:{' '}
                      <code className="font-mono text-slate-300">
                        {record.sha256_hash}
                      </code>
                    </p>
                    <p className="break-all text-slate-500 sm:col-span-2">
                      Record hash:{' '}
                      <code className="font-mono text-slate-300">
                        {record.record_hash}
                      </code>
                    </p>
                    <p className="break-all text-slate-500 sm:col-span-2">
                      Previous hash:{' '}
                      <code className="font-mono text-slate-300">
                        {record.previous_record_hash}
                      </code>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No integrity records have been recorded for this evidence.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function EvidenceTableSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-label="Loading evidence">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-14 animate-pulse rounded-xl bg-white/[0.04]"
        />
      ))}
    </div>
  )
}

export default function EvidenceManagement({
  integrityOnly = false,
}: {
  integrityOnly?: boolean
}) {
  const navigate = useNavigate()
  const actionLock = useRef(false)
  const chainLock = useRef(false)
  const [cases, setCases] = useState<Case[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [isLoadingCases, setIsLoadingCases] = useState(true)
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true)
  const [casesError, setCasesError] = useState('')
  const [evidenceError, setEvidenceError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [casesReload, setCasesReload] = useState(0)
  const [evidenceReload, setEvidenceReload] = useState(0)
  const [verificationById, setVerificationById] = useState<
    Record<number, EvidenceVerificationResponse>
  >({})
  const [recordsByEvidenceId, setRecordsByEvidenceId] = useState<
    Record<number, IntegrityRecord[]>
  >({})
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null)
  const [busyEvidenceId, setBusyEvidenceId] = useState<number | null>(null)
  const [isLoadingRecordsId, setIsLoadingRecordsId] = useState<number | null>(
    null,
  )
  const [isVerifyingChain, setIsVerifyingChain] = useState(false)
  const [chainResult, setChainResult] =
    useState<CaseIntegrityChainResponse | null>(null)
  const [chainError, setChainError] = useState('')

  useEffect(() => {
    let active = true

    getCases()
      .then((data) => {
        if (!active) return
        setCases(data)
        if (data.length === 0) {
          setEvidence([])
          setIsLoadingEvidence(false)
        } else {
          setIsLoadingEvidence(true)
          setEvidenceReload((count) => count + 1)
        }
        setSelectedCaseId((current) =>
          data.some((caseItem) => String(caseItem.id) === current)
            ? current
            : data[0]
              ? String(data[0].id)
              : '',
        )
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
  }, [casesReload])

  useEffect(() => {
    if (!selectedCaseId) return

    let active = true

    getEvidenceByCase(Number(selectedCaseId))
      .then((data) => {
        if (active) setEvidence(data)
      })
      .catch((error: unknown) => {
        if (active) {
          setEvidenceError(
            getApiErrorMessage(error, 'Evidence could not be loaded.'),
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingEvidence(false)
      })

    return () => {
      active = false
    }
  }, [selectedCaseId, evidenceReload])

  const selectedCase = useMemo(
    () => cases.find((caseItem) => String(caseItem.id) === selectedCaseId),
    [cases, selectedCaseId],
  )

  function refreshCases() {
    setIsLoadingCases(true)
    setCasesError('')
    setCasesReload((count) => count + 1)
  }

  function refreshEvidence() {
    setSuccessMessage('')
    setEvidenceError('')
    setIsLoadingEvidence(true)
    setRecordsByEvidenceId({})
    setExpandedRecordId(null)
    setEvidenceReload((count) => count + 1)
  }

  function handleUploaded(
    caseId: number,
    result: Awaited<ReturnType<typeof uploadEvidence>>,
  ) {
    setSelectedCaseId(String(caseId))
    setSuccessMessage(
      `Uploaded ${result.original_filename}. SHA-256: ${result.sha256_hash}`,
    )
    setEvidenceError('')
    setIsLoadingEvidence(true)
    setEvidenceReload((count) => count + 1)
    setIsUploadOpen(false)
    setActionError('')
  }

  async function handleVerifyEvidence(evidenceId: number) {
    if (actionLock.current) return
    actionLock.current = true
    setBusyEvidenceId(evidenceId)
    setActionError('')
    try {
      const result = await verifyEvidence(evidenceId)
      setVerificationById((current) => ({ ...current, [evidenceId]: result }))
      setSuccessMessage(result.message)
    } catch (error) {
      setActionError(
        getApiErrorMessage(error, 'Evidence integrity could not be verified.'),
      )
    } finally {
      actionLock.current = false
      setBusyEvidenceId(null)
    }
  }

  async function handleRecordIntegrity(evidenceId: number) {
    if (actionLock.current) return
    actionLock.current = true
    setBusyEvidenceId(evidenceId)
    setActionError('')
    try {
      const result: IntegrityRecordResponse =
        await recordEvidenceIntegrity(evidenceId)
      setSuccessMessage(
        `${result.message} Record #${result.record_id}, sequence ${result.sequence_number}.`,
      )
      setChainResult(null)
      setChainError('')
      const records = await getEvidenceIntegrityRecords(evidenceId)
      setRecordsByEvidenceId((current) => ({
        ...current,
        [evidenceId]: records,
      }))
      setExpandedRecordId(evidenceId)
    } catch (error) {
      setActionError(
        getApiErrorMessage(error, 'The integrity record could not be created.'),
      )
    } finally {
      actionLock.current = false
      setBusyEvidenceId(null)
    }
  }

  async function handleToggleRecords(evidenceId: number) {
    if (expandedRecordId === evidenceId) {
      setExpandedRecordId(null)
      return
    }

    setExpandedRecordId(evidenceId)
    if (recordsByEvidenceId[evidenceId]) return

    setIsLoadingRecordsId(evidenceId)
    setActionError('')
    try {
      const records = await getEvidenceIntegrityRecords(evidenceId)
      setRecordsByEvidenceId((current) => ({
        ...current,
        [evidenceId]: records,
      }))
    } catch (error) {
      setExpandedRecordId(null)
      setActionError(
        getApiErrorMessage(error, 'Integrity records could not be loaded.'),
      )
    } finally {
      setIsLoadingRecordsId(null)
    }
  }

  async function handleVerifyCaseChain() {
    if (!selectedCaseId || chainLock.current) return
    chainLock.current = true
    setIsVerifyingChain(true)
    setActionError('')
    setChainError('')
    setChainResult(null)
    setSuccessMessage('')
    try {
      const result = await verifyCaseIntegrityChain(Number(selectedCaseId))
      setChainResult(result)
    } catch (error) {
      setChainError(
        getApiErrorMessage(error, 'The case integrity chain could not be verified.'),
      )
    } finally {
      chainLock.current = false
      setIsVerifyingChain(false)
    }
  }

  function handleCaseChange(value: string) {
    setSelectedCaseId(value)
    setIsLoadingEvidence(Boolean(value))
    setEvidenceError('')
    setEvidence([])
    setVerificationById({})
    setRecordsByEvidenceId({})
    setExpandedRecordId(null)
    setActionError('')
    setSuccessMessage('')
    setChainResult(null)
    setChainError('')
  }

  const checkpointStatus = chainResult?.checkpoint_verification?.status
  const checkpointVerificationPassed =
    checkpointStatus === undefined ||
    [
      'VALID',
      'VALID_WITH_HISTORICAL_UNSIGNED',
      'HISTORICAL_UNSIGNED',
      'NOT_APPLICABLE',
    ].includes(checkpointStatus)
  const chainVerificationPassed = Boolean(
    chainResult?.chain_valid && checkpointVerificationPassed,
  )

  return (
    <section className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
            Investigation
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {integrityOnly
              ? 'Evidence Integrity Verification'
              : 'Evidence Management'}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            {integrityOnly
              ? 'Verify individual evidence file hashes, review integrity records, and inspect the selected case integrity chain.'
              : 'Upload case evidence, verify stored file hashes, and manage integrity-chain records.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="selected-evidence-case">
            Select case
          </label>
          <select
            id="selected-evidence-case"
            value={selectedCaseId}
            onChange={(event) => handleCaseChange(event.target.value)}
            disabled={isLoadingCases || cases.length === 0}
            className="min-w-52 flex-1 rounded-xl border border-white/[0.1] bg-[#303236] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition hover:border-white/20 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50 sm:flex-none"
          >
            {cases.length === 0 && <option value="">No cases available</option>}
            {cases.map((caseItem) => (
              <option key={caseItem.id} value={caseItem.id}>
                {caseItem.case_number} — {caseItem.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refreshEvidence}
            disabled={isLoadingEvidence || !selectedCaseId}
            aria-label="Refresh evidence"
            title="Refresh evidence"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-[#303236] px-3.5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-[#383a3f] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={isLoadingEvidence ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          {!integrityOnly && (
            <button
              type="button"
              onClick={() => {
                setSuccessMessage('')
                setActionError('')
                setIsUploadOpen(true)
              }}
              disabled={isLoadingCases || cases.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FilePlus2 size={16} aria-hidden="true" />
              Upload evidence
            </button>
          )}
        </div>
      </div>

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
            onClick={refreshCases}
            className="self-start rounded-lg border border-red-300/20 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-400/10 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-300"
        >
          <BadgeCheck
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span className="break-all">{successMessage}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{actionError}</span>
        </div>
      )}

      {!isLoadingCases && !casesError && cases.length === 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-[#303236] px-6 py-14 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
            <FolderOpen size={22} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-white">
            No cases available
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
            {integrityOnly
              ? 'Create an investigation case first, then add evidence to verify its integrity.'
              : 'Evidence must be associated with an existing case. Create a case before uploading evidence.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/cases')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            <FolderOpen size={16} aria-hidden="true" />
            Go to Cases
          </button>
        </div>
      )}

      {isLoadingCases && (
        <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-6">
          <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
      )}

      {selectedCase && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.07] bg-[#303236] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Evidence in case
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {isLoadingEvidence ? '—' : evidence.length}
                  </p>
                </div>
                <span className="flex size-11 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <FileCheck2 size={21} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-2 truncate text-xs text-slate-500">
                {selectedCase.case_number} · {selectedCase.title}
              </p>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.07] bg-[#303236] p-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Case integrity-chain verification
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Validate the stored hash chain for this case. This is
                  separate from verifying an individual evidence file hash.
                </p>
              </div>
              <button
                type="button"
                onClick={handleVerifyCaseChain}
                disabled={
                  isVerifyingChain ||
                  isLoadingEvidence ||
                  busyEvidenceId !== null
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3.5 py-2.5 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVerifyingChain ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Fingerprint size={16} aria-hidden="true" />
                )}
                {isVerifyingChain
                  ? 'Verifying…'
                  : 'Verify case integrity chain'}
              </button>
            </div>
          </div>

          {chainError && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="flex items-center gap-2 text-sm text-red-300">
                <AlertCircle size={17} aria-hidden="true" />
                {chainError}
              </p>
              <button
                type="button"
                onClick={handleVerifyCaseChain}
                disabled={isVerifyingChain}
                className="self-start rounded-lg border border-red-300/20 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
              >
                Retry verification
              </button>
            </div>
          )}

          {chainResult && (
            <div
              className={`rounded-2xl border p-4 ${
                chainVerificationPassed
                  ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
                  : 'border-red-400/20 bg-red-400/[0.06]'
              }`}
              role="status"
            >
              <div className="flex items-start gap-3">
                {chainVerificationPassed ? (
                  <ShieldCheck
                    size={19}
                    className="mt-0.5 shrink-0 text-emerald-300"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldX
                    size={19}
                    className="mt-0.5 shrink-0 text-red-300"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold ${
                      chainVerificationPassed
                        ? 'text-emerald-300'
                        : 'text-red-300'
                    }`}
                  >
                    {chainResult.chain_valid && !checkpointVerificationPassed
                      ? `Local integrity chain passed; checkpoint verification: ${checkpointStatus}.`
                      : chainResult.message}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Case integrity-chain verification ·{' '}
                    {chainResult.records_checked} record(s) checked
                    {chainResult.chain_id !== null &&
                      ` · Chain #${chainResult.chain_id}`}
                    {' · '}Legacy: {chainResult.verification.legacy}
                    {' · '}Case chain: {chainResult.verification.case_chain_v2}
                    {' · '}Ed25519:{' '}
                    {chainResult.checkpoint_verification?.status ??
                      'NOT_REPORTED'}
                  </p>
                  {(chainResult.checkpoint_verification?.checkpoints.length ??
                    0) > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Signing key(s):{' '}
                      {[
                        ...new Set(
                          chainResult.checkpoint_verification?.checkpoints.map(
                            (checkpoint) => checkpoint.key_id,
                          ) ?? [],
                        ),
                      ].join(', ')}
                      {' · '}SQLite-only; no independent anchor
                    </p>
                  )}
                  {(chainResult.checkpoint_verification?.errors.length ?? 0) >
                    0 && (
                    <ul className="mt-3 space-y-1 text-xs text-red-200">
                      {chainResult.checkpoint_verification?.errors.map(
                        (error, index) => (
                          <li
                            key={`${error.checkpoint_id ?? error.sequence_number}-${index}`}
                          >
                            Checkpoint
                            {error.sequence_number
                              ? ` #${error.sequence_number}`
                              : ''}
                            : {error.problem}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                  {chainResult.errors.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-red-200">
                      {chainResult.errors.map((error, index) => (
                        <li key={`${error.record_id}-${index}`}>
                          Record #{error.record_id}: {error.problem}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#303236]">
            <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Case evidence
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Files and integrity metadata for the selected case.
                </p>
              </div>
              {selectedCase && !isLoadingEvidence && !evidenceError && (
                <span className="self-start rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-xs text-slate-400 sm:self-auto">
                  <span className="font-semibold text-slate-200">
                    {evidence.length}
                  </span>{' '}
                  {evidence.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>

            {evidenceError ? (
              <div className="px-6 py-12 text-center">
                <AlertCircle
                  size={24}
                  className="mx-auto text-red-300"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-red-300">{evidenceError}</p>
                <button
                  type="button"
                  onClick={refreshEvidence}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05]"
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : isLoadingEvidence ? (
              <EvidenceTableSkeleton />
            ) : evidence.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-slate-400">
                  <Upload size={21} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-white">
                  No evidence uploaded
                </h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  {integrityOnly
                    ? 'There is no evidence to verify for this case yet.'
                    : 'Upload evidence to begin managing files for this case.'}
                </p>
                {!integrityOnly && (
                  <button
                    type="button"
                    onClick={() => setIsUploadOpen(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
                  >
                    <FilePlus2 size={16} aria-hidden="true" />
                    Upload evidence
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left">
                  <thead className="border-b border-white/[0.06] bg-white/[0.02]">
                    <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <th scope="col" className="px-4 py-3">
                        Evidence ID
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Original filename
                      </th>
                      <th scope="col" className="px-4 py-3">
                        File size
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Media type
                      </th>
                      <th scope="col" className="px-4 py-3">
                        SHA-256 hash
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Upload date
                      </th>
                      <th scope="col" className="px-4 py-3">
                        File hash verification
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {evidence.map((item) => (
                      <EvidenceRow
                        key={item.id}
                        evidence={item}
                        verification={verificationById[item.id]}
                        isExpanded={expandedRecordId === item.id}
                        records={recordsByEvidenceId[item.id]}
                        isActionBusy={busyEvidenceId !== null}
                        isLoadingRecords={isLoadingRecordsId === item.id}
                        onVerify={handleVerifyEvidence}
                        onRecord={handleRecordIntegrity}
                        onToggleRecords={handleToggleRecords}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!integrityOnly && isUploadOpen && cases.length > 0 && (
        <UploadEvidenceModal
          cases={cases}
          initialCaseId={selectedCaseId}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      )}
    </section>
  )
}
