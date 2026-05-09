/**
 * Landing-page scroll story for StackView.
 *
 * `frame` is a hint consumed by `HeroCanvas`: how the 3D model should be
 * framed during each chapter. Cameras are tuned in the canvas, not here —
 * this is a semantic label, not raw world-space.
 */
export type HeroFrame = 'hero' | 'wide' | 'orbit-block' | 'dolly-in' | 'interior' | 'interior-close'

export type LandingChapter = {
  readonly id: string
  readonly chapter: string
  readonly kicker: string
  readonly title: string
  readonly summary: string
  readonly points: readonly string[]
  readonly chips: readonly string[]
  readonly frame: HeroFrame
}

export const LANDING_CHAPTERS: readonly LandingChapter[] = [
  {
    id: 'problem',
    chapter: '01',
    kicker: 'The problem',
    title: 'Resale flats don’t let you feel the place before you sign.',
    summary:
      'Brochures show floor plans and agent photos. Neither tells you if the living room gets morning light, which wall shares the lift core, or whether the “good facing” actually faces the MRT. Buyers resort to three in-person viewings per shortlist and still guess at the finish.',
    points: [
      'Listings hide floor-level and facing in the body text',
      'Agent photos are staged for hype, not decisions',
      'Pinterest mood boards do not map to the shell you just bought',
    ],
    chips: ['Information asymmetry', 'Decision fatigue', 'Staged photos'],
    frame: 'wide',
  },
  {
    id: 'solution',
    chapter: '02',
    kicker: 'StackView, the fix',
    title: 'Three views of the unit. One decision.',
    summary:
      'StackView shows you the outside, the inside shell, and a photoreal interior render — from one listing URL. Three complementary views, backed by Google 3D Maps, your brochure PDF, and frontier image models. Make the call before the showroom visit.',
    points: [
      'Outside: the block pose on Google 3D Maps at your stack + facing',
      'Inside: a real 3D shell generated from the brochure floor plan',
      'Photoreal: the room rendered with your style, from your camera',
    ],
    chips: ['3D Maps', 'Floor plan → GLB', 'GPT Image render'],
    frame: 'orbit-block',
  },
  {
    id: 'explore',
    chapter: '03',
    kicker: 'Capability 01 · Explore',
    title: 'Stand at the window before you book the viewing.',
    summary:
      'Pick the stack and facing from the listing. StackView anchors a Google 3D Maps camera at that height and heading, so you see the horizon line this unit actually gets — not the hero shot the agent took at 3pm from the corridor.',
    points: [
      'Stack bands read from public resale transaction history',
      'Heading derived from 8-point compass facing',
      'Altitude = stack midpoint × 3.2m floor height',
    ],
    chips: ['Real resale data', 'Sub-second camera', 'No basement rates'],
    frame: 'dolly-in',
  },
  {
    id: 'design',
    chapter: '04',
    kicker: 'Capability 02 · Design',
    title: 'The shell is yours. Tell StackView the mood.',
    summary:
      'Drop the brochure PDF. We extract rooms, generate the 3D shell with Blender, and open a chat with an AI interior designer. Talk to it. Show it a reference photo. Watch furniture and finishes land in the right rooms, in real time.',
    points: [
      'PDF → labelled rooms + dimensions in seconds',
      'Chat edits the scene — every turn refreshes the GLB',
      'Drop a reference photo to transfer palette and props',
    ],
    chips: ['Blender pipeline', 'LLM tool-use', 'Live GLB regen'],
    frame: 'interior',
  },
  {
    id: 'validate',
    chapter: '05',
    kicker: 'Capability 03 · Validate',
    title: 'See the final photo before you move the furniture.',
    summary:
      'Frame the 3D scene however you want. Hit "Render this view". StackView screenshots the viewport and hands it to GPT Image with a prompt that preserves your geometry — so the photoreal result matches your actual unit, not a fantasy room.',
    points: [
      'Viewport capture → GPT Image edit, geometry locked',
      'Vibe extracted from chat + reference photos, not guessed',
      'Download the PNG, send it to your ID or family group chat',
    ],
    chips: ['GPT Image', 'Geometry-faithful', 'One-click export'],
    frame: 'interior-close',
  },
]
