import { HeroCanvas } from '../HeroCanvas'

/**
 * Chapter 04 background — the hero GLB rendered properly (full-bleed,
 * dark backdrop) so the interior is finally visible. Camera is pinned
 * to an "inside-the-apartment" framing.
 */
export function InteriorScene() {
  return (
    <div className="absolute inset-0 bg-espresso">
      <HeroCanvas frame="interior" background="#1a1410" fog still />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso/85 via-espresso/35 to-espresso/25" />
    </div>
  )
}
