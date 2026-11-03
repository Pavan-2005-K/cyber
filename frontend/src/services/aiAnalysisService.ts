import { api } from './api'

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
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<FakeEmailFileResponse>(
    `/api/fake-email/cases/${caseId}/analyze-eml`,
    formData,
    {
      headers: { 'Content-Type': null },
    },
  )
  return response.data
}

export async function analyzeNetworkIntrusion(
  caseId: number,
  features: NetworkIntrusionFeatures,
): Promise<NetworkIntrusionResponse> {
  const response = await api.post<NetworkIntrusionResponse>(
    `/api/network-intrusion/cases/${caseId}/predict`,
    { features } satisfies NetworkIntrusionRequest,
  )
  return response.data
}

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

export async function analyzeApk(
  caseId: number,
  file: File,
): Promise<ApkAnalysisResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<ApkAnalysisResponse>(
    `/api/apk-analysis/cases/${caseId}/predict`,
    formData,
    {
      // Remove the shared JSON default so the browser can add the multipart boundary.
      headers: { 'Content-Type': null },
    },
  )
  return response.data
}

export async function analyzeImageForgery(
  caseId: number,
  file: File,
): Promise<ImageForgeryResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<ImageForgeryResponse>(
    `/api/image-forgery/cases/${caseId}/predict`,
    formData,
    {
      // Remove the shared JSON default so the browser can add the multipart boundary.
      headers: { 'Content-Type': null },
    },
  )
  return response.data
}

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
