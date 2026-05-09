import { useEffect, useRef, useState } from 'react'

import type { LayoutSchema, Room } from '../../lib/api'
import { editImage, isBrowserKeyConfigured } from '../../lib/openaiImage'
import type { Viewer3DHandle, ViewportCapture } from '../viewer3d/Viewer3D'
import { buildRenderPrompt } from './promptBuilder'

type RenderPanelProps = {
  viewerRef: React.RefObject<Viewer3DHandle | null>
  schema: LayoutSchema | null
  selectedRoom: Room | null
  disabled?: boolean
}

type RenderStatus = 'idle' | 'capturing' | 'generating' | 'ready' | 'error'

type RenderState = {
  status: RenderStatus
  error?: string
  capture?: ViewportCapture
  output?: { dataUrl: string; blob: Blob }
  prompt?: string
}

const INITIAL: RenderState = { status: 'idle' }

export function RenderPanel({ viewerRef, schema, selectedRoom, disabled }: RenderPanelProps) {
  const [vibe, setVibe] = useState('')
  const [state, setState] = useState<RenderState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const keyConfigured = isBrowserKeyConfigured()

  // Cleanup object URLs + abort in-flight when unmounting or starting a new run.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      state.capture?.objectUrl && URL.revokeObjectURL(state.capture.objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRender = async () => {
    if (disabled || state.status === 'capturing' || state.status === 'generating') return

    abortRef.current?.abort()
    state.capture?.objectUrl && URL.revokeObjectURL(state.capture.objectUrl)

    const controller = new AbortController()
    abortRef.current = controller

    setState({ status: 'capturing' })

    const capture = await viewerRef.current?.captureViewport()
    if (!capture) {
      setState({
        status: 'error',
        error: 'Could not capture the viewport. Is the 3D view loaded?',
      })
      return
    }

    const prompt = buildRenderPrompt({ schema, selectedRoom, freeformVibe: vibe })
    setState({ status: 'generating', capture, prompt })

    try {
      const output = await editImage({
        reference: capture.blob,
        prompt,
        signal: controller.signal,
      })
      setState({ status: 'ready', capture, prompt, output })
    } catch (error) {
      if (controller.signal.aborted) return
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        capture,
        prompt,
      })
    }
  }

  const downloadHref = state.output?.dataUrl
  const downloadName = `pascal-render-${selectedRoom?.id ?? 'scene'}-${Date.now()}.png`
  const busy = state.status === 'capturing' || state.status === 'generating'

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-base font-semibold">Render this room</h3>
        <p className="muted text-sm">
          Capture the current 3D view and re-render it photorealistically with GPT Image.
        </p>
      </div>

      {!keyConfigured ? (
        <div className="rounded-xl border border-line bg-warm px-3 py-2 text-xs text-espresso">
          Set <code className="rounded bg-cream px-1">VITE_OPENAI_API_KEY</code> in{' '}
          <code className="rounded bg-cream px-1">frontend/.env.local</code> to enable this panel.
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
          Additional vibe (optional)
        </span>
        <input
          type="text"
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          placeholder="e.g. late afternoon, Japandi, linen curtains"
          disabled={busy || disabled}
        />
      </label>

      <button
        type="button"
        onClick={handleRender}
        disabled={busy || disabled || !keyConfigured}
        className="!border-terracotta/40 !bg-terracotta !text-white hover:!bg-terracotta-dark disabled:!bg-terracotta/50"
      >
        {busy ? (state.status === 'capturing' ? 'Capturing…' : 'Rendering…') : 'Render this view'}
      </button>

      <Preview state={state} />

      {state.status === 'ready' && downloadHref ? (
        <a
          href={downloadHref}
          download={downloadName}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-espresso hover:border-terracotta hover:text-terracotta"
        >
          Download PNG
        </a>
      ) : null}

      {state.status === 'error' ? (
        <p className="muted text-xs text-[color:var(--primary-terracotta-dark)]">
          {state.error}
        </p>
      ) : null}

      {state.prompt && (state.status === 'ready' || state.status === 'error') ? (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none">Prompt sent</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-paper p-2 text-[11px] leading-relaxed">
            {state.prompt}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

function Preview({ state }: { state: RenderState }) {
  if (!state.capture) return null

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <figure>
        <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
          Viewport
        </figcaption>
        <img
          src={state.capture.objectUrl}
          alt="Captured 3D viewport"
          className="w-full rounded-xl border border-line"
        />
      </figure>
      <figure>
        <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
          Photoreal render
        </figcaption>
        {state.output ? (
          <img
            src={state.output.dataUrl}
            alt="Photoreal render generated from the viewport"
            className="w-full rounded-xl border border-line"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-line bg-paper text-[11px] text-muted">
            {state.status === 'generating' ? 'Rendering…' : '—'}
          </div>
        )}
      </figure>
    </div>
  )
}
