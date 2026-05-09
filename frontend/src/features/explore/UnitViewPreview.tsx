import { Link } from 'react-router-dom'

type UnitViewPreviewProps = {
  stackLabel: string
  facing: string
}

/**
 * Placeholder for the Gemini-generated view from the unit's window.
 * Backend endpoint (nano-render) is not wired into this repo yet, so we
 * render an instructive card instead of a fake image.
 */
export function UnitViewPreview({ stackLabel, facing }: UnitViewPreviewProps) {
  return (
    <div className="rounded-3xl border border-line bg-paper p-5 shadow-sm md:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-terracotta">
        Generated view · coming soon
      </p>
      <h3 className="mt-1 text-base font-semibold text-espresso">
        What you'd see from stack {stackLabel}, facing {facing.toLowerCase()}
      </h3>

      <div className="mt-4 aspect-[16/9] w-full overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-warm via-cream to-warm">
        <div className="flex h-full w-full items-center justify-center text-sm text-muted">
          Gemini window render slots in here.
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        When the nano-render endpoint is wired in, this card streams a
        photoreal view from the selected window using the block's Street View
        tiles as geometric anchors.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to="/designer"
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-4 py-2 text-xs font-semibold text-white transition hover:bg-terracotta-dark"
        >
          Design this unit →
        </Link>
        <span className="text-[11px] text-subtle">Upload the floor plan on the next page.</span>
      </div>
    </div>
  )
}
