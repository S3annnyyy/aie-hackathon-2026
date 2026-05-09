/**
 * Tile data for the Pinterest-style gallery in Chapter 01.
 *
 * Images live in /public/interiors/. Any tile whose `src` is null falls
 * back to its gradient tone, so the page still looks intentional if files
 * are missing. The list is intentionally doubled with varied aspects so
 * the auto-scrolling masonry never visibly empties or looks monotonous.
 */

export type GalleryTile = {
  readonly id: string
  readonly src: string | null
  readonly aspect: 'portrait' | 'square' | 'landscape' | 'tall'
  readonly tone: string
  readonly label: string
}

const tones = {
  cream: 'linear-gradient(135deg, #f5efe6 0%, #ebe3d4 100%)',
  warm: 'linear-gradient(135deg, #ebe3d4 0%, #d6c9b4 100%)',
  terracotta: 'linear-gradient(135deg, #d4a890 0%, #b86b4b 100%)',
  sage: 'linear-gradient(135deg, #aebfa0 0%, #7c8a6a 100%)',
  espresso: 'linear-gradient(135deg, #574a3e 0%, #2a221b 100%)',
  blush: 'linear-gradient(135deg, #e8c9b3 0%, #c2957a 100%)',
  clay: 'linear-gradient(135deg, #d4bfa5 0%, #b89a7a 100%)',
  ink: 'linear-gradient(135deg, #3d4a3a 0%, #1a1410 100%)',
} as const

// Real photos in /public/interiors/. Each entry maps to a file the user
// dropped in; labels are short descriptive anchors rather than
// anchor-specific (a label mismatch with the shot is forgivable here).
const PHOTO_POOL = [
  { file: '01.jpg', label: 'Open-plan living', aspect: 'landscape' as const, tone: tones.cream },
  { file: '02.jpg', label: 'Industrial dining', aspect: 'landscape' as const, tone: tones.espresso },
  { file: '03.jpg', label: 'Feature TV wall', aspect: 'landscape' as const, tone: tones.clay },
  { file: '04.jpg', label: 'Warm sectional', aspect: 'landscape' as const, tone: tones.warm },
  { file: '05.jpg', label: 'Kitchen peninsula', aspect: 'landscape' as const, tone: tones.cream },
  { file: '06.jpg', label: 'Evening lounge', aspect: 'landscape' as const, tone: tones.ink },
  { file: '07.jpg', label: 'Arch nook', aspect: 'landscape' as const, tone: tones.espresso },
  { file: '08.jpg', label: 'Display cabinets', aspect: 'landscape' as const, tone: tones.warm },
  { file: '09.jpg', label: 'HDB classic', aspect: 'landscape' as const, tone: tones.clay },
  { file: '10.jpg', label: 'Moody tile wall', aspect: 'landscape' as const, tone: tones.ink },
  { file: '11.jpg', label: 'Light corridor', aspect: 'landscape' as const, tone: tones.cream },
  { file: '12.jpg', label: 'Japandi living', aspect: 'square' as const, tone: tones.cream },
  { file: '13.jpg', label: 'Industrial warehouse', aspect: 'landscape' as const, tone: tones.ink },
  { file: '14.jpg', label: 'Monochrome study', aspect: 'landscape' as const, tone: tones.espresso },
  { file: '15.jpg', label: 'Pink neon bar', aspect: 'landscape' as const, tone: tones.terracotta },
  { file: '16.jpg', label: 'Graffiti lounge', aspect: 'landscape' as const, tone: tones.sage },
  { file: '17.jpg', label: 'Designer sofa', aspect: 'landscape' as const, tone: tones.warm },
]

export const GALLERY_TILES: readonly GalleryTile[] = PHOTO_POOL.flatMap((entry, i) => [
  {
    id: `${entry.file}-a`,
    src: `/interiors/${entry.file}`,
    aspect: entry.aspect,
    tone: entry.tone,
    label: entry.label,
  },
  // Doubled with a rotating aspect so the masonry stays varied without
  // needing thirty source photos.
  {
    id: `${entry.file}-b`,
    src: `/interiors/${entry.file}`,
    aspect: ((): GalleryTile['aspect'] => {
      switch (i % 4) {
        case 0:
          return 'portrait'
        case 1:
          return 'square'
        case 2:
          return 'tall'
        default:
          return 'landscape'
      }
    })(),
    tone: entry.tone,
    label: entry.label,
  },
])
