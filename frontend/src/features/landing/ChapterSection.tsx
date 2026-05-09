import { type LandingChapter } from './storyChapters'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

type ChapterSectionProps = {
  chapter: LandingChapter
  total: number
  isActive: boolean
  registerRef: (id: string, node: HTMLElement | null) => void
}

/**
 * Renders a chapter as a compact card inside the left rail of the split
 * landing layout. Takes roughly one viewport of vertical space so the sticky
 * 3D panel on the right has time to reframe between chapters.
 */
export function ChapterSection({ chapter, total, isActive, registerRef }: ChapterSectionProps) {
  const reducedMotion = usePrefersReducedMotion()

  const activeState = 'opacity-100 translate-y-0'
  const inactiveState = reducedMotion ? 'opacity-55' : 'opacity-40 translate-y-4'

  return (
    <section
      ref={(node) => registerRef(chapter.id, node)}
      data-chapter-id={chapter.id}
      aria-current={isActive ? 'step' : undefined}
      className="flex min-h-[90vh] items-center py-12"
    >
      <article
        className={[
          'max-w-xl rounded-3xl border border-line bg-paper p-6 shadow-sm transition-all duration-500 md:p-8',
          isActive ? activeState : inactiveState,
        ].join(' ')}
      >
        <header className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-terracotta">
            {chapter.kicker}
          </p>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">
            {chapter.chapter} / {String(total).padStart(2, '0')}
          </span>
        </header>

        <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.12] tracking-tight text-espresso md:text-[2.4rem]">
          {chapter.title}
        </h2>

        <p className="mt-4 text-sm leading-relaxed text-muted md:text-base">{chapter.summary}</p>

        <ul className="mt-6 space-y-2.5 text-sm leading-relaxed text-espresso/85">
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
              className="rounded-full border border-line bg-warm/60 px-3 py-1 text-xs font-medium text-espresso"
            >
              {chip}
            </span>
          ))}
        </div>
      </article>
    </section>
  )
}
