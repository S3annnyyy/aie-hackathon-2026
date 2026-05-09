import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ListingCard } from '../features/explore/ListingCard'
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

  const listing = SAMPLE_LISTING
  const summaryLine = useMemo(
    () =>
      `${listing.bedrooms} bed · ${listing.bathrooms} bath · ${listing.areaSqft.toLocaleString()} sqft · ${formatSgd(
        listing.priceSgd,
      )}`,
    [listing],
  )

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-8 md:py-14">
      {stage === 'await-upload' ? (
        <UploadGate onFile={handleFile} />
      ) : (
        <>
          <header className="mb-6 md:mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-terracotta">
              Sample unit
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
              {listing.address}
            </h1>
            <p className="mt-2 text-sm text-muted md:text-base">{summaryLine}</p>
            {uploadedName ? (
              <p className="mt-1 text-xs text-subtle">
                Using sample data · you uploaded <em>{uploadedName}</em>
              </p>
            ) : null}
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard
              title="Unit view"
              description="See this block on Google 3D Maps from the stack and facing of your unit."
              primary={stage !== 'unit-view'}
              cta={stage === 'unit-view' ? 'Viewing' : 'Show unit view →'}
              onClick={() => setStage('unit-view')}
            />
            <ActionCard
              as="link"
              to="/interior"
              title="View interior"
              description="Open the full-page 3D model of the unit with a chat overlay to design it."
              primary
              cta="Open interior →"
            />
          </div>

          {stage === 'unit-view' ? (
            <section className="mt-10 grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="space-y-4">
                <ListingCard listing={listing} />
                <StackPicker
                  listing={listing}
                  stackLabel={stackLabel}
                  facing={facing}
                  onStackChange={setStackLabel}
                  onFacingChange={setFacing}
                />
              </div>
              <div>
                <Map3DView
                  lat={listing.coordinates.lat}
                  lng={listing.coordinates.lng}
                  stackLabel={stackLabel}
                  facing={facing}
                />
              </div>
            </section>
          ) : null}
        </>
      )}
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

type ActionCardProps =
  | {
      as?: 'button'
      title: string
      description: string
      cta: string
      primary?: boolean
      onClick: () => void
      to?: never
    }
  | {
      as: 'link'
      title: string
      description: string
      cta: string
      primary?: boolean
      to: string
      onClick?: never
    }

function ActionCard(props: ActionCardProps) {
  const classes = [
    'group flex flex-col justify-between gap-6 rounded-3xl border p-6 text-left transition md:p-8',
    props.primary
      ? 'border-terracotta bg-terracotta text-white hover:bg-terracotta-dark'
      : 'border-line bg-paper text-espresso hover:border-terracotta/60',
  ].join(' ')

  const body = (
    <>
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {props.title}
        </h2>
        <p
          className={[
            'mt-2 text-sm leading-relaxed',
            props.primary ? 'text-white/80' : 'text-muted',
          ].join(' ')}
        >
          {props.description}
        </p>
      </div>
      <span
        className={[
          'inline-flex w-fit items-center gap-1 text-sm font-semibold',
          props.primary ? 'text-white' : 'text-terracotta',
        ].join(' ')}
      >
        {props.cta}
      </span>
    </>
  )

  if (props.as === 'link') {
    return (
      <Link to={props.to} className={classes}>
        {body}
      </Link>
    )
  }

  return (
    <button type="button" onClick={props.onClick} className={classes}>
      {body}
    </button>
  )
}
