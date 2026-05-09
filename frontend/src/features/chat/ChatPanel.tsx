import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

import { streamChat, type ChatStreamEvent } from '../../lib/api'

export type ChatPanelHandle = {
  ingestStream: (label: string, iter: AsyncIterable<ChatStreamEvent>) => Promise<void>
}

type ChatEntry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; args: string; result?: string; error?: boolean }
  | { kind: 'system'; text: string }

type Props = {
  layoutId: string | null
  onGlbReady: (url: string) => void
  disabled?: boolean
}

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  { layoutId, onGlbReady, disabled },
  ref,
) {
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [running, setRunning] = useState(false)
  const toolCallsRef = useRef<Record<string, number>>({})

  const push = (entry: ChatEntry) => setEntries((prev) => [...prev, entry])
  const updateEntry = (idx: number, patch: Partial<ChatEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? ({ ...e, ...patch } as ChatEntry) : e)))

  const applyEvent = (event: ChatStreamEvent) => {
    switch (event.kind) {
      case 'assistant_text':
        push({ kind: 'assistant', text: event.text })
        break
      case 'tool_call': {
        setEntries((prev) => {
          const idx = prev.length
          toolCallsRef.current[event.id] = idx
          return [
            ...prev,
            {
              kind: 'tool',
              name: event.name,
              args: JSON.stringify(event.arguments),
            },
          ]
        })
        break
      }
      case 'tool_result': {
        const idx = toolCallsRef.current[event.id]
        if (idx !== undefined) {
          updateEntry(idx, {
            kind: 'tool',
            name: event.name,
            args: (entries[idx] as { args?: string })?.args ?? '',
            result: event.result,
            error: event.is_error,
          })
        }
        break
      }
      case 'glb_ready':
        onGlbReady(event.model_url)
        push({ kind: 'system', text: 'Scene updated.' })
        break
      case 'inspiration_ready':
        push({
          kind: 'system',
          text: `Inspiration: ${event.style || 'unknown style'} — ${event.mood}. Palette ${event.palette_hex.join(' ')}. Objects: ${event.objects.length}.`,
        })
        break
      case 'error':
        push({ kind: 'system', text: `Error: ${event.message}` })
        break
      case 'done':
      case 'stream_end':
        break
    }
  }

  const runStream = async (label: string, iter: AsyncIterable<ChatStreamEvent>) => {
    if (running) return
    if (label) push({ kind: 'user', text: label })
    setRunning(true)
    toolCallsRef.current = {}
    try {
      for await (const event of iter) {
        applyEvent(event)
      }
    } catch (err) {
      push({ kind: 'system', text: `Stream error: ${String(err)}` })
    } finally {
      setRunning(false)
    }
  }

  useImperativeHandle(ref, () => ({ ingestStream: runStream }), [running])

  const handleSend = async () => {
    if (!layoutId || !input.trim() || running) return
    const message = input.trim()
    setInput('')
    await runStream(message, streamChat(layoutId, message))
  }

  return (
    <div className="card">
      <h3>Interior Designer Chat</h3>
      <p className="muted">Tell Pascal what you want. Edits re-render the 3D view.</p>
      <div
        style={{
          maxHeight: 340,
          overflowY: 'auto',
          padding: '0.5rem',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: '#fafbfc',
        }}
      >
        {entries.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Try: “Make the living room feel Scandinavian — bouclé sofa, oak floor, warm pendant light.”
          </p>
        ) : (
          entries.map((e, i) => <ChatRow key={i} entry={e} />)
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          placeholder={layoutId ? 'Describe the change…' : 'Select a layout first'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          disabled={!layoutId || disabled || running}
          style={{ flex: 1 }}
        />
        <button onClick={handleSend} disabled={!layoutId || disabled || running || !input.trim()}>
          {running ? 'Designing…' : 'Send'}
        </button>
      </div>
    </div>
  )
})

function ChatRow({ entry }: { entry: ChatEntry }) {
  if (entry.kind === 'user') {
    return (
      <div style={{ margin: '0.35rem 0' }}>
        <strong>You:</strong> {entry.text}
      </div>
    )
  }
  if (entry.kind === 'assistant') {
    return (
      <div style={{ margin: '0.35rem 0' }}>
        <strong>Pascal:</strong> {entry.text}
      </div>
    )
  }
  if (entry.kind === 'system') {
    return (
      <div className="muted" style={{ margin: '0.35rem 0', fontStyle: 'italic' }}>
        {entry.text}
      </div>
    )
  }
  return (
    <div
      style={{
        margin: '0.35rem 0',
        padding: '0.35rem 0.55rem',
        borderRadius: 6,
        background: entry.error ? '#ffe8e8' : '#eef3ef',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
      }}
    >
      <div>
        <strong>{entry.name}</strong>({entry.args})
      </div>
      {entry.result !== undefined ? (
        <div style={{ marginTop: 2, color: entry.error ? '#b00020' : '#2b5a2b' }}>→ {entry.result}</div>
      ) : (
        <div className="muted">running…</div>
      )}
    </div>
  )
}
