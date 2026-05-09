import { type LandingChapter } from './storyChapters'

type ChapterSectionProps = {
  chapter: LandingChapter
  total: number
  isActive: boolean
  registerRef: (id: string, node: HTMLElement | null) => void
}

export function ChapterSection({ chapter, total, isActive, registerRef }: ChapterSectionProps) {
  const alignmentClass = chapter.align === 'right' ? 'md:justify-end' : 'md:justify-start'

  return (
    <section
      ref={(node) => registerRef(chapter.id, node)}
      data-chapter-id={chapter.id}
      aria-current={isActive ? 'step' : undefined}
      className="relative flex min-h-screen items-center px-6 md:px-16"
    >
      <div className={`flex w-full ${alignmentClass}`}>
        <article
          className={[
            'pointer-events-auto max-w-xl rounded-3xl border border-cream/10 bg-espresso/55 p-6 shadow-xl shadow-black/25 backdrop-blur-2xl transition-all duration-500 md:p-8',
            isActive
              ? 'translate-y-0 border-cream/25 opacity-100'
              : 'translate-y-6 opacity-60',
          ].join(' ')}
        >
          <header className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-terracotta">
              {chapter.kicker}
            </p>
            <span className="rounded-full border border-cream/15 px-3 py-1 text-xs text-cream/80">
              {chapter.chapter} / {String(total).padStart(2, '0')}
            </span>
          </header>

          <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.1] tracking-tight text-cream md:text-[2.6rem]">
            {chapter.title}
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-cream/80 md:text-base">
            {chapter.summary}
          </p>

          <ul className="mt-6 space-y-3 text-sm leading-relaxed text-cream/85">
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
                className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1 text-xs font-medium text-cream/80"
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
