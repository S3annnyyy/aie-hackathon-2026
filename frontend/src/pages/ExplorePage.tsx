import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Map3DView } from '../features/explore/Map3DView'
import { StackPicker } from '../features/explore/StackPicker'
import { formatSgd, SAMPLE_LISTING } from '../lib/sampleListing'

type Stage = 'await-upload' | 'choices' | 'unit-view'

export default function ExplorePage() {
  const [stage, setStage] = useState<Stage>('await-upload')
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const [stackLabel, setStackLabel] = useState<string>(
    SAMPLE_LISTING.floorStack[2]?.label ?? SAMPLE_LISTING.floorStack[0]!.label,
  )
  const [facing, setFacing] = useState<string>(SAMPLE_LISTING.facingCandidates[2] ?? 'North')

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
      onStackChange={setStackLabel}
      onFacingChange={setFacing}
    />
  )
}

type UnitBackdropProps = {
  stackLabel: string
  facing: string
  stage: Exclude<Stage, 'await-upload'>
  uploadedName: string | null
  onShowUnitView: () => void
  onStackChange: (label: string) => void
  onFacingChange: (facing: string) => void
}

function UnitBackdrop({
  stackLabel,
  facing,
  stage,
  uploadedName,
  onShowUnitView,
  onStackChange,
  onFacingChange,
}: UnitBackdropProps) {
  const listing = SAMPLE_LISTING
  const summaryLine = useMemo(
    () =>
      `${listing.bedrooms} bed · ${listing.bathrooms} bath · ${listing.areaSqft.toLocaleString()} sqft · ${formatSgd(
        listing.priceSgd,
      )}`,
    [listing],
  )

  return (
    <div className="relative h-[calc(100vh-5rem)] w-full overflow-hidden">
      {/* Full-bleed 3D Maps backdrop. */}
      <div className="absolute inset-0">
        <Map3DView
          lat={listing.coordinates.lat}
          lng={listing.coordinates.lng}
          stackLabel={stackLabel}
          facing={facing}
        />
        {/* Readability scrims on top + bottom so overlay copy stays legible. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-espresso/40 via-transparent to-espresso/50" />
      </div>

      {/* Top bar — listing summary pill. */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-cream/20 bg-espresso/65 px-4 py-2 text-cream shadow-lg shadow-black/30 backdrop-blur-xl">
          <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-terracotta">
            Sample unit
          </span>
          <span className="hidden text-xs text-cream/75 md:inline">·</span>
          <span className="text-sm font-semibold">{listing.address}</span>
          <span className="hidden text-xs text-cream/70 md:inline">· {summaryLine}</span>
        </div>
      </div>

      {/* Right rail — compact action pills. */}
      <div className="pointer-events-auto absolute right-4 top-20 z-10 flex flex-col gap-2">
        <PillButton
          active={stage === 'unit-view'}
          onClick={onShowUnitView}
          primary={stage !== 'unit-view'}
        >
          {stage === 'unit-view' ? 'Unit view · active' : 'Unit view'}
        </PillButton>
        <Link
          to="/interior"
          className="inline-flex items-center justify-center rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:bg-terracotta-dark"
        >
          View interior →
        </Link>
      </div>

      {/* Bottom-left — stack + facing picker appears in unit-view stage. */}
      {stage === 'unit-view' ? (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 max-w-sm">
          <StackPicker
            listing={listing}
            stackLabel={stackLabel}
            facing={facing}
            onStackChange={onStackChange}
            onFacingChange={onFacingChange}
          />
        </div>
      ) : null}

      {/* Bottom-right — context hint. */}
      <div className="pointer-events-none absolute bottom-6 right-4 z-10 max-w-xs text-right text-[11px] text-cream/70">
        {stage === 'unit-view'
          ? 'Picker drives the stack + facing. Google 3D Maps reframes.'
          : uploadedName
            ? `Using sample data · you uploaded "${uploadedName}"`
            : 'Click Unit view to align the camera to the picked stack + facing.'}
      </div>
    </div>
  )
}

type PillButtonProps = {
  active?: boolean
  primary?: boolean
  onClick: () => void
  children: React.ReactNode
}

function PillButton({ active, primary, onClick, children }: PillButtonProps) {
  const palette = active
    ? 'border border-cream/30 bg-espresso/70 text-cream'
    : primary
      ? 'bg-cream text-espresso shadow-lg shadow-black/20 hover:bg-warm'
      : 'border border-cream/30 bg-espresso/50 text-cream hover:bg-espresso/70'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-xl transition ${palette}`}
    >
      {children}
    </button>
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
        demo we'll wire up a sample resale unit regardless of what you upload.
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
