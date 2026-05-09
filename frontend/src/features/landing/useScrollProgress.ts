import { useEffect, useState } from 'react'

/**
 * Returns the document's vertical scroll progress in [0, 1]. Uses
 * `requestAnimationFrame` coalescing so multiple scroll events in the same
 * frame do not cause redundant renders.
 */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(() => readProgress())

  useEffect(() => {
    let frame = 0
    let dispose = false

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        if (dispose) return
        setProgress(readProgress())
      })
    }

    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      dispose = true
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return progress
}

function readProgress(): number {
  if (typeof window === 'undefined') return 0
  const doc = document.documentElement
  const scrollable = doc.scrollHeight - window.innerHeight
  if (scrollable <= 0) return 0
  return Math.min(1, Math.max(0, window.scrollY / scrollable))
}
