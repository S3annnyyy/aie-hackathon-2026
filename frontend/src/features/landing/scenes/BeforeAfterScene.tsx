/**
 * Chapter 05 background — a stylised before/after pair. Left is a
 * wireframe-ish "3D viewport" rendering, right is a photoreal warm
 * interior. Pure SVG — no assets required; swap in real JPEGs later by
 * replacing each side with an <img>.
 */
export function BeforeAfterScene() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#0f1218] via-[#1a1410] to-[#1a1410]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(124,138,106,0.18),transparent_55%),radial-gradient(circle_at_75%_60%,rgba(184,107,75,0.22),transparent_55%)]" />

      <div className="relative mx-auto flex h-full max-w-[1280px] items-center gap-6 px-4 py-16 md:gap-10 md:px-12">
        <Side
          label="Viewport"
          kicker="Your 3D model"
          gradient="linear-gradient(135deg, #2a3040 0%, #1f2432 100%)"
        >
          <WireframeInterior />
        </Side>

        <div className="relative flex h-64 flex-col items-center gap-2 self-center md:h-96">
          <div className="h-px flex-1 w-px bg-gradient-to-b from-transparent via-terracotta/80 to-transparent" />
          <span className="rounded-full border border-terracotta/50 bg-espresso/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-terracotta">
            GPT Image
          </span>
          <div className="h-px flex-1 w-px bg-gradient-to-b from-transparent via-terracotta/80 to-transparent" />
        </div>

        <Side
          label="Photoreal"
          kicker="Same geometry"
          gradient="linear-gradient(135deg, #d4a890 0%, #8f4f34 100%)"
          accent
        >
          <PhotorealInterior />
        </Side>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso/90 via-espresso/20 to-transparent" />
    </div>
  )
}

type SideProps = {
  label: string
  kicker: string
  gradient: string
  accent?: boolean
  children: React.ReactNode
}

function Side({ label, kicker, gradient, accent, children }: SideProps) {
  return (
    <figure className="relative flex-1">
      <div
        className="aspect-[5/6] w-full overflow-hidden rounded-[2rem] border border-cream/10 shadow-2xl shadow-black/50 md:aspect-[4/5]"
        style={{ background: gradient }}
      >
        {children}
      </div>
      <figcaption
        className={[
          'absolute -top-3 left-6 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]',
          accent ? 'bg-terracotta text-white' : 'bg-cream text-espresso',
        ].join(' ')}
      >
        {label} · {kicker}
      </figcaption>
    </figure>
  )
}

function WireframeInterior() {
  return (
    <svg viewBox="0 0 200 240" className="h-full w-full" aria-hidden>
      <g stroke="#7c8fa0" strokeWidth="1.5" fill="none" opacity="0.9">
        {/* Floor */}
        <path d="M10 200 L190 200 L170 230 L30 230 Z" />
        {/* Back wall */}
        <path d="M30 50 L170 50 L170 200 L30 200 Z" />
        {/* Side wall hint */}
        <path d="M10 70 L30 50 M10 220 L30 200" />
        {/* Sofa */}
        <rect x="55" y="150" width="90" height="35" />
        <rect x="55" y="140" width="30" height="10" />
        <rect x="115" y="140" width="30" height="10" />
        {/* Coffee table */}
        <rect x="78" y="190" width="45" height="18" />
        {/* Window */}
        <rect x="130" y="70" width="30" height="55" />
        <line x1="145" y1="70" x2="145" y2="125" />
        {/* Pendant */}
        <circle cx="80" cy="80" r="6" />
        <line x1="80" y1="50" x2="80" y2="74" />
      </g>
      <g fill="#7c8fa0" opacity="0.35">
        <circle cx="30" cy="50" r="2.5" />
        <circle cx="170" cy="50" r="2.5" />
        <circle cx="30" cy="200" r="2.5" />
        <circle cx="170" cy="200" r="2.5" />
      </g>
    </svg>
  )
}

function PhotorealInterior() {
  return (
    <svg viewBox="0 0 200 240" className="h-full w-full" aria-hidden>
      {/* Floor */}
      <path d="M10 200 L190 200 L170 230 L30 230 Z" fill="#6b4f3a" />
      <path d="M10 200 L190 200 L170 230 L30 230 Z" fill="url(#floorShine)" opacity="0.5" />
      {/* Back wall warm plaster */}
      <rect x="30" y="50" width="140" height="150" fill="#ede1cf" />
      {/* Side wall wash */}
      <path d="M10 70 L30 50 L30 200 L10 220 Z" fill="#d7c4ab" />
      {/* Window — evening warm */}
      <rect x="130" y="70" width="30" height="55" fill="url(#windowGlow)" />
      {/* Sofa */}
      <rect x="55" y="150" width="90" height="35" rx="4" fill="#f2e4d2" />
      <rect x="55" y="140" width="30" height="14" rx="3" fill="#e6d4bc" />
      <rect x="115" y="140" width="30" height="14" rx="3" fill="#e6d4bc" />
      {/* Coffee table walnut */}
      <rect x="78" y="190" width="45" height="14" rx="2" fill="#4a2f1e" />
      {/* Rug */}
      <ellipse cx="100" cy="215" rx="62" ry="10" fill="#b86b4b" opacity="0.55" />
      {/* Pendant + glow */}
      <circle cx="80" cy="80" r="10" fill="#f5c7a6" />
      <circle cx="80" cy="80" r="20" fill="#f5c7a6" opacity="0.25" />
      <line x1="80" y1="50" x2="80" y2="70" stroke="#2a221b" strokeWidth="1" />
      <defs>
        <linearGradient id="floorShine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="windowGlow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fce3c3" />
          <stop offset="100%" stopColor="#d4957a" />
        </linearGradient>
      </defs>
    </svg>
  )
}
