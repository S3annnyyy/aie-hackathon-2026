import { useEffect, useState, type RefObject } from 'react'

type ContainerRef = RefObject<HTMLElement | null> | null

/**
 * Returns the scroll progress of a container element in [0, 1]. If
 * `containerRef` is omitted or null, falls back to `window`/`document`.
 *
 * Uses `requestAnimationFrame` coalescing so multiple scroll events in the
 * same frame do not cause redundant renders.
 */
export function useScrollProgress(containerRef: ContainerRef = null): number {
  const [progress, setProgress] = useState(() => readProgress(containerRef?.current ?? null))

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const target: HTMLElement | Window = containerRef?.current ?? window
    let frame = 0
    let disposed = false

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        if (disposed) return
        setProgress(readProgress(containerRef?.current ?? null))
      })
    }

    schedule()
    target.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      disposed = true
      if (frame) window.cancelAnimationFrame(frame)
      target.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [containerRef])

  return progress
}

function readProgress(container: HTMLElement | null): number {
  if (typeof window === 'undefined') return 0
  if (container) {
    const scrollable = container.scrollHeight - container.clientHeight
    if (scrollable <= 0) return 0
    return Math.min(1, Math.max(0, container.scrollTop / scrollable))
  }
  const doc = document.documentElement
  const scrollable = doc.scrollHeight - window.innerHeight
  if (scrollable <= 0) return 0
  return Math.min(1, Math.max(0, window.scrollY / scrollable))
}
