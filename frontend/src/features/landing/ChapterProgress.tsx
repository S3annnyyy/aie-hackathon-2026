import type { LandingChapter } from './storyChapters'

type ChapterProgressProps = {
  chapters: readonly LandingChapter[]
  activeId: string
  onJump: (id: string) => void
}

export function ChapterProgress({ chapters, activeId, onJump }: ChapterProgressProps) {
  return (
    <nav
      aria-label="Landing chapters"
      className="pointer-events-auto fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 md:flex"
    >
      {chapters.map((chapter) => {
        const isActive = chapter.id === activeId
        return (
          <button
            key={chapter.id}
            type="button"
            onClick={() => onJump(chapter.id)}
            aria-current={isActive ? 'step' : undefined}
            className="group relative flex items-center gap-2"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-cream/60 transition group-hover:text-cream">
              {chapter.chapter}
            </span>
            <span
              className={[
                'h-px w-6 rounded-full transition-all',
                isActive
                  ? 'bg-terracotta'
                  : 'bg-cream/25 group-hover:bg-cream/45',
              ].join(' ')}
              style={isActive ? { width: 36 } : undefined}
            />
          </button>
        )
      })}
    </nav>
  )
}
