import type { Job, Settings } from './types'

export async function createJob(file: File, settings: Settings): Promise<Job> {
  const body = new FormData()
  body.append('file', file)
  body.append('settings', JSON.stringify(settings))

  const response = await fetch('/api/jobs', { method: 'POST', body })
  if (!response.ok) throw new Error(await readError(response))
  return response.json()
}

export async function getJob(id: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${id}`)
  if (!response.ok) throw new Error(await readError(response))
  return response.json()
}

export async function cancelJob(id: string): Promise<void> {
  const response = await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response))
}

async function readError(response: Response) {
  try {
    const data = await response.json()
    return data.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}
