
import { api } from './api'

// =========================================================
// SHARED MULTIPART CONFIGURATION
// =========================================================

const multipartConfig = {
  headers: {
    'Content-Type': null,
  },
}

function createFileFormData(file: File): FormData {
  const formData = new FormData()
  formData.append('file', file)
  return formData
}

function createEvidenceFormData(evidenceId: number): FormData {
  const formData = new FormData()
  formData.append('evidence_id', String(evidenceId))
  return formData
}

// =========================================================
// PHISHING URL ANALYSIS
// =========================================================

export interface PhishingUrlAnalysisResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  message: string
}

// =========================================================
// FAKE PROFILE ANALYSIS
// =========================================================

export interface FakeProfileRequest {
  username: string
  fullname: string
  description: string
  external_url: string
  has_profile_picture: boolean
  is_private: boolean
  posts: number
  followers: number
  following: number
}

export interface FakeProfileResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  message: string
}

export interface FakeProfileBatchResult {
  row_number: number
  username: string
  prediction: string
  class: number
  fake_probability: number
  genuine_probability: number
  confidence: number
}

export interface FakeProfileBatchResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string
  total_profiles: number
  fake_profiles: number
  genuine_profiles: number
  fake_percentage: number
  average_confidence: number
  severity: string
  model: string
  results: FakeProfileBatchResult[]
  message: string
}

// =========================================================
// FAKE EMAIL ANALYSIS
// =========================================================

export interface FakeEmailTextRequest {
  email_text: string
}

export interface FakeEmailTextResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  phishing_probability: number
  threshold: number
  message: string
}

export interface FakeEmailHeaders {
  subject: string
  from: string
  to: string
  reply_to: string
  return_path: string
}

export interface FakeEmailFileResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string
  email_headers: FakeEmailHeaders
  prediction: string
  class: number
  confidence: number
  severity: string
  phishing_probability: number
  threshold: number
  analysis_scope: string
  message: string
}

// =========================================================
// SCAM MESSAGE ANALYSIS
// =========================================================

export interface ScamMessageRequest {
  text: string
}

export interface ScamMessageResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  message: string
}

// =========================================================
// IMAGE FORGERY ANALYSIS
// =========================================================

export interface ImageForgeryResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string
  prediction: string
  class: number
  confidence: number
  severity: string
  tampered_probability: number
  authentic_probability: number
  threshold: number
  input_size: number[]
  model: string
  message: string
}

// =========================================================
// APK MALWARE ANALYSIS
// =========================================================

export interface ApkAnalysisResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string
  prediction: string
  class: number
  confidence: number
  severity: string
  class_probabilities: {
    benign: number
    malware: number
  }
  features_extracted: number
  analysis_type: string
  message: string
}

// =========================================================
// CHAT AND EMAIL FORENSICS
// =========================================================

export interface ChatEmailForensicsRequest {
  text: string
}

export interface ChatEmailForensicsResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  spam_probability: number
  ham_probability: number
  model: string
  message: string
}

// =========================================================
// CREDIT CARD FRAUD ANALYSIS
// =========================================================

export interface CreditCardFraudFeatures {
  Time: number
  V1: number
  V2: number
  V3: number
  V4: number
  V5: number
  V6: number
  V7: number
  V8: number
  V9: number
  V10: number
  V11: number
  V12: number
  V13: number
  V14: number
  V15: number
  V16: number
  V17: number
  V18: number
  V19: number
  V20: number
  V21: number
  V22: number
  V23: number
  V24: number
  V25: number
  V26: number
  V27: number
  V28: number
  Amount: number
}

export interface CreditCardFraudRequest {
  features: CreditCardFraudFeatures
}

export interface CreditCardFraudResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  fraud_probability: number
  legitimate_probability: number
  threshold: number
  model: string
  input_features: number
  message: string
}

export interface CreditCardFraudBatchTransaction {
  transaction_index: number
  prediction: string
  class: number
  fraud_probability: number
  legitimate_probability: number
}

export interface CreditCardFraudBatchResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string
  total_transactions: number
  fraudulent_transactions: number
  legitimate_transactions: number
  fraud_percentage: number
  threshold: number
  model: string
  results: CreditCardFraudBatchTransaction[]
  message: string
}

// =========================================================
// NETWORK INTRUSION ANALYSIS
// =========================================================

export interface NetworkIntrusionFeatures {
  duration: number
  protocol_type: string
  service: string
  flag: string
  src_bytes: number
  dst_bytes: number
  land: number
  wrong_fragment: number
  urgent: number
  hot: number
  num_failed_logins: number
  logged_in: number
  num_compromised: number
  root_shell: number
  su_attempted: number
  num_root: number
  num_file_creations: number
  num_shells: number
  num_access_files: number
  num_outbound_cmds: number
  is_host_login: number
  is_guest_login: number
  count: number
  srv_count: number
  serror_rate: number
  srv_serror_rate: number
  rerror_rate: number
  srv_rerror_rate: number
  same_srv_rate: number
  diff_srv_rate: number
  srv_diff_host_rate: number
  dst_host_count: number
  dst_host_srv_count: number
  dst_host_same_srv_rate: number
  dst_host_diff_srv_rate: number
  dst_host_same_src_port_rate: number
  dst_host_srv_diff_host_rate: number
  dst_host_serror_rate: number
  dst_host_srv_serror_rate: number
  dst_host_rerror_rate: number
  dst_host_srv_rerror_rate: number
}

export interface NetworkIntrusionRequest {
  features: NetworkIntrusionFeatures
}

export interface NetworkIntrusionResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  message: string
  attack_probability: number
  normal_probability: number
  threshold: number
  model: string
  input_features: number
  dataset: string
}

export interface NetworkIntrusionBatchTransaction {
  connection_index: number
  prediction: string
  class: number
  attack_probability: number
  normal_probability: number
}

export interface NetworkIntrusionBatchResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string
  total_connections: number
  attack_connections: number
  normal_connections: number
  attack_percentage: number
  threshold: number
  model: string
  dataset: string
  results: NetworkIntrusionBatchTransaction[]
  message: string
}

// =========================================================
// SERVER LOG ANALYSIS
// =========================================================

export interface ServerLogFeatures {
  E1: number
  E2: number
  E3: number
  E4: number
  E5: number
  E6: number
  E7: number
  E8: number
  E9: number
  E10: number
  E11: number
  E12: number
  E13: number
  E14: number
  E15: number
  E16: number
  E17: number
  E18: number
  E19: number
  E20: number
  E21: number
  E22: number
  E23: number
  E24: number
  E25: number
  E26: number
  E27: number
  E28: number
  E29: number
}

export interface ServerLogAnalysisRequest {
  features: ServerLogFeatures
}

export interface ServerLogAnalysisResponse {
  module: string
  case_id: number
  finding_id: number
  prediction: string
  class: number
  confidence: number
  severity: string
  anomaly_probability: number
  normal_probability: number
  threshold: number
  model: string
  input_features: number
  dataset: string
  message: string
}

export interface ServerLogBatchBlock {
  block_index: number
  block_id: string | null
  prediction: string
  class: number
  anomaly_probability: number
  normal_probability: number
  confidence: number
}

export interface ServerLogBatchResponse {
  module: string
  case_id: number
  finding_id: number
  filename: string

  // NEW: Source of the batch analysis
  input_source?: 'csv_upload' | 'existing_evidence'
  evidence_id?: number | null

  total_blocks: number
  anomaly_blocks: number
  normal_blocks: number
  anomaly_percentage: number
  average_confidence: number
  severity: string
  threshold: number
  model: string
  dataset: string
  results: ServerLogBatchBlock[]
  message: string
}

// =========================================================
// PHISHING URL API
// =========================================================

export async function analyzePhishingUrl(
  caseId: number,
  url: string,
): Promise<PhishingUrlAnalysisResponse> {
  const response = await api.post<PhishingUrlAnalysisResponse>(
    `/api/phishing-url/cases/${caseId}/predict`,
    { url },
  )

  return response.data
}

// =========================================================
// SERVER LOG ANALYSIS API
// =========================================================

export async function analyzeServerLog(
  caseId: number,
  features: ServerLogFeatures,
): Promise<ServerLogAnalysisResponse> {
  const response = await api.post<ServerLogAnalysisResponse>(
    `/api/server-log-analysis/cases/${caseId}/predict`,
    { features } satisfies ServerLogAnalysisRequest,
  )

  return response.data
}

export async function analyzeServerLogCsv(
  caseId: number,
  file: File,
): Promise<ServerLogBatchResponse> {
  const response = await api.post<ServerLogBatchResponse>(
    `/api/server-log-analysis/cases/${caseId}/analyze-csv`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

// Analyze existing CSV evidence without uploading it again
export async function analyzeServerLogEvidence(
  caseId: number,
  evidenceId: number,
): Promise<ServerLogBatchResponse> {
  const response = await api.post<ServerLogBatchResponse>(
    `/api/server-log-analysis/cases/${caseId}/analyze-csv`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// FAKE EMAIL ANALYSIS API
// =========================================================

export async function analyzeFakeEmailText(
  caseId: number,
  emailText: string,
): Promise<FakeEmailTextResponse> {
  const response = await api.post<FakeEmailTextResponse>(
    `/api/fake-email/cases/${caseId}/predict`,
    { email_text: emailText } satisfies FakeEmailTextRequest,
  )

  return response.data
}

export async function analyzeFakeEmailFile(
  caseId: number,
  file: File,
): Promise<FakeEmailFileResponse> {
  const response = await api.post<FakeEmailFileResponse>(
    `/api/fake-email/cases/${caseId}/analyze-eml`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

// Analyze an existing EML evidence item (no re-upload)
export async function analyzeFakeEmailEvidence(
  caseId: number,
  evidenceId: number,
): Promise<FakeEmailFileResponse> {
  const response = await api.post<FakeEmailFileResponse>(
    `/api/fake-email/cases/${caseId}/analyze-eml`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// NETWORK INTRUSION ANALYSIS API
// =========================================================

export async function analyzeNetworkIntrusion(
  caseId: number,
  features: NetworkIntrusionFeatures,
): Promise<NetworkIntrusionResponse> {
  const response = await api.post<NetworkIntrusionResponse>(
    `/api/network-intrusion/cases/${caseId}/predict`,
    { features },
  )

  return response.data
}

export async function analyzeNetworkIntrusionCsv(
  caseId: number,
  file: File,
): Promise<NetworkIntrusionBatchResponse> {
  const response = await api.post<NetworkIntrusionBatchResponse>(
    `/api/network-intrusion/cases/${caseId}/analyze-csv`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

export async function analyzeNetworkIntrusionEvidence(
  caseId: number,
  evidenceId: number,
): Promise<NetworkIntrusionBatchResponse> {
  const response = await api.post<NetworkIntrusionBatchResponse>(
    `/api/network-intrusion/cases/${caseId}/analyze-csv`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// CREDIT CARD FRAUD ANALYSIS API
// =========================================================

export async function analyzeCreditCardFraud(
  caseId: number,
  features: CreditCardFraudFeatures,
): Promise<CreditCardFraudResponse> {
  const response = await api.post<CreditCardFraudResponse>(
    `/api/credit-card-fraud/cases/${caseId}/predict`,
    { features } satisfies CreditCardFraudRequest,
  )

  return response.data
}

export async function analyzeCreditCardFraudCsv(
  caseId: number,
  file: File,
): Promise<CreditCardFraudBatchResponse> {
  const response = await api.post<CreditCardFraudBatchResponse>(
    `/api/credit-card-fraud/cases/${caseId}/analyze-csv`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

// Analyze an existing CSV evidence item (no re-upload)
export async function analyzeCreditCardFraudEvidence(
  caseId: number,
  evidenceId: number,
): Promise<CreditCardFraudBatchResponse> {
  const response = await api.post<CreditCardFraudBatchResponse>(
    `/api/credit-card-fraud/cases/${caseId}/analyze-csv`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// CHAT AND EMAIL FORENSICS API
// =========================================================

export async function analyzeChatEmail(
  caseId: number,
  text: string,
): Promise<ChatEmailForensicsResponse> {
  const response = await api.post<ChatEmailForensicsResponse>(
    `/api/chat-email-forensics/cases/${caseId}/predict`,
    { text } satisfies ChatEmailForensicsRequest,
  )

  return response.data
}

export async function analyzeChatEmailEvidence(
  caseId: number,
  evidenceId: number,
): Promise<ChatEmailForensicsResponse> {
  const response = await api.post<ChatEmailForensicsResponse>(
    `/api/chat-email-forensics/cases/${caseId}/predict-evidence`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// APK MALWARE ANALYSIS API
// =========================================================

export async function analyzeApk(
  caseId: number,
  file: File,
): Promise<ApkAnalysisResponse> {
  const response = await api.post<ApkAnalysisResponse>(
    `/api/apk-analysis/cases/${caseId}/predict`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// IMAGE FORGERY ANALYSIS API
// =========================================================

export async function analyzeImageForgery(
  caseId: number,
  file: File,
): Promise<ImageForgeryResponse> {
  const response = await api.post<ImageForgeryResponse>(
    `/api/image-forgery/cases/${caseId}/predict`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

export async function analyzeImageForgeryEvidence(
  caseId: number,
  evidenceId: number,
): Promise<ImageForgeryResponse> {
  const response = await api.post<ImageForgeryResponse>(
    `/api/image-forgery/cases/${caseId}/predict`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// SCAM MESSAGE ANALYSIS API
// =========================================================

export async function analyzeScamMessage(
  caseId: number,
  text: string,
): Promise<ScamMessageResponse> {
  const response = await api.post<ScamMessageResponse>(
    `/api/scam-detection/cases/${caseId}/predict`,
    { text } satisfies ScamMessageRequest,
  )

  return response.data
}

// Analyze an existing TXT evidence item (no re-upload)
export async function analyzeScamMessageEvidence(
  caseId: number,
  evidenceId: number,
): Promise<ScamMessageResponse> {
  const response = await api.post<ScamMessageResponse>(
    `/api/scam-detection/cases/${caseId}/predict-evidence`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}

// =========================================================
// FAKE PROFILE ANALYSIS API
// =========================================================

export async function analyzeFakeProfile(
  caseId: number,
  data: FakeProfileRequest,
): Promise<FakeProfileResponse> {
  const response = await api.post<FakeProfileResponse>(
    `/api/fake-profile/cases/${caseId}/predict`,
    data,
  )

  return response.data
}

// =========================================================
// FAKE PROFILE CSV BATCH ANALYSIS API
// =========================================================

export async function analyzeFakeProfileCsv(
  caseId: number,
  file: File,
): Promise<FakeProfileBatchResponse> {
  const response = await api.post<FakeProfileBatchResponse>(
    `/api/fake-profile/cases/${caseId}/analyze-csv`,
    createFileFormData(file),
    multipartConfig,
  )

  return response.data
}

// Analyze an existing CSV evidence item (no re-upload)
export async function analyzeFakeProfileEvidence(
  caseId: number,
  evidenceId: number,
): Promise<FakeProfileBatchResponse> {
  const response = await api.post<FakeProfileBatchResponse>(
    `/api/fake-profile/cases/${caseId}/analyze-csv`,
    createEvidenceFormData(evidenceId),
    multipartConfig,
  )

  return response.data
}
