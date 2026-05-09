/**
 * Placeholder tile data for the Pinterest-style gallery in Chapter 01.
 *
 * Each tile is a gradient + a decorative label — so the page looks
 * intentional even before real interior photos are dropped into
 * `/public/interiors/`. To swap in real images, add them to that folder
 * and point `src` at the asset path instead of leaving it null.
 */

export type GalleryTile = {
  readonly id: string
  readonly src: string | null
  readonly aspect: 'portrait' | 'square' | 'landscape' | 'tall'
  readonly tone: string // CSS gradient
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

export const GALLERY_TILES: readonly GalleryTile[] = [
  { id: 't1', src: null, aspect: 'portrait', tone: tones.cream, label: 'Scandi living' },
  { id: 't2', src: null, aspect: 'square', tone: tones.sage, label: 'Japandi bedroom' },
  { id: 't3', src: null, aspect: 'tall', tone: tones.terracotta, label: 'Warm kitchen' },
  { id: 't4', src: null, aspect: 'landscape', tone: tones.clay, label: 'Reading nook' },
  { id: 't5', src: null, aspect: 'portrait', tone: tones.blush, label: 'Soft pink' },
  { id: 't6', src: null, aspect: 'square', tone: tones.espresso, label: 'Dark wood' },
  { id: 't7', src: null, aspect: 'landscape', tone: tones.warm, label: 'Linen curtains' },
  { id: 't8', src: null, aspect: 'portrait', tone: tones.ink, label: 'Moody bath' },
  { id: 't9', src: null, aspect: 'tall', tone: tones.sage, label: 'Potted fiddle leaf' },
  { id: 't10', src: null, aspect: 'square', tone: tones.terracotta, label: 'Bouclé accent' },
  { id: 't11', src: null, aspect: 'portrait', tone: tones.cream, label: 'Morning light' },
  { id: 't12', src: null, aspect: 'landscape', tone: tones.blush, label: 'Art above bed' },
  { id: 't13', src: null, aspect: 'square', tone: tones.warm, label: 'Travertine' },
  { id: 't14', src: null, aspect: 'portrait', tone: tones.clay, label: 'Terracotta tile' },
  { id: 't15', src: null, aspect: 'tall', tone: tones.ink, label: 'Architectural' },
  { id: 't16', src: null, aspect: 'landscape', tone: tones.cream, label: 'Open plan' },
  { id: 't17', src: null, aspect: 'portrait', tone: tones.sage, label: 'Pendant light' },
  { id: 't18', src: null, aspect: 'square', tone: tones.espresso, label: 'Walnut sideboard' },
  { id: 't19', src: null, aspect: 'portrait', tone: tones.blush, label: 'Dining corner' },
  { id: 't20', src: null, aspect: 'tall', tone: tones.terracotta, label: 'Autumn palette' },
  { id: 't21', src: null, aspect: 'square', tone: tones.warm, label: 'Minimal shelf' },
  { id: 't22', src: null, aspect: 'landscape', tone: tones.clay, label: 'Stone bath' },
]
