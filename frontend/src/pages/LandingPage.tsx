import { HeroCanvas } from '../features/landing/HeroCanvas'
import { HeroOverlay } from '../features/landing/HeroOverlay'
import { useScrollProgress } from '../features/landing/useScrollProgress'

export default function LandingPage() {
  const progress = useScrollProgress()

  return (
    <div className="relative">
      {/* Sticky 3D hero + overlay — stays pinned for the first viewport. */}
      <section className="relative h-screen">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <HeroCanvas progress={progress} />
          <HeroOverlay scrollFade={progress} />
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
            <div className="rounded-full border border-cream/15 bg-espresso/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cream/80 backdrop-blur-xl">
              Scroll to explore
            </div>
          </div>
        </div>
      </section>

      {/*
        Scroll reservoir — phase 3 replaces this block with real chapters.
        Kept intentionally minimal so the hero alone is testable.
      */}
      <section className="relative min-h-[180vh] bg-gradient-to-b from-espresso via-espresso to-cream" />
    </div>
  )
}
