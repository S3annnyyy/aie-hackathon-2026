import { type ReactNode } from 'react'

import { type LandingChapter } from './storyChapters'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export type ChapterSectionProps = {
  chapter: LandingChapter
  total: number
  isActive: boolean
  registerRef: (id: string, node: HTMLElement | null) => void
  /** The per-chapter visual scene rendered behind the text card. */
  scene: ReactNode
  /**
   * Theme hint for the text card. Chapter scenes vary between light and
   * dark backgrounds; the card swaps palettes to stay readable.
   */
  cardTheme?: 'light' | 'dark'
  /** Side of the viewport the text card pins to. */
  align?: 'left' | 'right' | 'center'
}

export function ChapterSection({
  chapter,
  total,
  isActive,
  registerRef,
  scene,
  cardTheme = 'light',
  align = 'left',
}: ChapterSectionProps) {
  const reducedMotion = usePrefersReducedMotion()

  const inactiveState = reducedMotion ? 'opacity-90' : 'opacity-60 translate-y-6'
  const activeState = 'opacity-100 translate-y-0'

  const containerAlign =
    align === 'right' ? 'md:justify-end' : align === 'center' ? 'md:justify-center' : 'md:justify-start'

  const cardBase =
    cardTheme === 'dark'
      ? 'border-cream/15 bg-espresso/75 text-cream backdrop-blur-xl'
      : 'border-line bg-paper/95 text-espresso backdrop-blur-xl'
  const chipTone =
    cardTheme === 'dark'
      ? 'border-cream/15 bg-cream/5 text-cream'
      : 'border-line bg-warm/70 text-espresso'
  const mutedTone = cardTheme === 'dark' ? 'text-cream/80' : 'text-muted'
  const pointTone = cardTheme === 'dark' ? 'text-cream/85' : 'text-espresso/85'

  return (
    <section
      ref={(node) => registerRef(chapter.id, node)}
      data-chapter-id={chapter.id}
      aria-current={isActive ? 'step' : undefined}
      className="relative min-h-screen overflow-hidden"
    >
      {scene}

      <div
        className={[
          'relative z-10 flex min-h-screen items-center px-6 py-20 md:px-12 lg:px-24',
          containerAlign,
        ].join(' ')}
      >
        <article
          className={[
            'max-w-xl rounded-3xl border p-6 shadow-xl transition-all duration-500 md:p-8',
            cardBase,
            isActive ? activeState : inactiveState,
          ].join(' ')}
        >
          <header className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-terracotta">
              {chapter.kicker}
            </p>
            <span
              className={[
                'rounded-full border px-2.5 py-0.5 text-[11px]',
                cardTheme === 'dark'
                  ? 'border-cream/15 text-cream/80'
                  : 'border-line text-muted',
              ].join(' ')}
            >
              {chapter.chapter} / {String(total).padStart(2, '0')}
            </span>
          </header>

          <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.1] tracking-tight md:text-[2.6rem]">
            {chapter.title}
          </h2>

          <p className={['mt-4 text-sm leading-relaxed md:text-base', mutedTone].join(' ')}>
            {chapter.summary}
          </p>

          <ul className={['mt-6 space-y-2.5 text-sm leading-relaxed', pointTone].join(' ')}>
            {chapter.points.map((point) => (
              <li key={point} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta"
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-2">
            {chapter.chips.map((chip) => (
              <span
                key={chip}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  chipTone,
                ].join(' ')}
              >
                {chip}
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
