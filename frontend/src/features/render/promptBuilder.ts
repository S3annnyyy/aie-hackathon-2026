import type { LayoutSchema, Room } from '../../lib/api'

export type RenderPromptInput = {
  schema: LayoutSchema | null
  selectedRoom: Room | null
  freeformVibe?: string
}

const BASE_DIRECTIVE = [
  'Re-render this exact 3D viewport as a photoreal interior photograph.',
  'Preserve every wall position, room boundary, window placement, door opening, and furniture placement from the reference image verbatim.',
  'Do not add, remove, or reshape geometry — only upgrade materials, lighting, props, and finish.',
  'Shoot it like an architectural digest interior: 35mm equivalent, f/5.6, warm natural light, realistic shadows, subtle imperfections.',
  'No text, labels, logos, or watermarks. No artistic filters.',
].join(' ')

export function buildRenderPrompt({ schema, selectedRoom, freeformVibe }: RenderPromptInput): string {
  const parts: string[] = [BASE_DIRECTIVE]

  if (selectedRoom) {
    const area = selectedRoom.estimated_area_sqm
      ? ` (~${selectedRoom.estimated_area_sqm.toFixed(1)} sqm)`
      : ''
    parts.push(
      `Primary subject: the ${selectedRoom.type} room named "${selectedRoom.name}"${area}.`,
    )
    if (selectedRoom.notes) {
      parts.push(`Designer notes on this room: ${selectedRoom.notes}`)
    }
  } else if (schema?.rooms?.length) {
    parts.push(`Scene contains ${schema.rooms.length} rooms: ${summarizeRooms(schema.rooms)}.`)
  }

  if (schema?.finish_type) {
    parts.push(`Overall interior style: ${schema.finish_type}.`)
  }
  if (schema?.flat_type) {
    parts.push(`Unit type context: ${schema.flat_type}.`)
  }
  if (schema?.notes) {
    parts.push(`General notes: ${schema.notes}`)
  }

  const sceneNotes = schema?.rooms
    ?.map((r) => r.notes?.trim())
    .filter((n): n is string => Boolean(n && n.length))
    .slice(0, 3)
  if (sceneNotes && sceneNotes.length > 0) {
    parts.push(`Other rooms carry these notes: ${sceneNotes.join(' | ')}.`)
  }

  const cleaned = freeformVibe?.trim()
  if (cleaned) {
    parts.push(`Additional vibe from the user: ${cleaned}`)
  }

  return parts.join('\n\n')
}

function summarizeRooms(rooms: readonly Room[]): string {
  return rooms
    .slice(0, 8)
    .map((room) => `${room.name || room.id} (${room.type})`)
    .join(', ')
}
