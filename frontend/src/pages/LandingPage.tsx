import { useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ChapterProgress } from '../features/landing/ChapterProgress'
import { ChapterSection } from '../features/landing/ChapterSection'
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
  cardTheme: 'light' | 'dark'
  align: 'left' | 'right' | 'center'
}

/**
 * Each chapter gets its own dedicated visual so the landing reads as a
 * story, not a brochure stack with the same hero in the corner. The card
 * theme flips between light and dark to stay legible on each scene.
 */
const CHAPTER_RENDERING: Record<string, ChapterRendering> = {
  problem: { scene: <PinterestWall />, cardTheme: 'light', align: 'left' },
  solution: { scene: <ThreeViewsScene />, cardTheme: 'light', align: 'right' },
  explore: { scene: <StackScene />, cardTheme: 'dark', align: 'left' },
  design: { scene: <InteriorScene />, cardTheme: 'dark', align: 'right' },
  validate: { scene: <BeforeAfterScene />, cardTheme: 'dark', align: 'center' },
}

export default function LandingPage() {
  const heroProgress = useScrollProgress()
  const { activeId, registerRef } = useActiveChapter(LANDING_CHAPTERS)

  const onJump = useCallback((id: string) => {
    const node = document.querySelector<HTMLElement>(`[data-chapter-id="${id}"]`)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <>
      {/* Act 1 — full-bleed hero. Plays once, then leaves the viewport. */}
      <section className="relative h-screen w-full overflow-hidden bg-espresso">
        <HeroCanvas progress={heroProgress} frame="hero" background="#1a1410" fog />
        <HeroOverlay scrollFade={heroProgress} />
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <div className="rounded-full border border-cream/15 bg-espresso/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cream/80 backdrop-blur-xl">
            Scroll to explore
          </div>
        </div>
      </section>

      {/* Act 2 — chapter story. One full-viewport scene per chapter. */}
      <ChapterProgress chapters={LANDING_CHAPTERS} activeId={activeId} onJump={onJump} />

      {LANDING_CHAPTERS.map((chapter) => {
        const rendering = CHAPTER_RENDERING[chapter.id] ?? {
          scene: null,
          cardTheme: 'light' as const,
          align: 'left' as const,
        }
        return (
          <ChapterSection
            key={chapter.id}
            chapter={chapter}
            total={LANDING_CHAPTERS.length}
            isActive={chapter.id === activeId}
            registerRef={registerRef}
            scene={rendering.scene}
            cardTheme={rendering.cardTheme}
            align={rendering.align}
          />
        )
      })}

      {/* Act 3 — closing CTA. */}
      <section className="relative bg-cream px-6 py-24 md:px-10 md:py-32">
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
              to="/explore"
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-terracotta/30 transition hover:bg-terracotta-dark"
            >
              Explore the sample unit →
            </Link>
            <Link
              to="/designer"
              className="inline-flex items-center rounded-full border border-espresso/20 px-6 py-3 text-sm font-semibold text-espresso transition hover:border-espresso/40 hover:bg-warm"
            >
              Open the designer
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
