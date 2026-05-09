import { Link, useSearchParams } from 'react-router-dom'

import { ChatOverlay } from '../features/interior/ChatOverlay'
import { InteriorCanvas } from '../features/interior/InteriorCanvas'

export default function InteriorPage() {
  const [params] = useSearchParams()
  const layoutId = params.get('layoutId')

  return (
    <div className="fixed inset-0 bg-espresso">
      <InteriorCanvas />

      {/* Top-left — exit + breadcrumb */}
      <div className="pointer-events-auto absolute left-6 top-6 flex items-center gap-3">
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 rounded-full border border-cream/20 bg-espresso/60 px-4 py-2 text-xs font-semibold text-cream backdrop-blur-xl transition hover:border-cream/40 hover:bg-cream/5"
        >
          ← Back
        </Link>
        <div className="rounded-full border border-cream/15 bg-espresso/50 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-cream/80 backdrop-blur-xl">
          Interior · drag to orbit
        </div>
      </div>

      {/* Top-right — explicit link to the full designer (layout upload + schema editor). */}
      <div className="pointer-events-auto absolute right-6 top-6">
        <Link
          to="/designer"
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-black/30 hover:bg-terracotta-dark"
        >
          Open full designer →
        </Link>
      </div>

      {/* Bottom-right — floating chat dock. */}
      <div className="pointer-events-auto absolute bottom-6 right-6">
        <ChatOverlay layoutId={layoutId} />
      </div>
    </div>
  )
}
