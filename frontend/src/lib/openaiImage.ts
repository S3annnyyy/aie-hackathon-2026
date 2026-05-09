/**
 * Browser-side OpenAI Image edit client.
 *
 * Calls the `/v1/images/edits` endpoint with `model=gpt-image-1` (the current
 * API name for the "GPT Image" / "DALL-E 4-class" model, colloquially
 * referred to as "GPT Image 2"). We send the captured viewport PNG as the
 * reference `image`, and a structured prompt describing how to re-render it.
 *
 * ⚠️ Security: This embeds `VITE_OPENAI_API_KEY` in the client bundle. That
 * is fine for a local hackathon demo but unacceptable for production — any
 * user can extract the key from the built JS. Long-term this call must move
 * to the backend, behind auth. `isBrowserKeyConfigured()` is a deliberate
 * "did the operator intentionally enable this" gate.
 */

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
const DEFAULT_MODEL =
  (import.meta.env.VITE_OPENAI_IMAGE_MODEL as string | undefined) ?? 'gpt-image-1'
const DEFAULT_SIZE =
  (import.meta.env.VITE_OPENAI_IMAGE_SIZE as string | undefined) ?? '1024x1024'

export function isBrowserKeyConfigured(): boolean {
  return typeof API_KEY === 'string' && API_KEY.startsWith('sk-')
}

export type ImageEditResult = {
  /** PNG data URL (data:image/png;base64,...) suitable for <img src>. */
  dataUrl: string
  /** Fetched-from-API Blob for downloading. */
  blob: Blob
}

export type ImageEditRequest = {
  /** Viewport PNG blob captured from the 3D viewer. */
  reference: Blob
  /** Prompt built by `buildRenderPrompt`. */
  prompt: string
  /** Optional override for the model — defaults to `gpt-image-1`. */
  model?: string
  /** Abort signal — wire a React abort on unmount. */
  signal?: AbortSignal
}

export async function editImage({
  reference,
  prompt,
  model = DEFAULT_MODEL,
  signal,
}: ImageEditRequest): Promise<ImageEditResult> {
  if (!API_KEY) {
    throw new Error(
      'VITE_OPENAI_API_KEY is not set in the frontend environment. Copy frontend/.env.example to frontend/.env.local and fill it in.',
    )
  }

  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', DEFAULT_SIZE)
  form.append('image', reference, 'viewport.png')

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
    signal,
  })

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(`OpenAI image edit failed (${response.status}): ${message}`)
  }

  const payload = (await response.json()) as {
    data?: readonly { b64_json?: string; url?: string }[]
  }
  const entry = payload.data?.[0]
  if (!entry) throw new Error('OpenAI response had no image data.')

  if (entry.b64_json) {
    const dataUrl = `data:image/png;base64,${entry.b64_json}`
    const blob = base64ToBlob(entry.b64_json, 'image/png')
    return { dataUrl, blob }
  }

  if (entry.url) {
    const blobResponse = await fetch(entry.url, { signal })
    if (!blobResponse.ok) throw new Error(`Failed to fetch returned image URL: ${blobResponse.status}`)
    const blob = await blobResponse.blob()
    const dataUrl = await blobToDataUrl(blob)
    return { dataUrl, blob }
  }

  throw new Error('OpenAI response was missing both b64_json and url.')
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
    return JSON.stringify(body)
  } catch {
    return response.statusText || 'unknown error'
  }
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}
