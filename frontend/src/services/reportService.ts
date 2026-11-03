import { api } from './api'

export interface Report {
  id: number
  report_number: string
  case_id: number
  investigator_id: number
  created_at: string
}

export async function getReports(): Promise<Report[]> {
  const response = await api.get<Report[]>('/api/reports')
  return response.data
}

export async function getReportById(reportId: number): Promise<Report> {
  const response = await api.get<Report>(`/api/reports/${reportId}`)
  return response.data
}

export async function generateReport(caseId: number): Promise<Report> {
  const response = await api.post<Report>(
    `/api/reports/generate/${caseId}`,
  )
  return response.data
}

export async function downloadReport(
  reportId: number,
  reportNumber?: string,
): Promise<void> {
  const response = await api.get<Blob>(`/api/reports/${reportId}/download`, {
    responseType: 'blob',
  })
  const objectUrl = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `${reportNumber || `report-${reportId}`}.pdf`
  link.style.display = 'none'
  document.body.append(link)

  try {
    link.click()
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  } finally {
    link.remove()
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
