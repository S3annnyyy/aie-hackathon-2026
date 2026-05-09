import { useEffect, useState } from 'react'
import type { LayoutSchema } from '../../lib/api'

type Props = {
  schema: LayoutSchema | null
  onSave: (schema: LayoutSchema) => Promise<void>
  onFixPrompt: (prompt: string, objectId?: string) => Promise<void>
  busy: boolean
}

export function SchemaEditor({ schema, onSave, onFixPrompt, busy }: Props) {
  const [text, setText] = useState('')
  const [prompt, setPrompt] = useState('')
  const [objectId, setObjectId] = useState('')

  useEffect(() => {
    setText(schema ? JSON.stringify(schema, null, 2) : '')
  }, [schema])

  const save = async () => {
    if (!text) return
    const parsed = JSON.parse(text) as LayoutSchema
    await onSave(parsed)
  }

  const runFix = async () => {
    if (!prompt.trim()) return
    await onFixPrompt(prompt, objectId || undefined)
    setPrompt('')
  }

  return (
    <div className="card">
      <h3>Layout Schema Editor</h3>
      <p className="muted">Direct JSON editing plus text-to-fix for object IDs.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <div className="toolbar" style={{ marginTop: '0.65rem' }}>
        <button onClick={save} disabled={busy || !schema}>
          Save Schema
        </button>
      </div>
      <div style={{ marginTop: '0.75rem' }}>
        <input
          placeholder="object id (optional): e.g. room_1"
          value={objectId}
          onChange={(e) => setObjectId(e.target.value)}
        />
        <textarea
          style={{ minHeight: 92, marginTop: '0.45rem' }}
          placeholder="Prompt fix, e.g. Rename room_1 to Master Bedroom and set type to bedroom"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button onClick={runFix} disabled={busy || !schema || !prompt.trim()}>
          Apply Prompt Fix
        </button>
      </div>
    </div>
  )
}
