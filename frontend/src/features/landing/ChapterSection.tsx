import { type ReactNode } from 'react'

import { type LandingChapter } from './storyChapters'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export type ChapterCopyVariant =
  | 'editorial-bottom-left'
  | 'center-hero'
  | 'right-rail'
  | 'center-bottom'
  | 'center-top-grid'

export type ChapterSectionProps = {
  chapter: LandingChapter
  total: number
  isActive: boolean
  registerRef: (id: string, node: HTMLElement | null) => void
  /** Full-bleed visual rendered behind the chapter copy. */
  scene: ReactNode
  /** Light text on dark scenes, dark text on light scenes. */
  copyTheme?: 'light' | 'dark'
  /** Layout variation so chapters don't all look alike. */
  variant?: ChapterCopyVariant
}

export function ChapterSection({
  chapter,
  total,
  isActive,
  registerRef,
  scene,
  copyTheme = 'dark',
  variant = 'editorial-bottom-left',
}: ChapterSectionProps) {
  const reducedMotion = usePrefersReducedMotion()

  const inactiveState = reducedMotion ? 'opacity-90' : 'opacity-55 translate-y-6'
  const activeState = 'opacity-100 translate-y-0'

  const color = copyTheme === 'dark' ? 'text-espresso' : 'text-cream'
  const muted = copyTheme === 'dark' ? 'text-muted' : 'text-cream/85'
  const soft = copyTheme === 'dark' ? 'text-espresso/85' : 'text-cream/90'
  const dotColor = 'bg-terracotta'
  const pipe = copyTheme === 'dark' ? 'text-subtle' : 'text-cream/45'
  // A subtle text-shadow on light scenes, bolder on dark, so copy reads
  // without a background panel.
  const shadow = copyTheme === 'dark' ? 'drop-shadow-sm' : '[text-shadow:0_2px_24px_rgba(0,0,0,0.55)]'

  // `total` is still part of the API but the kicker/chapter-count line is
  // intentionally omitted from the rendered copy per product direction.
  void total
  const title = (
    <h2
      className={[
        'font-[family-name:var(--font-display)] font-semibold leading-[1.02] tracking-tight',
        color,
        shadow,
      ].join(' ')}
    >
      {chapter.title}
    </h2>
  )

  const summary = (
    <p className={['max-w-2xl leading-relaxed', muted, shadow].join(' ')}>
      {chapter.summary}
    </p>
  )

  const points = (
    <ul className={['space-y-2.5 text-sm leading-relaxed md:text-base', soft].join(' ')}>
      {chapter.points.map((point) => (
        <li key={point} className="flex gap-3">
          <span aria-hidden className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          <span className={shadow}>{point}</span>
        </li>
      ))}
    </ul>
  )

  // Chips become a light inline row (separators instead of pills) — better fit
  // for free-floating copy than the old bordered chip pills.
  const chips = (
    <p className={['flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-[0.22em]', color, shadow].join(' ')}>
      {chapter.chips.map((chip, i) => (
        <span key={chip} className="flex items-center gap-3">
          {i > 0 ? (
            <span aria-hidden className={pipe}>
              ·
            </span>
          ) : null}
          <span>{chip}</span>
        </span>
      ))}
    </p>
  )

  let body: ReactNode
  switch (variant) {
    case 'center-hero':
      body = (
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-6 pt-20 text-center md:px-12 md:pt-28">
          <div className="[&_h2]:text-5xl md:[&_h2]:text-[5.5rem]">{title}</div>
          <div className="mx-auto max-w-2xl">{summary}</div>
          <div className="mt-2">{chips}</div>
        </div>
      )
      break

    case 'right-rail':
      body = (
        <div className="flex h-screen items-center px-6 md:px-16">
          <div className="ml-auto flex w-full max-w-xl flex-col items-end gap-5 text-right">
              <div className="[&_h2]:text-4xl md:[&_h2]:text-[3.25rem]">{title}</div>
            {summary}
            <div className="w-full max-w-md text-left">{points}</div>
            {chips}
          </div>
        </div>
      )
      break

    case 'center-bottom':
      body = (
        <div className="flex h-screen items-end justify-center px-6 pb-20 md:px-12 md:pb-24">
          <div className="flex w-full max-w-4xl flex-col items-center gap-5 text-center">
              <div className="[&_h2]:text-4xl md:[&_h2]:text-[4rem]">{title}</div>
            {summary}
            <ul className={['mt-2 grid grid-cols-1 gap-3 text-sm leading-relaxed md:grid-cols-3 md:gap-6', soft].join(' ')}>
              {chapter.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <span aria-hidden className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                  <span className={shadow}>{point}</span>
                </li>
              ))}
            </ul>
            {chips}
          </div>
        </div>
      )
      break

    case 'center-top-grid':
      body = (
        <div className="flex h-screen flex-col gap-8 px-6 pt-20 md:px-12 md:pt-28">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <div className="[&_h2]:text-4xl md:[&_h2]:text-[4rem]">{title}</div>
            {summary}
          </div>
          {/* Grid width + gap mirror the ThreeViewsScene tiles so each bullet
              sits directly beneath its matching box. */}
          <div className="mx-auto mt-auto grid w-full max-w-4xl grid-cols-1 gap-4 pb-16 md:grid-cols-3 md:gap-6 md:pb-20">
            {chapter.points.map((point) => (
              <div
                key={point}
                className={`flex items-start gap-2 px-2 text-sm md:text-[0.95rem] ${soft}`}
              >
                <span
                  aria-hidden
                  className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
                />
                <span className={shadow}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      )
      break

    case 'editorial-bottom-left':
    default:
      body = (
        <div className="flex h-screen items-end px-6 pb-16 md:px-12 md:pb-24">
          <div className="flex w-full max-w-2xl flex-col gap-5">
              <div className="[&_h2]:text-4xl md:[&_h2]:text-[4rem]">{title}</div>
            {summary}
            {points}
            {chips}
          </div>
        </div>
      )
  }

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
          'relative z-10 transition-all duration-500',
          isActive ? activeState : inactiveState,
        ].join(' ')}
      >
        {body}
      </div>
    </section>
  )
}
