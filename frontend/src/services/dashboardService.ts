import { api } from './api'

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface AnalyticsPeriod {
  start_date: string
  end_date: string
  timezone: string
}

export interface FindingTrend {
  date: string
  count: number
}

export interface EvidenceVerificationOutcomes {
  INTEGRITY_VERIFIED: number
  HASH_MISMATCH: number
  FILE_MISSING: number
}

export interface RecentFinding {
  finding_id: number
  case_id: number
  module: string
  prediction: string
  confidence: number | null
  severity: string
  timestamp: string
}

export interface DashboardAnalytics {
  total_cases: number
  open_cases: number
  closed_cases: number
  total_evidence: number
  total_findings: number
  severity_distribution: Record<FindingSeverity, number>
  module_findings: Record<string, number>
  recent_findings: RecentFinding[]
  analytics_period: AnalyticsPeriod
  finding_trends: FindingTrend[]
  reports: {
    total_generated: number
    generated_in_period: number
  }
  total_integrity_records: number
  evidence_verification_outcomes: EvidenceVerificationOutcomes
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const response = await api.get<DashboardAnalytics>('/api/dashboard/analytics')
  return response.data
}
