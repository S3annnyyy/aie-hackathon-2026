import type { LayoutSummary } from '../../lib/api'

type Props = {
  layouts: LayoutSummary[]
  selectedLayoutId: string | null
  onSelect: (id: string) => void
}

export function LayoutList({ layouts, selectedLayoutId, onSelect }: Props) {
  return (
    <div className="card">
      <h3>Detected Layouts</h3>
      <div className="list">
        {layouts.map((layout) => (
          <button
            key={layout.id}
            className={`layout-item ${selectedLayoutId === layout.id ? 'active' : ''}`}
            onClick={() => onSelect(layout.id)}
            style={{ textAlign: 'left' }}
          >
            <div>
              <strong>Page {layout.source_page}</strong>
              <span style={{ marginLeft: 8 }} className="badge">
                {layout.flat_type ?? 'Unknown type'}
              </span>
            </div>
            <div className="muted">Area: {layout.floor_area_sqm ?? 'N/A'} sqm</div>
            <div className="muted">Finish: {layout.finish_type ?? 'N/A'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
