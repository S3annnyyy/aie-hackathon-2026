import { Link } from 'react-router-dom'

import { usePrefersReducedMotion } from './usePrefersReducedMotion'

type HeroOverlayProps = {
  /** Fade out as the user scrolls past the hero; 0 = fully visible. */
  scrollFade: number
}

export function HeroOverlay({ scrollFade }: HeroOverlayProps) {
  const reducedMotion = usePrefersReducedMotion()
  const opacity = reducedMotion ? 1 : Math.max(0, 1 - scrollFade * 1.8)
  const translateY = reducedMotion ? 0 : Math.min(48, scrollFade * 140)

  // Strong text-shadow so copy reads against the orbiting GLB regardless of
  // what tone happens to be behind it in any given frame.
  const textShadow = '[text-shadow:0_2px_40px_rgba(0,0,0,0.9),0_1px_4px_rgba(0,0,0,0.8)]'

  return (
    <>
      {/* Readability scrim — darker at top (nav area) and bottom (headline)
          so the hero copy stays legible across all camera angles. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(26,20,16,0.62)_0%,rgba(26,20,16,0)_22%,rgba(26,20,16,0)_45%,rgba(26,20,16,0.72)_100%)]"
      />

      <div
        className="pointer-events-none absolute inset-0 flex flex-col justify-between px-6 pb-20 pt-8 md:px-16 md:pb-24 md:pt-10"
        style={{ opacity, transform: `translateY(-${translateY}px)` }}
      >
        <div className="pointer-events-auto flex items-start justify-between">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.32em] text-terracotta ${textShadow}`}>
              StackView
            </p>
            <p className={`mt-2 font-[family-name:var(--font-display)] text-sm text-cream md:text-base ${textShadow}`}>
              An AI interior designer for Singapore resale flats.
            </p>
          </div>
          <nav className="flex items-center gap-2 text-xs text-cream md:text-sm">
            <Link
              to="/explore"
              className="rounded-full border border-cream/25 bg-espresso/40 px-3 py-1.5 font-medium backdrop-blur transition hover:border-cream/60 hover:bg-espresso/60"
            >
              Explore
            </Link>
            <Link
              to="/designer"
              className="rounded-full border border-cream/25 bg-espresso/40 px-3 py-1.5 font-medium backdrop-blur transition hover:border-cream/60 hover:bg-espresso/60"
            >
              Designer
            </Link>
          </nav>
        </div>

        <div className="pointer-events-auto max-w-3xl">
          <h1
            className={`font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.02] tracking-tight text-cream md:text-[6.5rem] ${textShadow}`}
          >
            See around <span className="italic text-terracotta">before</span>
            <br />
            you move in.
          </h1>
          <p className={`mt-6 max-w-xl text-base leading-relaxed text-cream md:text-lg ${textShadow}`}>
            Three hundred Pinterest pins don't tell you if the living room gets
            morning light. StackView does. Stand at the window. Design the rooms.
            Decide from your laptop.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-black/40 transition hover:bg-terracotta-dark"
            >
              Explore a unit →
            </Link>
            <Link
              to="/designer"
              className="inline-flex items-center rounded-full border border-cream/40 bg-espresso/35 px-5 py-2.5 text-sm font-semibold text-cream backdrop-blur transition hover:border-cream/70 hover:bg-espresso/55"
            >
              Open Designer
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
