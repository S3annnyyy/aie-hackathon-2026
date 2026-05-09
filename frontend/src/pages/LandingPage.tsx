import { useCallback } from 'react'
import { Link } from 'react-router-dom'

import { ChapterProgress } from '../features/landing/ChapterProgress'
import { ChapterSection } from '../features/landing/ChapterSection'
import { HeroCanvas } from '../features/landing/HeroCanvas'
import { HeroOverlay } from '../features/landing/HeroOverlay'
import { LANDING_CHAPTERS } from '../features/landing/storyChapters'
import { useActiveChapter } from '../features/landing/useActiveChapter'
import { useScrollProgress } from '../features/landing/useScrollProgress'
import { SAMPLE_LISTING } from '../lib/sampleListing'

export default function LandingPage() {
  const progress = useScrollProgress()
  const { activeId, registerRef } = useActiveChapter(LANDING_CHAPTERS)
  const activeChapter =
    LANDING_CHAPTERS.find((c) => c.id === activeId) ?? LANDING_CHAPTERS[0]!

  const onJump = useCallback((id: string) => {
    const node = document.querySelector<HTMLElement>(`[data-chapter-id="${id}"]`)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <>
      {/* Act 1 — full-bleed hero. */}
      <section className="relative h-screen w-full overflow-hidden bg-espresso">
        <HeroCanvas progress={progress} frame="hero" background="#1a1410" fog />
        <HeroOverlay scrollFade={progress} />
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <div className="rounded-full border border-cream/15 bg-espresso/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cream/80 backdrop-blur-xl">
            Scroll to explore
          </div>
        </div>
      </section>

      {/*
        Act 2 — split layout. Left rail scrolls through chapters, right rail
        is a sticky 3D panel that reframes per active chapter. No overlap: the
        canvas lives in its own column.
      */}
      <section className="relative bg-cream">
        <ChapterProgress chapters={LANDING_CHAPTERS} activeId={activeId} onJump={onJump} />

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-10">
          {/* Left rail: one chapter card per ~viewport. */}
          <div className="space-y-0">
            {LANDING_CHAPTERS.map((chapter) => (
              <ChapterSection
                key={chapter.id}
                chapter={chapter}
                total={LANDING_CHAPTERS.length}
                isActive={chapter.id === activeId}
                registerRef={registerRef}
              />
            ))}
          </div>

          {/* Right rail: sticky 3D panel — reframes based on active chapter. */}
          <div className="relative hidden lg:block">
            <div className="sticky top-24 h-[calc(100vh-8rem)]">
              <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-line bg-espresso shadow-xl shadow-black/20">
                <HeroCanvas frame={activeChapter.frame} background="#1a1410" />
                <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between rounded-full bg-espresso/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cream/80 backdrop-blur">
                  <span>Chapter {activeChapter.chapter}</span>
                  <span aria-live="polite">{activeChapter.kicker}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Act 3 — closing CTA. */}
        <div className="px-6 pb-24 pt-8 md:px-10 md:pb-32">
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
        </div>
      </section>
    </>
  )
}
