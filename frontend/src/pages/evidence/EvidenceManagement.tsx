
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
              'msg' in item && typeof item.msg === 'string'
                ? item.msg
                : null

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
            const field = fieldPath.length
              ? fieldPath.join('.')
              : String(source)

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

/* ─────────────────────────────────────────────
   Verification Status
───────────────────────────────────────────── */

function VerificationBadge({
  result,
}: {
  result?: EvidenceVerificationResponse
}) {
  if (!result) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border theme-divider theme-card-secondary px-2 py-1 text-[11px] theme-text-muted">
        <Clock3 size={13} />
        Not verified
      </span>
    )
  }

  if (result.status === 'FILE_MISSING') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[11px] text-amber-600 dark:text-amber-300">
        <FileWarning size={13} />
        File missing
      </span>
    )
  }

  if (result.status === 'INTEGRITY_VERIFIED' && result.integrity_verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-300">
        <BadgeCheck size={13} />
        Verified
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-400/20 bg-red-400/[0.06] px-2 py-1 text-[11px] text-red-600 dark:text-red-300">
      <ShieldX size={13} />
      Hash mismatch
    </span>
  )
}

/* ─────────────────────────────────────────────
   Upload Evidence Modal
───────────────────────────────────────────── */

type UploadEvidenceModalProps = {
  cases: Case[]
  initialCaseId: string
  onClose: () => void
  onUploaded: (
    caseId: number,
    result: Awaited<ReturnType<typeof uploadEvidence>>,
  ) => void
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-evidence-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto theme-popup rounded-2xl p-5 shadow-2xl shadow-black/50 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-purple-500 dark:text-[#b6a1f5]">
              <FilePlus2 size={14} />
              Evidence
            </div>

            <h2
              id="upload-evidence-title"
              className="mt-2 text-lg font-semibold theme-text"
            >
              Upload evidence
            </h2>

            <p className="mt-1 text-sm theme-text-secondary">
              Attach a file to an investigation.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-2 theme-text-muted theme-hover disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-sm text-red-600 dark:text-red-300"
            >
              {errorMessage}
            </p>
          )}

          <div className="space-y-2">
            <label
              htmlFor="evidence-case"
              className="block text-xs font-medium theme-text-secondary"
            >
              Investigation case <span className="text-red-500">*</span>
            </label>

            <select
              id="evidence-case"
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              required
              disabled={isSubmitting}
              className="theme-input w-full rounded-lg px-3 py-3 text-sm outline-none focus:border-[#9b82e8] focus:ring-2 focus:ring-[#9b82e8]/10 disabled:opacity-60"
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
              className="block text-xs font-medium theme-text-secondary"
            >
              Evidence file <span className="text-red-500">*</span>
            </label>

            <div className="theme-card-secondary rounded-xl border-dashed p-4 transition hover:border-[#9b82e8]/50">
              <input
                id="evidence-file"
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={handleFileChange}
                disabled={isSubmitting}
                className="block w-full cursor-pointer text-sm theme-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-[#9b82e8]/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-purple-600 dark:file:text-[#b6a1f5] hover:file:bg-[#9b82e8]/20"
              />

              <p className="mt-3 text-xs leading-relaxed theme-text-muted">
                EML, TXT, CSV, JSON, PDF and image files · Max 10 MiB
              </p>
            </div>

            {file && (
              <div className="flex items-center gap-3 theme-card-secondary rounded-lg px-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#9b82e8]/10 text-purple-500 dark:text-[#b6a1f5]">
                  <FileCheck2 size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="break-all text-xs font-medium theme-text">
                    {file.name}
                  </p>
                  <p className="mt-1 text-xs theme-text-muted">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="theme-button rounded-lg px-4 py-2.5 text-sm theme-hover disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !caseId || !file}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9b82e8] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8b72d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              {isSubmitting ? 'Uploading…' : 'Upload evidence'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Evidence Row
───────────────────────────────────────────── */

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
      <tr className="align-top transition-colors theme-hover">
        <td className="whitespace-nowrap px-4 py-4 font-mono text-xs theme-text-muted">
          #{evidence.id}
        </td>

        <td className="max-w-56 px-4 py-4">
          <p
            className="break-all text-sm font-medium theme-text"
            title={evidence.original_filename}
          >
            {evidence.original_filename}
          </p>

          <p className="mt-1 text-xs theme-text-muted">
            Case #{evidence.case_id}
          </p>
        </td>

        <td className="whitespace-nowrap px-4 py-4 text-xs theme-text-secondary">
          {formatFileSize(evidence.file_size)}
        </td>

        <td className="max-w-36 break-all px-4 py-4 text-xs theme-text-secondary">
          {evidence.media_type || 'Unknown'}
        </td>

        <td className="max-w-52 px-4 py-4">
          <code
            className="block break-all font-mono text-[10px] leading-relaxed theme-text-muted"
            title={evidence.sha256_hash}
          >
            {evidence.sha256_hash}
          </code>
        </td>

        <td className="whitespace-nowrap px-4 py-4 text-xs theme-text-secondary">
          {formatDate(evidence.uploaded_at)}
        </td>

        <td className="whitespace-nowrap px-4 py-4">
          <VerificationBadge result={verification} />
        </td>

        <td className="px-4 py-4">
          <div className="flex min-w-40 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onVerify(evidence.id)}
              disabled={isActionBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#9b82e8]/20 bg-[#9b82e8]/[0.07] px-2.5 py-2 text-xs text-purple-600 dark:text-[#b6a1f5] hover:bg-[#9b82e8]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={13} />
              Verify
            </button>

            <button
              type="button"
              onClick={() => onRecord(evidence.id)}
              disabled={isActionBusy}
              className="inline-flex items-center gap-1.5 rounded-md border theme-divider theme-button px-2.5 py-2 text-xs theme-text-secondary theme-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Fingerprint size={13} />
              Record
            </button>

            <button
              type="button"
              onClick={() => onToggleRecords(evidence.id)}
              disabled={isActionBusy}
              aria-expanded={isExpanded}
              className="inline-flex items-center gap-1.5 rounded-md border theme-divider theme-button px-2.5 py-2 text-xs theme-text-secondary theme-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <History size={13} />
              {isExpanded ? 'Hide' : 'History'}
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-t theme-divider theme-card-secondary">
          <td colSpan={8} className="px-5 py-4">
            <p className="mb-3 text-xs font-medium theme-text-secondary">
              Integrity history
            </p>

            {isLoadingRecords ? (
              <p className="flex items-center gap-2 text-xs theme-text-muted">
                <LoaderCircle size={14} className="animate-spin" />
                Loading integrity records…
              </p>
            ) : records?.length ? (
              <div className="space-y-2">
                {records.map((record) => (
                  <div
                    key={record.record_id}
                    className="grid gap-3 theme-card rounded-lg p-3 text-xs sm:grid-cols-2 xl:grid-cols-4"
                  >
                    <p className="theme-text-muted">
                      Record{' '}
                      <span className="font-mono theme-text-secondary">
                        #{record.record_id}
                      </span>
                    </p>

                    <p className="theme-text-muted">
                      Chain / sequence:{ ' '}
                      <span className="theme-text-secondary">
                        {record.chain_id ?? 'Legacy'} /{' '}
                        {record.sequence_number ?? '—'}
                      </span>
                    </p>

                    <p className="theme-text-muted">
                      Recorded:{ ' '}
                      <span className="theme-text-secondary">
                        {formatDate(record.recorded_at)}
                      </span>
                    </p>

                    <p className="theme-text-muted">
                      Version:{ ' '}
                      <span className="theme-text-secondary">
                        {record.hash_version ?? 'Legacy'}
                      </span>
                    </p>

                    <p className="theme-text-muted">
                      Signature:{ ' '}
                      <span className="theme-text-secondary">
                        {record.checkpoint === undefined
                          ? 'Not reported'
                          : record.checkpoint
                            ? `Ed25519 · ${record.checkpoint.key_id}`
                            : 'Historical unsigned'}
                      </span>
                    </p>

                    <p className="break-all theme-text-muted sm:col-span-2">
                      Evidence SHA-256:{ ' '}
                      <code className="font-mono theme-text-secondary">
                        {record.sha256_hash}
                      </code>
                    </p>

                    <p className="break-all theme-text-muted sm:col-span-2">
                      Record hash:{ ' '}
                      <code className="font-mono theme-text-secondary">
                        {record.record_hash}
                      </code>
                    </p>

                    <p className="break-all theme-text-muted sm:col-span-2">
                      Previous hash:{ ' '}
                      <code className="font-mono theme-text-secondary">
                        {record.previous_record_hash}
                      </code>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs theme-text-muted">
                No integrity records have been recorded for this evidence.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* ─────────────────────────────────────────────
   Loading Skeleton
───────────────────────────────────────────── */

function EvidenceTableSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-label="Loading evidence">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-14 animate-pulse rounded-lg bg-[var(--bg-card-hover)]"
        />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Main Evidence Management
───────────────────────────────────────────── */

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

  /* Load cases */

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

  /* Load selected case evidence */

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

  /* Actions */

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

      setVerificationById((current) => ({
        ...current,
        [evidenceId]: result,
      }))

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

  /* Integrity chain result */

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

  /* UI */

  return (
    <section className="mx-auto max-w-[1500px] space-y-5 theme-text">

      {/* Header */}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-purple-500 dark:text-[#b6a1f5]">
            <Fingerprint size={14} />
            Evidence & Integrity
          </div>

          <h1 className="mt-2 text-xl font-semibold tracking-tight theme-text sm:text-2xl">
            {integrityOnly
              ? 'Integrity Verification'
              : 'Evidence Management'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="selected-evidence-case">
            Select case
          </label>

          <select
            id="selected-evidence-case"
            value={selectedCaseId}
            onChange={(event) => handleCaseChange(event.target.value)}
            disabled={isLoadingCases || cases.length === 0}
            className="theme-input min-w-48 flex-1 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#9b82e8] focus:ring-2 focus:ring-[#9b82e8]/10 disabled:opacity-50 sm:flex-none"
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
            className="inline-flex items-center justify-center gap-2 theme-button rounded-lg px-3 py-2.5 text-sm theme-text-secondary theme-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={isLoadingEvidence ? 'animate-spin' : ''}
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9b82e8] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[#8b72d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FilePlus2 size={15} />
              Upload evidence
            </button>
          )}
        </div>
      </div>

      {/* Cases error */}

      {casesError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
            <AlertCircle size={16} />
            {casesError}
          </p>

          <button
            type="button"
            onClick={refreshCases}
            className="self-start rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-600 dark:text-red-300 hover:bg-red-400/[0.06] sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {/* Success message */}

      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3.5 py-3 text-sm text-emerald-600 dark:text-emerald-300"
        >
          <BadgeCheck size={16} className="mt-0.5 shrink-0" />
          <span className="break-all">{successMessage}</span>
        </div>
      )}

      {/* Action error */}

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.04] px-3.5 py-3 text-sm text-red-600 dark:text-red-300"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* No cases */}

      {!isLoadingCases && !casesError && cases.length === 0 && (
        <div className="theme-card rounded-xl px-6 py-12 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl border border-[#9b82e8]/20 bg-[#9b82e8]/[0.06] text-purple-500 dark:text-[#b6a1f5]">
            <FolderOpen size={20} />
          </span>

          <h2 className="mt-4 text-sm font-semibold theme-text">
            No cases available
          </h2>

          <p className="mx-auto mt-1.5 max-w-md text-sm theme-text-muted">
            {integrityOnly
              ? 'Create a case first, then add evidence for verification.'
              : 'Evidence must be associated with a case. Create one before uploading.'}
          </p>

          <button
            type="button"
            onClick={() => navigate('/dashboard/cases')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#9b82e8] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[#8b72d9]"
          >
            <FolderOpen size={15} />
            Go to Cases
          </button>
        </div>
      )}

      {/* Loading cases */}

      {isLoadingCases && (
        <div className="theme-card rounded-xl p-5">
          <div className="h-14 animate-pulse rounded-lg bg-[var(--bg-card-hover)]" />
        </div>
      )}

      {/* Selected case content */}

      {selectedCase && (
        <>
          {/* Summary cards */}

          <div className="grid gap-4 lg:grid-cols-2">

            {/* Evidence count */}

            <div className="theme-card rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs theme-text-muted">Total evidence</p>
                  <p className="mt-2 text-2xl font-semibold theme-text">
                    {isLoadingEvidence ? '—' : evidence.length}
                  </p>
                </div>

                <span className="flex size-10 items-center justify-center rounded-lg bg-[#9b82e8]/[0.08] text-purple-500 dark:text-[#b6a1f5]">
                  <FileCheck2 size={19} />
                </span>
              </div>

              <p className="mt-2 truncate text-xs theme-text-muted">
                {selectedCase.case_number} · {selectedCase.title}
              </p>
            </div>

            {/* Integrity chain */}

            <div className="theme-card rounded-xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs theme-text-muted">
                    <Fingerprint size={14} />
                    Case integrity chain
                  </div>

                  <p className="mt-2 text-sm theme-text-secondary">
                    Verify stored integrity records.
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
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#9b82e8]/20 bg-[#9b82e8]/[0.07] px-3 py-2 text-xs font-medium text-purple-600 dark:text-[#b6a1f5] hover:bg-[#9b82e8]/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isVerifyingChain ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}

                  {isVerifyingChain ? 'Verifying…' : 'Verify chain'}
                </button>
              </div>
            </div>
          </div>

          {/* Chain error */}

          {chainError && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
                <AlertCircle size={16} />
                {chainError}
              </p>

              <button
                type="button"
                onClick={handleVerifyCaseChain}
                disabled={isVerifyingChain}
                className="self-start rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-600 dark:text-red-300 hover:bg-red-400/[0.06] disabled:opacity-50 sm:self-auto"
              >
                Retry
              </button>
            </div>
          )}

          {/* Chain result */}

          {chainResult && (
            <div
              className={`rounded-xl border p-4 ${
                chainVerificationPassed
                  ? 'border-emerald-400/20 bg-emerald-400/[0.04]'
                  : 'border-red-400/20 bg-red-400/[0.04]'
              }`}
              role="status"
            >
              <div className="flex items-start gap-3">
                {chainVerificationPassed ? (
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300"
                  />
                ) : (
                  <ShieldX
                    size={18}
                    className="mt-0.5 shrink-0 text-red-600 dark:text-red-300"
                  />
                )}

                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      chainVerificationPassed
                        ? 'text-emerald-600 dark:text-emerald-300'
                        : 'text-red-600 dark:text-red-300'
                    }`}
                  >
                    {chainResult.chain_valid && !checkpointVerificationPassed
                      ? `Local integrity chain passed; checkpoint verification: ${checkpointStatus}.`
                      : chainResult.message}
                  </p>

                  <p className="mt-2 text-xs leading-relaxed theme-text-secondary">
                    {chainResult.records_checked} record(s) checked
                    {chainResult.chain_id !== null &&
                      ` · Chain #${chainResult.chain_id}`}
                    {' · '}Legacy: {chainResult.verification.legacy}
                    {' · '}Chain V2: {chainResult.verification.case_chain_v2}
                    {' · '}Ed25519:{' '}
                    {chainResult.checkpoint_verification?.status ??
                      'NOT_REPORTED'}
                  </p>

                  {(chainResult.checkpoint_verification?.checkpoints.length ??
                    0) > 0 && (
                    <p className="mt-2 text-xs theme-text-muted">
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
                    <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-300">
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
                    <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-300">
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

          {/* Evidence panel */}

          <div className="theme-card overflow-hidden rounded-xl">

            {/* Panel header */}

            <div className="flex flex-col gap-3 border-b theme-divider px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-medium theme-text">
                  Case evidence
                </h2>
                <p className="mt-1 text-xs theme-text-muted">
                  Files and integrity metadata
                </p>
              </div>

              {selectedCase && !isLoadingEvidence && !evidenceError && (
                <span className="self-start theme-card-secondary rounded-md px-2.5 py-1.5 text-xs theme-text-secondary sm:self-auto">
                  <span className="font-medium theme-text">
                    {evidence.length}
                  </span>{' '}
                  {evidence.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>

            {/* Evidence error */}

            {evidenceError ? (
              <div className="px-6 py-10 text-center">
                <AlertCircle
                  size={22}
                  className="mx-auto text-red-500 dark:text-red-300"
                />

                <p className="mt-3 text-sm text-red-600 dark:text-red-300">
                  {evidenceError}
                </p>

                <button
                  type="button"
                  onClick={refreshEvidence}
                  className="mt-4 inline-flex items-center gap-2 theme-button rounded-lg px-3 py-2 text-xs theme-text-secondary theme-hover"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              </div>
            ) : isLoadingEvidence ? (
              <EvidenceTableSkeleton />
            ) : evidence.length === 0 ? (
              /* Empty state */

              <div className="px-6 py-12 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-xl theme-card-secondary theme-text-muted">
                  <Upload size={19} />
                </span>

                <h3 className="mt-3 text-sm font-medium theme-text">
                  No evidence uploaded
                </h3>

                <p className="mt-1.5 text-sm theme-text-muted">
                  {integrityOnly
                    ? 'There is no evidence to verify for this case yet.'
                    : 'Upload files to start your evidence collection.'}
                </p>

                {!integrityOnly && (
                  <button
                    type="button"
                    onClick={() => setIsUploadOpen(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#9b82e8] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[#8b72d9]"
                  >
                    <FilePlus2 size={15} />
                    Upload evidence
                  </button>
                )}
              </div>
            ) : (
              /* Evidence table */

              <div className="overflow-x-auto theme-scroll">
                <table className="theme-table w-full min-w-[1180px] text-left">
                  <thead className="theme-table-header border-b">
                    <tr className="text-[10px] font-medium uppercase tracking-wider theme-text-muted">
                      <th scope="col" className="px-4 py-3">
                        ID
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Filename
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Size
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Type
                      </th>
                      <th scope="col" className="px-4 py-3">
                        SHA-256
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Uploaded
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y theme-divider">
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

      {/* Upload modal */}

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
