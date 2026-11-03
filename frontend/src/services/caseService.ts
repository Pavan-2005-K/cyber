import { api } from './api'

export interface Case {
  id: number
  case_number: string
  title: string
  description: string
  status: string
  owner_id: number
  created_at: string
}

export interface CaseCreateRequest {
  title: string
  description: string
}

export async function getCases(): Promise<Case[]> {
  const response = await api.get<Case[]>('/api/cases')
  return response.data
}

export async function createCase(
  data: CaseCreateRequest,
): Promise<Case> {
  const response = await api.post<Case>('/api/cases', data)
  return response.data
}
