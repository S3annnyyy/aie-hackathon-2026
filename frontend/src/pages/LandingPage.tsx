import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ChapterSection, type ChapterCopyVariant } from '../features/landing/ChapterSection'
import { HeroCanvas } from '../features/landing/HeroCanvas'
import { HeroOverlay } from '../features/landing/HeroOverlay'
import { BeforeAfterScene } from '../features/landing/scenes/BeforeAfterScene'
import { InteriorScene } from '../features/landing/scenes/InteriorScene'
import { PinterestWall } from '../features/landing/scenes/PinterestWall'
import { StackScene } from '../features/landing/scenes/StackScene'
import { ThreeViewsScene } from '../features/landing/scenes/ThreeViewsScene'
import { LANDING_CHAPTERS } from '../features/landing/storyChapters'
import { useActiveChapter } from '../features/landing/useActiveChapter'
import { useScrollProgress } from '../features/landing/useScrollProgress'
import { SAMPLE_LISTING } from '../lib/sampleListing'

type ChapterRendering = {
  scene: ReactNode
  copyTheme: 'light' | 'dark'
  variant: ChapterCopyVariant
}

/**
 * Each chapter gets its own visual AND its own copy layout. The variant
 * system keeps the story from looking like five identical slides while the
 * copy theme flips between dark ink (on cream scenes) and cream text (on
 * dark scenes) for readability without a panel.
 */
const CHAPTER_RENDERING: Record<string, ChapterRendering> = {
  problem: { scene: <PinterestWall />, copyTheme: 'dark', variant: 'editorial-bottom-left' },
  solution: { scene: <ThreeViewsScene />, copyTheme: 'dark', variant: 'center-top-grid' },
  explore: { scene: <StackScene />, copyTheme: 'light', variant: 'right-rail' },
  design: { scene: <InteriorScene />, copyTheme: 'light', variant: 'center-top-grid' },
  validate: { scene: <BeforeAfterScene />, copyTheme: 'light', variant: 'center-hero' },
}

export default function LandingPage() {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const heroProgress = useScrollProgress(scrollRef)
  const { activeId, registerRef } = useActiveChapter(LANDING_CHAPTERS)

  return (
    // `snap-y snap-mandatory` on this wrapper makes every direct child with
    // `snap-start` lock to the viewport as the user scrolls. Scroll-snap is
    // scoped to this route only — applying it to <html> would break the
    // editor pages where scrolling must stay free. The ref lets the hero's
    // push-in animation read this container's scrollTop (window.scrollY
    // stays 0 once the body no longer scrolls).
    <div
      ref={scrollRef}
      className="h-screen snap-y snap-mandatory overflow-y-scroll overflow-x-hidden"
    >
      {/* Act 1 — full-bleed hero. Plays once, then leaves the viewport. */}
      <section className="relative h-screen w-full snap-start overflow-hidden bg-espresso">
        <HeroCanvas progress={heroProgress} frame="hero" background="#1a1410" fog />
        <HeroOverlay scrollFade={heroProgress} />
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <div className="rounded-full border border-cream/15 bg-espresso/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cream/80 backdrop-blur-xl">
            Scroll to explore
          </div>
        </div>
      </section>

      {/* Act 2 — chapter story. One full-viewport scene per chapter, each a
          snap stop so the reader lands cleanly on every act. */}
      {LANDING_CHAPTERS.map((chapter) => {
        const rendering = CHAPTER_RENDERING[chapter.id] ?? {
          scene: null,
          copyTheme: 'dark' as const,
          variant: 'editorial-bottom-left' as const,
        }
        return (
          <div key={chapter.id} className="h-screen w-full snap-start">
            <ChapterSection
              chapter={chapter}
              total={LANDING_CHAPTERS.length}
              isActive={chapter.id === activeId}
              registerRef={registerRef}
              scene={rendering.scene}
              copyTheme={rendering.copyTheme}
              variant={rendering.variant}
            />
          </div>
        )
      })}

      {/* Act 3 — closing CTA, also a snap stop. */}
      <section className="relative flex h-screen w-full snap-start items-center justify-center bg-cream px-6 md:px-10">
        <div className="mx-auto max-w-3xl rounded-[2.5rem] border border-line bg-paper p-10 text-center text-espresso shadow-xl shadow-black/5 md:p-14">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-terracotta">
            Ready?
          </p>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Pick a listing. Step inside.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
            We’ll walk you through a real resale flat at {SAMPLE_LISTING.address} — outside,
            inside, and under afternoon sunlight.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/designer"
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-terracotta/30 transition hover:bg-terracotta-dark"
            >
              Open the designer →
            </Link>
            <Link
              to="/explore"
              className="inline-flex items-center rounded-full border border-espresso/20 px-6 py-3 text-sm font-semibold text-espresso transition hover:border-espresso/40 hover:bg-warm"
            >
              Explore a unit
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
