import { api } from './api'

export interface EvidenceUploadResponse {
  message: string
  evidence_id: number
  case_id: number
  original_filename: string
  file_size: number
  sha256_hash: string
  uploaded_at: string
}

export interface Evidence {
  id: number
  case_id: number
  original_filename: string
  file_size: number
  sha256_hash: string
  media_type: string | null
  uploaded_at: string
}

export type EvidenceVerificationResponse =
  | {
      evidence_id: number
      status: 'FILE_MISSING'
      message: string
    }
  | {
      evidence_id: number
      original_filename: string
      stored_sha256_hash: string
      current_sha256_hash: string
      integrity_verified: boolean
      status: 'INTEGRITY_VERIFIED' | 'HASH_MISMATCH'
      message: string
    }

export interface IntegrityRecordResponse {
  message: string
  record_id: number
  evidence_id: number
  sha256_hash: string
  previous_record_hash: string
  record_hash: string
  recorded_at: string
  chain_id: number
  sequence_number: number
  hash_version: string
  checkpoint_id: number
  checkpoint_version: string
  key_id: string
  signature: string
}

export interface IntegrityRecord {
  record_id: number
  evidence_id: number
  sha256_hash: string
  previous_record_hash: string
  record_hash: string
  recorded_at: string
  chain_id: number | null
  sequence_number: number | null
  hash_version: string | null
  checkpoint?: {
    checkpoint_id: number
    checkpoint_version: string
    key_id: string
    signature: string
  } | null
}

export interface IntegrityChainError {
  record_id: number
  problem: string
}

export interface IntegrityCheckpointResult {
  checkpoint_id: number
  sequence_number: number
  key_id: string
  checkpoint_version: string
  signature_status: string
  status: string
}

export interface IntegrityCheckpointError {
  checkpoint_id?: number
  sequence_number: number
  problem: string
}

export interface IntegrityCheckpointVerification {
  status: string
  checkpoints_checked: number
  historical_unsigned_records: number
  checkpoints: IntegrityCheckpointResult[]
  errors: IntegrityCheckpointError[]
  independently_anchored: false
}

export interface CaseIntegrityChainResponse {
  chain_valid: boolean
  records_checked: number
  errors: IntegrityChainError[]
  chain_id: number | null
  message: string
  legacy_chain_valid: boolean
  legacy_records_checked: number
  legacy_errors: IntegrityChainError[]
  v2_chain_valid: boolean
  v2_records_checked: number
  checkpoint_verification?: IntegrityCheckpointVerification
  verification: {
    legacy: 'VALID' | 'INVALID'
    case_chain_v2: 'VALID' | 'INVALID'
    ed25519_checkpoints?: string
  }
}

export async function uploadEvidence(
  caseId: number,
  file: File,
): Promise<EvidenceUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<EvidenceUploadResponse>(
    '/api/evidence/upload',
    formData,
    {
      params: { case_id: caseId },
      // Remove the shared JSON default so Axios preserves FormData and the browser adds its boundary.
      headers: { 'Content-Type': null },
    },
  )
  return response.data
}

export async function getEvidenceByCase(caseId: number): Promise<Evidence[]> {
  const response = await api.get<Evidence[]>(`/api/evidence/case/${caseId}`)
  return response.data
}

export async function verifyEvidence(
  evidenceId: number,
): Promise<EvidenceVerificationResponse> {
  const response = await api.post<EvidenceVerificationResponse>(
    `/api/evidence/${evidenceId}/verify`,
  )
  return response.data
}

export async function recordEvidenceIntegrity(
  evidenceId: number,
): Promise<IntegrityRecordResponse> {
  const response = await api.post<IntegrityRecordResponse>(
    `/api/integrity/evidence/${evidenceId}/record`,
  )
  return response.data
}

export async function getEvidenceIntegrityRecords(
  evidenceId: number,
): Promise<IntegrityRecord[]> {
  const response = await api.get<IntegrityRecord[]>(
    `/api/integrity/evidence/${evidenceId}/records`,
  )
  return response.data
}

export async function verifyCaseIntegrityChain(
  caseId: number,
): Promise<CaseIntegrityChainResponse> {
  const response = await api.get<CaseIntegrityChainResponse>(
    `/api/integrity/cases/${caseId}/verify-chain`,
  )
  return response.data
}
