import { formatSgd, type FloorStackBand, type ResaleListing } from '../../lib/sampleListing'

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

  return (
    <div className="rounded-3xl border border-line bg-paper p-5 shadow-sm md:p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-terracotta">
            Stand at the window
          </p>
          <h3 className="mt-1 text-base font-semibold text-espresso">
            Pick a stack and facing
          </h3>
        </div>
        <span className="rounded-full border border-line bg-warm px-3 py-1 text-[11px] font-semibold text-espresso">
          {stackLabel}
        </span>
      </header>

      <fieldset className="mt-5">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
          Floor stack
        </legend>
        <div
          role="radiogroup"
          aria-label="Floor stack"
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {listing.floorStack.map((band) => {
            const isActive = band.label === stackLabel
            return (
              <button
                key={band.label}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onStackChange(band.label)}
                className={[
                  'rounded-2xl border px-3 py-2 text-left transition',
                  isActive
                    ? 'border-terracotta bg-terracotta/10 text-espresso'
                    : 'border-line bg-paper text-muted hover:border-terracotta/50 hover:text-espresso',
                ].join(' ')}
              >
                <span className="block text-sm font-semibold text-espresso">{band.label}</span>
                {band.recentSale ? (
                  <span className="mt-0.5 block text-[11px] text-subtle">
                    {band.recentSale.date} · {formatSgd(band.recentSale.priceSgd)}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-[11px] text-subtle">No recent sale</span>
                )}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
          Window facing
        </legend>
        <div
          role="radiogroup"
          aria-label="Window facing"
          className="mt-2 flex flex-wrap gap-2"
        >
          {listing.facingCandidates.map((candidate) => {
            const isActive = candidate === facing
            return (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onFacingChange(candidate)}
                className={[
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  isActive
                    ? 'border-terracotta bg-terracotta text-white'
                    : 'border-line bg-paper text-muted hover:border-terracotta/60 hover:text-espresso',
                ].join(' ')}
              >
                {candidate}
              </button>
            )
          })}
        </div>
      </fieldset>

      {activeBand?.recentSale ? (
        <p className="mt-5 rounded-2xl border border-line bg-warm px-4 py-3 text-xs leading-relaxed text-espresso">
          Last transacted at stack {activeBand.label} —{' '}
          <strong>{formatSgd(activeBand.recentSale.priceSgd)}</strong> (
          {activeBand.recentSale.date}, S$ {activeBand.recentSale.psfSgd.toLocaleString('en-SG')}{' '}
          psf).
        </p>
      ) : null}
    </div>
  )
}
