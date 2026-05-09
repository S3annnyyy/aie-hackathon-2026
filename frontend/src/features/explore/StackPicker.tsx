import { useCallback, type KeyboardEvent } from 'react'

import { formatSgd, type FloorStackBand, type ResaleListing } from '../../lib/sampleListing'

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

type StackPickerProps = {
  listing: ResaleListing
  stackLabel: string
  facing: string
  onStackChange: (stack: string) => void
  onFacingChange: (facing: string) => void
}

export function StackPicker({
  listing,
  stackLabel,
  facing,
  onStackChange,
  onFacingChange,
}: StackPickerProps) {
  const activeBand: FloorStackBand | undefined = listing.floorStack.find(
    (b) => b.label === stackLabel,
  )

  const onStackKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!NEXT_KEYS.has(event.key) && !PREV_KEYS.has(event.key)) return
      event.preventDefault()
      const index = listing.floorStack.findIndex((b) => b.label === stackLabel)
      if (index < 0) return
      const delta = NEXT_KEYS.has(event.key) ? 1 : -1
      const nextIndex = (index + delta + listing.floorStack.length) % listing.floorStack.length
      onStackChange(listing.floorStack[nextIndex]!.label)
    },
    [listing.floorStack, stackLabel, onStackChange],
  )

  const onFacingKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!NEXT_KEYS.has(event.key) && !PREV_KEYS.has(event.key)) return
      event.preventDefault()
      const index = listing.facingCandidates.indexOf(facing)
      if (index < 0) return
      const delta = NEXT_KEYS.has(event.key) ? 1 : -1
      const nextIndex =
        (index + delta + listing.facingCandidates.length) % listing.facingCandidates.length
      onFacingChange(listing.facingCandidates[nextIndex]!)
    },
    [listing.facingCandidates, facing, onFacingChange],
  )

  return (
    <div className="rounded-3xl border border-cream/20 bg-espresso/70 p-4 text-cream shadow-2xl shadow-black/30 backdrop-blur-xl md:p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-terracotta">
            Stand at the window
          </p>
          <h3 className="mt-1 text-sm font-semibold">Pick a stack and facing</h3>
        </div>
        <span className="rounded-full border border-cream/25 bg-espresso/60 px-2.5 py-0.5 text-[11px] font-semibold text-cream">
          {stackLabel}
        </span>
      </header>

      <fieldset className="mt-4">
        <legend className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cream/60">
          Floor stack
        </legend>
        <div
          role="radiogroup"
          aria-label="Floor stack"
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {listing.floorStack.map((band) => {
            const isActive = band.label === stackLabel
            return (
              <button
                key={band.label}
                type="button"
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={onStackKey}
                onClick={() => onStackChange(band.label)}
                className={[
                  'rounded-xl border px-2.5 py-1.5 text-left transition',
                  isActive
                    ? 'border-terracotta bg-terracotta/15 text-cream'
                    : 'border-cream/20 bg-cream/5 text-cream/80 hover:border-terracotta/60 hover:text-cream',
                ].join(' ')}
              >
                <span className="block text-xs font-semibold">{band.label}</span>
                {band.recentSale ? (
                  <span className="mt-0.5 block text-[10px] text-cream/60">
                    {band.recentSale.date}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cream/60">
          Window facing
        </legend>
        <div role="radiogroup" aria-label="Window facing" className="mt-2 flex flex-wrap gap-1.5">
          {listing.facingCandidates.map((candidate) => {
            const isActive = candidate === facing
            return (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={onFacingKey}
                onClick={() => onFacingChange(candidate)}
                className={[
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                  isActive
                    ? 'border-terracotta bg-terracotta text-white'
                    : 'border-cream/20 bg-cream/5 text-cream/80 hover:border-terracotta/60 hover:text-cream',
                ].join(' ')}
              >
                {candidate}
              </button>
            )
          })}
        </div>
      </fieldset>

      {activeBand?.recentSale ? (
        <p className="mt-4 rounded-xl border border-cream/15 bg-cream/5 px-3 py-2 text-[11px] leading-relaxed text-cream/85">
          Last transacted — <strong>{formatSgd(activeBand.recentSale.priceSgd)}</strong> ·{' '}
          {activeBand.recentSale.date} · S${' '}
          {activeBand.recentSale.psfSgd.toLocaleString('en-SG')} psf
        </p>
      ) : null}
    </div>
  )
}
