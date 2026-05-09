import { useCallback } from 'react'
import { Link } from 'react-router-dom'

import { ChapterProgress } from '../features/landing/ChapterProgress'
import { ChapterSection } from '../features/landing/ChapterSection'
import { HeroCanvas } from '../features/landing/HeroCanvas'
import { HeroOverlay } from '../features/landing/HeroOverlay'
import { LANDING_CHAPTERS } from '../features/landing/storyChapters'
import { useActiveChapter } from '../features/landing/useActiveChapter'
import { useScrollProgress } from '../features/landing/useScrollProgress'

export default function LandingPage() {
  const progress = useScrollProgress()
  const { activeId, registerRef } = useActiveChapter(LANDING_CHAPTERS)

  const onJump = useCallback((id: string) => {
    const node = document.querySelector<HTMLElement>(`[data-chapter-id="${id}"]`)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="relative">
      {/* Sticky 3D hero: the canvas is pinned behind the scrolling chapters. */}
      <div className="pointer-events-none fixed inset-0 z-0 h-screen w-full">
        <HeroCanvas progress={progress} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-espresso/40 to-espresso/85" />
        <HeroOverlay scrollFade={progress} />
      </div>

      <ChapterProgress chapters={LANDING_CHAPTERS} activeId={activeId} onJump={onJump} />

      <div className="relative z-10">
        {/* Spacer that matches the initial hero viewport so the first chapter starts below it. */}
        <div className="h-screen" aria-hidden />

        {LANDING_CHAPTERS.map((chapter) => (
          <ChapterSection
            key={chapter.id}
            chapter={chapter}
            total={LANDING_CHAPTERS.length}
            isActive={chapter.id === activeId}
            registerRef={registerRef}
          />
        ))}

        {/* Closing CTA — transitions out of the espresso story back into the cream product surface. */}
        <section className="relative px-6 py-24 md:px-16 md:py-32">
          <div className="mx-auto max-w-3xl rounded-[2.5rem] border border-cream/10 bg-cream p-10 text-center text-espresso shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)] md:p-14">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-terracotta">
              Ready?
            </p>
            <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Pick a listing. Step inside.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
              We’ll walk you through a real resale flat at 90A Telok Blangah — outside,
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
      </div>
    </div>
  )
}
