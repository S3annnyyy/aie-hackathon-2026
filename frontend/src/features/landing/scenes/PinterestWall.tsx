import { useMemo } from 'react'

import { GALLERY_TILES, type GalleryTile } from './galleryData'
import { usePrefersReducedMotion } from '../usePrefersReducedMotion'

const COLUMN_COUNT_MD = 3
const COLUMN_COUNT_LG = 5

/**
 * Background layer for Chapter 01. Renders the gallery tiles across
 * 3/5 columns (responsive) and animates each column's translateY via a
 * pure CSS keyframe — so the page keeps running even with the tab
 * backgrounded and costs nothing in React render time.
 */
export function PinterestWall() {
  const reducedMotion = usePrefersReducedMotion()

  const columns = useMemo(() => {
    const lgColumns: GalleryTile[][] = Array.from({ length: COLUMN_COUNT_LG }, () => [])
    GALLERY_TILES.forEach((tile, i) => {
      lgColumns[i % COLUMN_COUNT_LG]!.push(tile)
    })
    const mdColumns: GalleryTile[][] = Array.from({ length: COLUMN_COUNT_MD }, () => [])
    GALLERY_TILES.forEach((tile, i) => {
      mdColumns[i % COLUMN_COUNT_MD]!.push(tile)
    })
    return { lgColumns, mdColumns }
  }, [])

  return (
    <>
      {/* Columns — render two responsive layouts, show/hide with md breakpoint. */}
      <div className="absolute inset-0 hidden gap-3 overflow-hidden px-3 md:grid md:grid-cols-3 lg:hidden">
        {columns.mdColumns.map((col, i) => (
          <AutoScrollColumn key={i} tiles={col} direction={i % 2 === 0 ? 'down' : 'up'} duration={reducedMotion ? 0 : 70 + i * 6} />
        ))}
      </div>

      <div className="absolute inset-0 hidden gap-3 overflow-hidden px-3 lg:grid lg:grid-cols-5">
        {columns.lgColumns.map((col, i) => (
          <AutoScrollColumn key={i} tiles={col} direction={i % 2 === 0 ? 'down' : 'up'} duration={reducedMotion ? 0 : 65 + i * 5} />
        ))}
      </div>

      {/* Bare 2-column fallback for small viewports (no animation). */}
      <div className="absolute inset-0 grid grid-cols-2 gap-2 overflow-hidden px-2 md:hidden">
        {GALLERY_TILES.slice(0, 8).map((t) => (
          <Tile key={t.id} tile={t} />
        ))}
      </div>

      {/* Readability scrim — light cream wash on top so text cards can breathe. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cream/75 via-cream/55 to-cream/90" />
    </>
  )
}

type AutoScrollColumnProps = {
  tiles: readonly GalleryTile[]
  direction: 'up' | 'down'
  duration: number
}

function AutoScrollColumn({ tiles, direction, duration }: AutoScrollColumnProps) {
  // Duplicate the list so the marquee loop has no visible seam.
  const doubled = [...tiles, ...tiles]

  if (duration === 0) {
    return (
      <div className="flex h-full flex-col gap-3">
        {tiles.map((t) => (
          <Tile key={t.id} tile={t} />
        ))}
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className="flex flex-col gap-3"
        style={{
          animation: `stackview-marquee-${direction} ${duration}s linear infinite`,
        }}
      >
        {doubled.map((t, i) => (
          <Tile key={`${t.id}-${i}`} tile={t} />
        ))}
      </div>
    </div>
  )
}

function Tile({ tile }: { tile: GalleryTile }) {
  const aspectClass = {
    portrait: 'aspect-[3/4]',
    square: 'aspect-square',
    landscape: 'aspect-[4/3]',
    tall: 'aspect-[2/3]',
  }[tile.aspect]

  if (tile.src) {
    return (
      <img
        src={tile.src}
        alt={tile.label}
        className={`w-full rounded-2xl object-cover shadow-sm ${aspectClass}`}
        loading="lazy"
      />
    )
  }

  return (
    <div
      aria-label={tile.label}
      className={`w-full rounded-2xl shadow-sm ring-1 ring-line ${aspectClass}`}
      style={{ background: tile.tone }}
    />
  )
}
