export type ChapterAlign = 'left' | 'right'

export type LandingChapter = {
  readonly id: string
  readonly chapter: string
  readonly kicker: string
  readonly title: string
  readonly summary: string
  readonly points: readonly string[]
  readonly chips: readonly string[]
  readonly align: ChapterAlign
}

export const LANDING_CHAPTERS: readonly LandingChapter[] = [
  {
    id: 'pain',
    chapter: '01',
    kicker: 'The problem',
    title: 'Three hundred Pinterest pins, zero floor plans.',
    summary:
      'Resale buyers stockpile inspiration and then stall. The unit they viewed last weekend blurs together with the three they saw this one. They can’t remember which living room gets evening light or which bedroom shared a wall with the lift core.',
    points: [
      'Floor-level and facing sit buried in the listing copy',
      'Property agents show you units — not the view from them',
      'Interior mood boards don’t translate to the shell you actually bought',
    ],
    chips: ['Decision fatigue', 'Information asymmetry', 'Pinterest ≠ blueprint'],
    align: 'left',
  },
  {
    id: 'discover',
    chapter: '02',
    kicker: 'Act 1 · Discover',
    title: 'Start from the block, not the brochure.',
    summary:
      'Paste a PropertyGuru URL. We pin the block on a Google 3D Map, compute a camera at the listed stack, and render the view from that window with Gemini. The flat stops being a string of sqft numbers and starts being a place.',
    points: [
      'Block location, stack level, and facing derived from listing data',
      'Gemini-generated window view, not a staged agent photo',
      'Side-by-side comparison against other listings on the same address',
    ],
    chips: ['Google 3D Maps', 'Gemini render', 'Real resale data'],
    align: 'right',
  },
  {
    id: 'inside',
    chapter: '03',
    kicker: 'Act 2 · Design',
    title: 'The shell is yours. The mood is the hard part.',
    summary:
      'Drop the floor plan PDF. Pascal extracts rooms and their dimensions, generates the 3D shell in Blender, and opens a chat with an AI interior designer. Talk to it. Watch the rooms populate.',
    points: [
      'Automatic floorplan → 3D GLB from HDB brochures',
      'Chat-driven edits: move furniture, swap materials, restyle a room',
      'Drop a reference photo — Pascal matches palette and props',
    ],
    chips: ['Blender pipeline', 'LLM tool-use', 'Live GLB regen'],
    align: 'left',
  },
  {
    id: 'validate',
    chapter: '04',
    kicker: 'Act 3 · Decide',
    title: 'Feel the light before you sign the OTP.',
    summary:
      'Run sun-and-shadow across a weekday. Generate a photoreal still from the living-room camera with GPT Image 2. Compare two units in two tabs. Then decide whether to book that viewing — or skip it.',
    points: [
      'Sun & shadow simulation per level and facing',
      'GPT Image 2 photoreal interior renders from your GLB',
      'Export a shareable lookbook for your family and ID',
    ],
    chips: ['Shadow simulation', 'GPT Image 2', 'Exportable'],
    align: 'right',
  },
]
