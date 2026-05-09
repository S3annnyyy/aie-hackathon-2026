import { useState } from 'react'

import { ListingCard } from '../features/explore/ListingCard'
import { Map3DView } from '../features/explore/Map3DView'
import { StackPicker } from '../features/explore/StackPicker'
import { UnitViewPreview } from '../features/explore/UnitViewPreview'
import { SAMPLE_LISTING } from '../lib/sampleListing'

export default function ExplorePage() {
  const [stackLabel, setStackLabel] = useState<string>(
    SAMPLE_LISTING.floorStack[2]?.label ?? SAMPLE_LISTING.floorStack[0]!.label,
  )
  const [facing, setFacing] = useState<string>(SAMPLE_LISTING.facingCandidates[2] ?? 'North')

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 md:py-12">
      <header className="mb-6 md:mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-terracotta">
          Explore · Sample resale unit
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
          {SAMPLE_LISTING.address}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
          A live resale listing we use as the demo target. Pick a stack and
          window facing to see Pascal rotate to the right pose on Google 3D
          Maps — and, next, render the view from that exact window.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <ListingCard listing={SAMPLE_LISTING} />
          <StackPicker
            listing={SAMPLE_LISTING}
            stackLabel={stackLabel}
            facing={facing}
            onStackChange={setStackLabel}
            onFacingChange={setFacing}
          />
        </div>

        <div className="space-y-6">
          <Map3DView
            lat={SAMPLE_LISTING.coordinates.lat}
            lng={SAMPLE_LISTING.coordinates.lng}
            stackLabel={stackLabel}
            facing={facing}
          />
          <UnitViewPreview stackLabel={stackLabel} facing={facing} />
        </div>
      </div>
    </div>
  )
}
