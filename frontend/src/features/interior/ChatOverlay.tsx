import { useRef, useState } from 'react'

import { streamChat, type ChatStreamEvent } from '../../lib/api'

type ChatEntry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'tool'; name: string; args: string; result?: string; error?: boolean }

type ChatOverlayProps = {
  /** Optional layout id — when present, the chat hits the real backend. */
  layoutId: string | null
}

export function ChatOverlay({ layoutId }: ChatOverlayProps) {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [running, setRunning] = useState(false)
  const toolCallsRef = useRef<Record<string, number>>({})

  const demo = !layoutId
  const push = (entry: ChatEntry) => setEntries((prev) => [...prev, entry])

  const applyEvent = (event: ChatStreamEvent) => {
    switch (event.kind) {
      case 'assistant_text':
        push({ kind: 'assistant', text: event.text })
        break
      case 'tool_call': {
        setEntries((prev) => {
          const idx = prev.length
          toolCallsRef.current[event.id] = idx
          return [...prev, { kind: 'tool', name: event.name, args: JSON.stringify(event.arguments) }]
        })
        break
      }
      case 'tool_result': {
        const idx = toolCallsRef.current[event.id]
        if (idx !== undefined) {
          setEntries((prev) =>
            prev.map((e, i) =>
              i === idx && e.kind === 'tool'
                ? { ...e, result: event.result, error: event.is_error }
                : e,
            ),
          )
        }
        break
      }
      case 'glb_ready':
      case 'inspiration_ready':
      case 'done':
      case 'stream_end':
        break
      case 'error':
        push({ kind: 'system', text: `Error: ${event.message}` })
        break
    }
  }

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || running) return
    setInput('')
    push({ kind: 'user', text: msg })

    if (demo) {
      push({
        kind: 'system',
        text:
          'Demo mode — open this view via /designer with an uploaded layout to talk to the real interior-designer agent.',
      })
      return
    }

    setRunning(true)
    toolCallsRef.current = {}
    try {
      for await (const event of streamChat(layoutId!, msg)) {
        applyEvent(event)
      }
    } catch (err) {
      push({ kind: 'system', text: `Stream error: ${String(err)}` })
    } finally {
      setRunning(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="!rounded-full !border-terracotta/40 !bg-terracotta !px-5 !py-3 !text-sm !font-semibold !text-white shadow-xl shadow-black/30 hover:!bg-terracotta-dark"
      >
        Chat with StackView
      </button>
    )
  }

  return (
    <div className="flex h-[460px] w-[360px] flex-col overflow-hidden rounded-3xl border border-cream/15 bg-espresso/90 text-cream shadow-2xl shadow-black/50 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-cream/10 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-terracotta">
            StackView
          </p>
          <p className="text-sm font-semibold">Interior designer</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Collapse chat"
          className="!rounded-full !border-cream/15 !bg-transparent !px-3 !py-1 !text-xs !text-cream hover:!border-cream/40 hover:!bg-cream/5"
        >
          Minimize
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        {entries.length === 0 ? (
          <p className="text-cream/60">
            {demo
              ? 'Demo canvas — the chat works once a real layout is loaded in /designer.'
              : 'Try: “Make the living room feel warmer. Walnut floors, linen curtains.”'}
          </p>
        ) : (
          entries.map((e, i) => <ChatRow key={i} entry={e} />)
        )}
      </div>

      <footer className="border-t border-cream/10 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault()
                handleSend()
              }
            }}
            placeholder={demo ? 'Type something (demo)…' : 'Describe the change…'}
            disabled={running}
            className="!bg-cream/5 !text-cream placeholder:text-cream/40"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={running || !input.trim()}
            className="!bg-terracotta !text-white hover:!bg-terracotta-dark"
          >
            {running ? '…' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function ChatRow({ entry }: { entry: ChatEntry }) {
  if (entry.kind === 'user') {
    return (
      <p className="my-1">
        <span className="text-cream/60">You · </span>
        {entry.text}
      </p>
    )
  }
  if (entry.kind === 'assistant') {
    return (
      <p className="my-1">
        <span className="text-terracotta">StackView · </span>
        {entry.text}
      </p>
    )
  }
  if (entry.kind === 'system') {
    return <p className="my-1 italic text-cream/60">{entry.text}</p>
  }
  return (
    <div className="my-1 rounded-lg border border-cream/10 bg-cream/5 p-2 font-mono text-[11px]">
      <div>
        <strong className="text-terracotta">{entry.name}</strong>({entry.args})
      </div>
      {entry.result !== undefined ? (
        <div className={entry.error ? 'mt-1 text-red-300' : 'mt-1 text-cream/70'}>
          → {entry.result}
        </div>
      ) : null}
    </div>
  )
}
