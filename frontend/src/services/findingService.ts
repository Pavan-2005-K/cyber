import { api } from './api'

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface Finding {
  id: number
  case_id: number
  investigator_id: number
  module_name: string
  input_summary: string | null
  prediction: string
  confidence_score: number | null
  severity: FindingSeverity
  analysis_details: Record<string, unknown> | unknown[] | null
  created_at: string
}

export async function getFindingsByCase(caseId: number): Promise<Finding[]> {
  const response = await api.get<Finding[]>(`/api/findings/cases/${caseId}`)
  return response.data
}

export async function getFindingById(findingId: number): Promise<Finding> {
  const response = await api.get<Finding>(`/api/findings/${findingId}`)
  return response.data
}
