import { useMemo, useRef, useState } from 'react'

import { ChatPanel, type ChatPanelHandle } from './features/chat/ChatPanel'
import { InspirePanel } from './features/chat/InspirePanel'
import { LayoutList } from './features/layouts/LayoutList'
import { SchemaEditor } from './features/layouts/SchemaEditor'
import { UploadPanel } from './features/upload/UploadPanel'
import { Viewer3D } from './features/viewer3d/Viewer3D'
import {
  exportDxf,
  fixSchema,
  generateGlb,
  getLayout,
  getLayouts,
  getProject,
  modelUrl,
  patchSchema,
  regenerateExtraction,
  toAssetUrl,
  uploadPdf,
  type LayoutSchema,
  type LayoutSummary,
  type ProjectSummary,
} from './lib/api'

export default function App() {
  const chatRef = useRef<ChatPanelHandle>(null)
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [layouts, setLayouts] = useState<LayoutSummary[]>([])
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null)
  const [glbUrl, setGlbUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('Upload a brochure PDF to start.')

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === selectedLayoutId) ?? null,
    [layouts, selectedLayoutId],
  )

  const refreshProject = async (projectId: string) => {
    const [p, ls] = await Promise.all([getProject(projectId), getLayouts(projectId)])
    setProject(p)
    setLayouts(ls)
    if (!selectedLayoutId && ls.length > 0) {
      setSelectedLayoutId(ls[0].id)
    }
  }

  const onUpload = async (file: File) => {
    setBusy(true)
    setNotice('Uploading and extracting layout pages...')
    try {
      const uploaded = await uploadPdf(file)
      await refreshProject(uploaded.project_id)
      setNotice(`Detected ${uploaded.layout_ids.length} layout crop(s) from pages: ${uploaded.detected_layout_page_numbers.join(', ') || 'none'}.`)
    } catch (error) {
      setNotice(`Upload failed: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const selectLayout = async (layoutId: string) => {
    setSelectedLayoutId(layoutId)
    try {
      const layout = await getLayout(layoutId)
      setLayouts((prev) => prev.map((item) => (item.id === layoutId ? layout : item)))
      setGlbUrl(toAssetUrl(layout.glb_url))
    } catch (error) {
      setNotice(`Failed to load selected layout: ${String(error)}`)
      setGlbUrl(null)
    }
  }

  const onSaveSchema = async (schema: LayoutSchema) => {
    if (!selectedLayoutId) return
    setBusy(true)
    try {
      const updated = await patchSchema(selectedLayoutId, schema)
      setLayouts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setNotice('Schema saved.')
    } catch (error) {
      setNotice(`Save failed: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const onFixPrompt = async (prompt: string, objectId?: string) => {
    if (!selectedLayoutId) return
    setBusy(true)
    try {
      const schema = await fixSchema(selectedLayoutId, prompt, objectId)
      const updated = await patchSchema(selectedLayoutId, schema)
      setLayouts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setNotice('Prompt fix applied.')
    } catch (error) {
      setNotice(`Prompt fix failed: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const onGenerateGlb = async () => {
    if (!selectedLayoutId) return
    setBusy(true)
    try {
      const url = await generateGlb(selectedLayoutId)
      setGlbUrl(url || modelUrl(selectedLayoutId))
      const latest = await getLayout(selectedLayoutId)
      setLayouts((prev) => prev.map((item) => (item.id === latest.id ? latest : item)))
      setNotice('GLB generated.')
    } catch (error) {
      setNotice(`GLB generation failed: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const onExportDxf = async () => {
    if (!selectedLayoutId) return
    setBusy(true)
    try {
      const url = await exportDxf(selectedLayoutId)
      setNotice(`DXF exported: ${url || 'created'}`)
      const latest = await getLayout(selectedLayoutId)
      setLayouts((prev) => prev.map((item) => (item.id === latest.id ? latest : item)))
    } catch (error) {
      setNotice(`DXF export failed: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const onGlbReady = async (modelPath: string) => {
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4190'
    const absolute = modelPath.startsWith('http') ? modelPath : `${base}${modelPath}`
    setGlbUrl(`${absolute}?v=${Date.now()}`)
    if (selectedLayoutId) {
      try {
        const latest = await getLayout(selectedLayoutId)
        setLayouts((prev) => prev.map((item) => (item.id === latest.id ? latest : item)))
      } catch {
        /* non-fatal */
      }
    }
  }

  const onRerunExtraction = async () => {
    if (!selectedLayoutId) return
    setBusy(true)
    try {
      const schema = await regenerateExtraction(selectedLayoutId)
      const updated = await patchSchema(selectedLayoutId, schema)
      setLayouts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setNotice('Extraction re-ran on selected crop.')
    } catch (error) {
      setNotice(`Re-extraction failed: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>PDF to 3D HDB Interior MVP</h1>
      <p className="muted">{notice}</p>
      <div className="grid">
        <div>
          <UploadPanel onUpload={onUpload} busy={busy} />
          <LayoutList layouts={layouts} selectedLayoutId={selectedLayoutId} onSelect={selectLayout} />
          {project ? (
            <div className="card">
              <h3>Project</h3>
              <div className="muted">ID: {project.id}</div>
              <div className="muted">Source: {project.source_pdf_name}</div>
              <div className="muted">Status: {project.status}</div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="card">
            <h3>Layout Preview</h3>
            {selectedLayout?.crop_image_url ? (
              <img
                src={toAssetUrl(selectedLayout.crop_image_url) ?? ''}
                alt="floorplan crop"
                style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }}
              />
            ) : (
              <p className="muted">Select a layout to preview crop.</p>
            )}
            <div className="toolbar" style={{ marginTop: '0.75rem' }}>
              <button onClick={onRerunExtraction} disabled={!selectedLayoutId || busy}>
                Re-extract Schema
              </button>
              <button onClick={onExportDxf} disabled={!selectedLayoutId || busy}>
                Export DXF
              </button>
              <button onClick={onGenerateGlb} disabled={!selectedLayoutId || busy}>
                Generate 3D
              </button>
            </div>
          </div>
          <div className="card">
            <h3>Extracted Metadata</h3>
            {selectedLayout ? (
              <div>
                <div className="muted">Flat type: {selectedLayout.flat_type ?? selectedLayout.schema.flat_type ?? 'N/A'}</div>
                <div className="muted">
                  Approx area: {selectedLayout.floor_area_sqm ?? selectedLayout.schema.floor_area_sqm ?? 'N/A'} sqm
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <strong>Rooms</strong>
                  {selectedLayout.schema.rooms.length ? (
                    <div className="list" style={{ marginTop: '0.5rem' }}>
                      {selectedLayout.schema.rooms.map((room) => (
                        <div key={room.id} className="layout-item">
                          <div>
                            <strong>{room.name || room.id}</strong>
                            <span style={{ marginLeft: 8 }} className="badge">
                              {room.type}
                            </span>
                          </div>
                          <div className="muted">Object ID: {room.id}</div>
                          <div className="muted">Area: {room.estimated_area_sqm ?? 'N/A'} sqm</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={{ marginTop: '0.5rem' }}>
                      No room labels detected yet.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">Select a layout to inspect extracted metadata.</p>
            )}
          </div>
          <Viewer3D glbUrl={glbUrl} schema={selectedLayout?.schema ?? null} />
        </div>

        <div>
          <InspirePanel
            layoutId={selectedLayoutId}
            schema={selectedLayout?.schema ?? null}
            onStream={async (label, iter) => {
              await chatRef.current?.ingestStream(label, iter)
            }}
            disabled={busy}
          />
          <ChatPanel
            ref={chatRef}
            layoutId={selectedLayoutId}
            onGlbReady={onGlbReady}
            disabled={busy}
          />
          <SchemaEditor
            schema={selectedLayout?.schema ?? null}
            onSave={onSaveSchema}
            onFixPrompt={onFixPrompt}
            busy={busy}
          />
        </div>
      </div>
    </div>
  )
}
