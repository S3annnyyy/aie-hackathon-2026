import { useEffect, useState } from 'react'

/**
 * Like `useState`, but persists the value to `sessionStorage` under `key`.
 * Survives route changes and tab refreshes within the same session; wiped
 * when the user opens a new browser tab or closes all tabs for this origin.
 *
 * Intentionally sessionStorage rather than localStorage — we want returning
 * visitors to start fresh, not resume last week's half-finished upload.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw === null) return initial
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* quota exceeded, private browsing, etc. — silently fall back to in-memory */
    }
  }, [key, value])

  return [value, setValue]
}
