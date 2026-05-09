export type ScaleInfo = {
  pixels_per_meter: number | null
  confidence: string
}

export type Room = {
  id: string
  name: string
  type: string
  polygon: number[][]
  clickable: boolean
  estimated_area_sqm?: number | null
  source_page?: number | null
  notes?: string | null
}

export type Wall = {
  id: string
  start: number[]
  end: number[]
  thickness_m: number
  height_m: number
}

export type Furniture = {
  id: string
  name: string
  kind: string
  room_id?: string | null
  position: number[]
  size_m: number[]
}

export type LayoutSchema = {
  project_id: string
  layout_id: string
  source_page: number
  flat_type?: string | null
  floor_area_sqm?: number | null
  finish_type?: string | null
  notes?: string | null
  scale: ScaleInfo
  rooms: Room[]
  walls: Wall[]
  doors: unknown[]
  windows: unknown[]
  furniture: Furniture[]
  todos: string[]
}

export type LayoutSummary = {
  id: string
  project_id: string
  source_page: number
  flat_type?: string | null
  floor_area_sqm?: number | null
  finish_type?: string | null
  notes?: string | null
  crop_image_url?: string | null
  dxf_url?: string | null
  glb_url?: string | null
  schema: LayoutSchema
}

export type UploadResponse = {
  project_id: string
  status: string
  detected_layout_page_numbers: number[]
  layout_ids: string[]
  layout_page_extractions?: {
    source_page: number
    layouts: {
      layout_name?: string | null
      number_of_rooms?: number | null
      house_area_sqm?: number | null
      room_labels: string[]
    }[]
  }[]
}

export type ProjectSummary = {
  id: string
  source_pdf_name: string
  source_pdf_url: string
  status: string
  layouts: LayoutSummary[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4190'

function toHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('local://')) {
    const rel = url.replace('local://', '')
    return `${API_BASE}/storage/${rel}`
  }
  return url
}

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/projects/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getProject(projectId: string): Promise<ProjectSummary> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getLayouts(projectId: string): Promise<LayoutSummary[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/layouts`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getLayout(layoutId: string): Promise<LayoutSummary> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function patchSchema(layoutId: string, schema: LayoutSchema): Promise<LayoutSummary> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/schema`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fixSchema(layoutId: string, prompt: string, object_id?: string): Promise<LayoutSchema> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/schema/fix-from-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, object_id: object_id || null }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.schema as LayoutSchema
}

export async function regenerateExtraction(layoutId: string): Promise<LayoutSchema> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/extract`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.schema as LayoutSchema
}

export async function generateGlb(layoutId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/generate-glb`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return toHttpUrl(data.artifact_url) ?? `${API_BASE}/api/layouts/${layoutId}/model.glb`
}

export async function exportDxf(layoutId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/export-dxf`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return toHttpUrl(data.artifact_url) ?? ''
}

export function toAssetUrl(url: string | null | undefined): string | null {
  return toHttpUrl(url)
}

export function modelUrl(layoutId: string): string {
  return `${API_BASE}/api/layouts/${layoutId}/model.glb`
}

export type InspirationPayload = {
  style: string
  room_type: string
  mood: string
  palette_hex: string[]
  materials: string[]
  lighting: Record<string, unknown>
  objects: Array<Record<string, unknown>>
}

export type ChatStreamEvent =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { kind: 'tool_result'; id: string; name: string; result: string; is_error: boolean }
  | { kind: 'glb_ready'; layout_id: string; artifact_url: string; model_url: string }
  | { kind: 'inspiration_ready'; style: string; room_type: string; mood: string; palette_hex: string[]; materials: string[]; lighting: Record<string, unknown>; objects: Array<Record<string, unknown>> }
  | { kind: 'done'; schema_dirty: boolean; schema: unknown }
  | { kind: 'error'; message: string }
  | { kind: 'stream_end' }

async function* consumeSseStream(res: Response): AsyncIterable<ChatStreamEvent> {
  if (!res.ok || !res.body) throw new Error(`SSE stream failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json) continue
      try {
        yield JSON.parse(json) as ChatStreamEvent
      } catch {
        // ignore malformed frames
      }
    }
  }
}

export async function* streamChat(layoutId: string, message: string): AsyncIterable<ChatStreamEvent> {
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message }),
  })
  yield* consumeSseStream(res)
}

export async function* streamInspire(
  layoutId: string,
  file: File,
  targetRoom?: string,
): AsyncIterable<ChatStreamEvent> {
  const form = new FormData()
  form.append('file', file)
  if (targetRoom) form.append('target_room', targetRoom)
  const res = await fetch(`${API_BASE}/api/layouts/${layoutId}/inspire`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: form,
  })
  yield* consumeSseStream(res)
}
