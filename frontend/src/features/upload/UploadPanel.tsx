import { useState } from 'react'

type Props = {
  onUpload: (file: File) => Promise<void>
  busy: boolean
}

export function UploadPanel({ onUpload, busy }: Props) {
  const [file, setFile] = useState<File | null>(null)

  return (
    <div className="card">
      <h3>Upload PDF</h3>
      <p className="muted">Upload an HDB brochure and detect pages containing LAYOUT IDEAS.</p>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div style={{ marginTop: '0.75rem' }}>
        <button disabled={!file || busy} onClick={() => file && onUpload(file)}>
          {busy ? 'Processing...' : 'Upload and Detect'}
        </button>
      </div>
      {file ? <p className="muted">Selected: {file.name}</p> : null}
    </div>
  )
}
