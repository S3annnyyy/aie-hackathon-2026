const VIEWS = [
  {
    label: 'Outside',
    subtitle: 'Block on Google 3D Maps',
    visual: (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#c4d4c0_0%,#7c8a6a_100%)]">
        <BuildingGlyph />
      </div>
    ),
  },
  {
    label: 'Inside',
    subtitle: 'GLB from the floor plan',
    visual: (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#ebe3d4_0%,#b89a7a_100%)]">
        <FloorPlanGlyph />
      </div>
    ),
  },
  {
    label: 'Photoreal',
    subtitle: 'GPT Image render',
    visual: (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#d4a890_0%,#8f4f34_100%)]">
        <InteriorGlyph />
      </div>
    ),
  },
] as const

/**
 * Chapter 02 background — three labelled tiles laid out horizontally,
 * each a different simplified visual of one StackView capability. A
 * slow CSS cycle highlights one tile at a time so the viewer's eye
 * moves through all three in sequence.
 */
export function ThreeViewsScene() {
  return (
    <div className="absolute inset-0 flex items-center bg-gradient-to-b from-cream to-warm">
      <div className="grid w-full gap-4 px-4 md:grid-cols-3 md:gap-8 md:px-16">
        {VIEWS.map((v, i) => (
          <figure
            key={v.label}
            className="group relative overflow-hidden rounded-3xl border border-line bg-paper shadow-lg"
            style={{
              animation: `stackview-tile-pulse 9s ease-in-out ${i * 3}s infinite`,
            }}
          >
            <div className="aspect-[4/5] w-full overflow-hidden md:aspect-[3/4]">{v.visual}</div>
            <figcaption className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-3 bg-gradient-to-t from-espresso/80 via-espresso/20 to-transparent px-5 py-4">
              <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-cream md:text-2xl">
                {v.label}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cream/80">
                {v.subtitle}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cream/30 via-transparent to-cream/60" />
    </div>
  )
}

function BuildingGlyph() {
  return (
    <svg viewBox="0 0 160 200" className="h-3/5 w-auto text-espresso">
      <rect x="36" y="48" width="88" height="140" fill="currentColor" opacity="0.14" />
      <g fill="currentColor">
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 4 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={44 + col * 20}
              y={56 + row * 16}
              width="12"
              height="10"
              opacity="0.55"
            />
          )),
        )}
      </g>
    </svg>
  )
}

function FloorPlanGlyph() {
  return (
    <svg viewBox="0 0 200 160" className="h-3/5 w-auto text-espresso">
      <rect x="10" y="10" width="180" height="140" fill="none" stroke="currentColor" strokeWidth="3" />
      <line x1="100" y1="10" x2="100" y2="80" stroke="currentColor" strokeWidth="2" />
      <line x1="100" y1="80" x2="190" y2="80" stroke="currentColor" strokeWidth="2" />
      <line x1="10" y1="100" x2="100" y2="100" stroke="currentColor" strokeWidth="2" />
      <circle cx="55" cy="140" r="4" fill="currentColor" />
      <circle cx="140" cy="45" r="4" fill="currentColor" />
    </svg>
  )
}

function InteriorGlyph() {
  return (
    <svg viewBox="0 0 180 140" className="h-3/5 w-auto text-cream">
      <rect x="10" y="24" width="160" height="90" fill="currentColor" opacity="0.14" />
      <rect x="30" y="62" width="72" height="34" fill="currentColor" opacity="0.5" />
      <rect x="110" y="70" width="40" height="26" fill="currentColor" opacity="0.4" />
      <rect x="130" y="28" width="24" height="30" fill="currentColor" opacity="0.22" />
      <circle cx="150" cy="40" r="6" fill="currentColor" opacity="0.8" />
    </svg>
  )
}
