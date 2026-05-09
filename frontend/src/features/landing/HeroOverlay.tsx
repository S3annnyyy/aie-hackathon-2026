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

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col justify-between px-6 pb-20 pt-8 md:px-16 md:pb-24 md:pt-10"
      style={{ opacity, transform: `translateY(-${translateY}px)` }}
    >
      <div className="pointer-events-auto flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-terracotta">
            Pascal
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-sm text-cream/85 md:text-base">
            An AI interior designer for Singapore resale flats.
          </p>
        </div>
        <nav className="flex items-center gap-2 text-xs text-cream/70 md:text-sm">
          <Link
            to="/explore"
            className="rounded-full border border-cream/15 px-3 py-1.5 font-medium transition hover:border-cream/40 hover:text-cream"
          >
            Explore
          </Link>
          <Link
            to="/designer"
            className="rounded-full border border-cream/15 px-3 py-1.5 font-medium transition hover:border-cream/40 hover:text-cream"
          >
            Designer
          </Link>
        </nav>
      </div>

      <div className="pointer-events-auto max-w-3xl">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.02] tracking-tight text-cream md:text-[6.5rem]">
          See inside <span className="italic text-terracotta">before</span>
          <br />
          you move in.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-cream/75 md:text-lg">
          Three hundred Pinterest pins don't tell you if the living room gets
          morning light. Pascal does. Stand at the window. Design the rooms.
          Decide from your laptop.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-black/30 transition hover:bg-terracotta-dark"
          >
            Explore a unit →
          </Link>
          <Link
            to="/designer"
            className="inline-flex items-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition hover:border-cream/60 hover:bg-cream/5"
          >
            Open Designer
          </Link>
        </div>
      </div>
    </div>
  )
}
