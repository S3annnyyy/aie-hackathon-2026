import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { CompsOverlay } from '../features/explore/CompsOverlay'
import { Map3DView, type CompMarker } from '../features/explore/Map3DView'
import { StackPicker } from '../features/explore/StackPicker'
import type { BenchmarkResponse, BenchmarkTarget } from '../lib/api'
import { formatSgd, SAMPLE_LISTING } from '../lib/sampleListing'
import { usePersistentState } from '../lib/usePersistentState'

type Stage = 'await-upload' | 'choices' | 'unit-view'

/**
 * Nudge applied to the unit-view camera for 70C Telok Blangah Heights so it
 * sits slightly toward the Telok Blangah Hill Park / Stream Garden side
 * (south-south-east of the block footprint) rather than dead-centre on the
 * roof slab. That framing matches the listing's "greenery view" pitch.
 */
const UNIT_CAMERA_BIAS = { headingDeg: 160, distanceMeters: 30 }

export default function ExplorePage() {
  const [stage, setStage] = usePersistentState<Stage>('stackview.explore.stage', 'await-upload')
  const [uploadedName, setUploadedName] = usePersistentState<string | null>(
    'stackview.explore.uploadedName',
    null,
  )
  const [stackLabel, setStackLabel] = usePersistentState<string>(
    'stackview.explore.stack',
    pickMiddleStack(SAMPLE_LISTING.floorStack.map((b) => b.label)),
  )
  const [facing, setFacing] = usePersistentState<string>(
    'stackview.explore.facing',
    SAMPLE_LISTING.facingCandidates[2] ?? 'North',
  )

  const handleFile = (file: File) => {
    setUploadedName(file.name)
    setStage('choices')
  }

  if (stage === 'await-upload') {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-8 md:py-14">
        <UploadGate onFile={handleFile} />
      </div>
    )
  }

  return (
    <UnitBackdrop
      stackLabel={stackLabel}
      facing={facing}
      stage={stage}
      uploadedName={uploadedName}
      onShowUnitView={() => setStage('unit-view')}
      onBackToBirdsEye={() => setStage('choices')}
      onStackChange={setStackLabel}
      onFacingChange={setFacing}
    />
  )
}

function pickMiddleStack(labels: readonly string[]): string {
  if (labels.length === 0) return ''
  return labels[Math.floor(labels.length / 2)]!
}

type UnitBackdropProps = {
  stackLabel: string
  facing: string
  stage: Exclude<Stage, 'await-upload'>
  uploadedName: string | null
  onShowUnitView: () => void
  onBackToBirdsEye: () => void
  onStackChange: (label: string) => void
  onFacingChange: (facing: string) => void
}

function UnitBackdrop({
  stackLabel,
  facing,
  stage,
  uploadedName,
  onShowUnitView,
  onBackToBirdsEye,
  onStackChange,
  onFacingChange,
}: UnitBackdropProps) {
  const listing = SAMPLE_LISTING
  const pricePerSqm = useMemo(() => Math.round(listing.priceSgd / (listing.areaSqft / 10.764)), [listing])

  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null)

  const benchmarkTarget: BenchmarkTarget = useMemo(
    () => ({
      address: listing.address,
      postal: listing.postal,
      lat: listing.coordinates.lat,
      lng: listing.coordinates.lng,
      flat_type: listing.flatType,
      floor_area_sqft: listing.areaSqft,
      price_sgd: listing.priceSgd,
      psf_sgd: listing.psfSgd,
    }),
    [listing],
  )

  const compMarkers: CompMarker[] = useMemo(() => {
    if (!benchmark) return []
    const median = benchmark.benchmark.median_psf_sgd
    return benchmark.comps
      .filter((c): c is typeof c & { lat: number; lng: number } => c.lat != null && c.lng != null)
      .map((c) => {
        const tone: CompMarker['tone'] =
          c.psf_sgd && median ? (c.psf_sgd < median * 0.97 ? 'below' : c.psf_sgd > median * 1.03 ? 'above' : 'median') : 'median'
        const label = c.psf_sgd ? `S$${Math.round(c.psf_sgd)} psf` : c.address.slice(0, 24)
        return { lat: c.lat, lng: c.lng, label, tone }
      })
  }, [benchmark])

  return (
    <div className="relative h-[calc(100vh-5rem)] w-full overflow-hidden">
      {/* Full-bleed 3D Maps backdrop. */}
      <div className="absolute inset-0">
        <Map3DView
          lat={listing.coordinates.lat}
          lng={listing.coordinates.lng}
          stackLabel={stackLabel}
          facing={facing}
          mode={stage === 'unit-view' ? 'unit' : 'birdseye'}
          unitCameraBias={UNIT_CAMERA_BIAS}
          compMarkers={compMarkers}
        />
        {/* Light scrims so overlays stay legible without blocking the map. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-espresso/30 via-transparent to-espresso/45" />
      </div>

      {/* Details overlay — listing card, left side. */}
      <div className="pointer-events-auto absolute left-4 top-4 z-10 flex max-h-[calc(100vh-7rem)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 overflow-hidden">
        <ListingOverlayCard
          listing={listing}
          pricePerSqm={pricePerSqm}
          uploadedName={uploadedName}
        />
        <CompsOverlay target={benchmarkTarget} onCompsLoaded={setBenchmark} />
      </div>

      {/* Action pills — right side. */}
      <div className="pointer-events-auto absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
        {stage === 'unit-view' ? (
          <button
            type="button"
            onClick={onBackToBirdsEye}
            className="rounded-full border border-cream/25 bg-espresso/60 px-3 py-1.5 text-xs font-semibold text-cream backdrop-blur-xl transition hover:bg-espresso/80"
          >
            ← Birds-eye
          </button>
        ) : (
          <button
            type="button"
            onClick={onShowUnitView}
            className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-espresso shadow-lg shadow-black/20 transition hover:bg-warm"
          >
            Unit view →
          </button>
        )}
        <Link
          to="/interior"
          className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:bg-terracotta-dark"
        >
          View interior →
        </Link>
      </div>

      {/* Stack + facing picker — only in unit-view. */}
      {stage === 'unit-view' ? (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 w-[min(22rem,calc(100vw-2rem))]">
          <StackPicker
            listing={listing}
            stackLabel={stackLabel}
            facing={facing}
            onStackChange={onStackChange}
            onFacingChange={onFacingChange}
          />
        </div>
      ) : null}

      {/* Bottom-right hint. */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 max-w-[16rem] text-right text-[11px] text-cream/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
        {stage === 'unit-view'
          ? 'Adjust stack and facing — the camera re-aligns to the picked window.'
          : 'Birds-eye — click Unit view to approach the window.'}
      </div>
    </div>
  )
}

type ListingOverlayCardProps = {
  listing: typeof SAMPLE_LISTING
  pricePerSqm: number
  uploadedName: string | null
}

function ListingOverlayCard({ listing, pricePerSqm, uploadedName }: ListingOverlayCardProps) {
  return (
    <article className="rounded-2xl border border-cream/20 bg-espresso/75 p-4 text-cream shadow-2xl shadow-black/30 backdrop-blur-xl">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-terracotta">
          {listing.flatType} · HDB Resale
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold leading-tight tracking-tight">
          {listing.address}
        </h1>
      </header>

      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
        <Stat label="Price" value={formatSgd(listing.priceSgd)} />
        <Stat label="PSF" value={`S$${listing.psfSgd.toLocaleString('en-SG')}`} />
        <Stat label="PSM" value={`S$${pricePerSqm.toLocaleString('en-SG')}`} />
        <Stat label="Beds" value={`${listing.bedrooms}`} />
        <Stat label="Baths" value={`${listing.bathrooms}`} />
        <Stat label="Area" value={`${listing.areaSqft.toLocaleString()} sqft`} />
      </dl>

      <div className="mt-3 border-t border-cream/15 pt-3 text-[11px] leading-relaxed text-cream/75">
        <p>TOP {listing.topYear} · {listing.leaseYears}-year lease</p>
        <p className="mt-1">
          Nearest MRT · {listing.nearestTransit[0]?.code} {listing.nearestTransit[0]?.name} ·{' '}
          {listing.nearestTransit[0]?.walkMinutes} min
        </p>
      </div>

      {uploadedName ? (
        <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cream/50">
          You uploaded · {uploadedName}
        </p>
      ) : null}
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cream/55">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-cream">{value}</dd>
    </div>
  )
}

type UploadGateProps = {
  onFile: (file: File) => void
}

function UploadGate({ onFile }: UploadGateProps) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-terracotta">
        Start
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
        Drop anything to continue
      </h1>
      <p className="mt-3 text-sm text-muted md:text-base">
        A floor plan PDF, a listing screenshot, a brochure — anything. For this
        demo we'll wire up a resale unit regardless of what you upload.
      </p>

      <label
        className={[
          'mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-16 text-espresso transition',
          dragOver
            ? 'border-terracotta bg-terracotta/5'
            : 'border-line bg-paper hover:border-terracotta/60 hover:bg-warm/50',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
      >
        <span className="text-2xl" aria-hidden>
          ⌂
        </span>
        <span className="text-sm font-semibold">Drop a file, or click to choose</span>
        <span className="text-xs text-muted">Any format. Nothing is uploaded.</span>
        <input
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
      </label>
    </div>
  )
}
