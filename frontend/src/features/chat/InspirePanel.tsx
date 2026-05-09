import { useRef, useState } from 'react'

import { streamInspire, type ChatStreamEvent } from '../../lib/api'
import type { LayoutSchema } from '../../lib/api'

type Props = {
  layoutId: string | null
  schema: LayoutSchema | null
  onStream: (label: string, iter: AsyncIterable<ChatStreamEvent>) => Promise<void>
  disabled?: boolean
}

export function InspirePanel({ layoutId, schema, onStream, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [targetRoom, setTargetRoom] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const handleFile = (f: File | null) => {
    setFile(f)
    if (f) {
      const url = URL.createObjectURL(f)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  const send = async () => {
    if (!layoutId || !file || busy || disabled) return
    setBusy(true)
    try {
      const label = `Inspire from photo${targetRoom ? ` → ${targetRoom}` : ''}`
      await onStream(label, streamInspire(layoutId, file, targetRoom || undefined))
    } finally {
      setBusy(false)
    }
  }

  const rooms = schema?.rooms ?? []

  return (
    <div className="card">
      <h3>📷 Inspire from Photo</h3>
      <p className="muted">Upload a reference interior. Pascal analyses style + objects and restyles the target room.</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        disabled={!layoutId || busy || disabled}
      />

      {preview ? (
        <div style={{ marginTop: '0.5rem' }}>
          <img
            src={preview}
            alt="reference"
            style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid var(--border)' }}
          />
        </div>
      ) : null}

      <div style={{ marginTop: '0.5rem' }}>
        <label className="muted" style={{ display: 'block', marginBottom: 4 }}>
          Target room (optional)
        </label>
        <select
          value={targetRoom}
          onChange={(e) => setTargetRoom(e.target.value)}
          disabled={!layoutId || busy || disabled}
          style={{ width: '100%' }}
        >
          <option value="">Auto (Pascal picks)</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.name || r.id}>
              {r.name || r.id} ({r.type})
            </option>
          ))}
        </select>
      </div>

      <button
        style={{ marginTop: '0.65rem' }}
        onClick={send}
        disabled={!layoutId || !file || busy || disabled}
      >
        {busy ? 'Analysing…' : 'Restyle from this photo'}
      </button>
    </div>
  )
}
