import { useEffect, useMemo, useRef, useState } from 'react'

type ChapterIdLike = { readonly id: string }

type RegisterRef = (id: string, node: HTMLElement | null) => void

export type ActiveChapterHandle = {
  readonly activeId: string
  readonly registerRef: RegisterRef
}

/**
 * Tracks which chapter is currently dominant in the viewport using
 * IntersectionObserver. Avoids scroll listeners firing every frame.
 *
 * The "active" chapter is the one with the largest intersection ratio;
 * ties fall back to the chapter nearer the top of the viewport.
 */
export function useActiveChapter<T extends ChapterIdLike>(
  chapters: readonly T[],
): ActiveChapterHandle {
  const [activeId, setActiveId] = useState<string>(() => chapters[0]?.id ?? '')
  const nodesRef = useRef(new Map<string, HTMLElement>())
  const ratiosRef = useRef(new Map<string, number>())

  const chapterIds = useMemo(() => chapters.map((c) => c.id), [chapters])

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.chapterId
          if (!id) continue
          ratiosRef.current.set(id, entry.isIntersecting ? entry.intersectionRatio : 0)
        }

        let bestId = activeId
        let bestRatio = -1
        let bestTop = Number.POSITIVE_INFINITY
        for (const id of chapterIds) {
          const ratio = ratiosRef.current.get(id) ?? 0
          if (ratio <= 0) continue
          const node = nodesRef.current.get(id)
          if (!node) continue
          const top = node.getBoundingClientRect().top
          if (ratio > bestRatio || (ratio === bestRatio && top < bestTop)) {
            bestId = id
            bestRatio = ratio
            bestTop = top
          }
        }
        if (bestId !== activeId) setActiveId(bestId)
      },
      {
        rootMargin: '-32% 0px -32% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )

    for (const node of nodesRef.current.values()) observer.observe(node)
    return () => observer.disconnect()
    // `activeId` intentionally excluded — we only want to wire the observer once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIds])

  const registerRef: RegisterRef = (id, node) => {
    if (node) nodesRef.current.set(id, node)
    else nodesRef.current.delete(id)
  }

  return { activeId, registerRef }
}
