/**
 * Real resale listing used as the default demo target on the landing page
 * and the Explore page. Shape mirrors a typical public resale listing so we
 * can extend this to user-parsed URLs later without reshaping callers.
 *
 * Source: web-scraped resale listing for 93B Telok Blangah Street 31.
 */

export type FloorStackBand = {
  readonly label: string // e.g. "22 to 24"
  readonly recentSale?: {
    readonly date: string // "Apr 2026"
    readonly priceSgd: number
    readonly psfSgd: number
  }
}

export type NearestTransit = {
  readonly code: string
  readonly name: string
  readonly walkMinutes: number
  readonly distanceMeters: number
}

export type ResaleListing = {
  readonly id: string
  readonly address: string
  readonly block: string
  readonly street: string
  readonly postal: string
  readonly coordinates: { readonly lat: number; readonly lng: number }
  readonly flatType: string // "4 Room Flat" / "4A HDB"
  readonly bedrooms: number
  readonly bathrooms: number
  readonly areaSqft: number
  readonly priceSgd: number
  readonly psfSgd: number
  readonly negotiable: boolean
  readonly topYear: number
  readonly leaseYears: number
  readonly listedOn: string // ISO date
  readonly listingUrl: string
  readonly agent: { readonly name: string; readonly agency: string }
  readonly facingCandidates: readonly string[]
  readonly floorStack: readonly FloorStackBand[]
  readonly nearestTransit: readonly NearestTransit[]
  readonly highlights: readonly string[]
}

export const SAMPLE_LISTING: ResaleListing = {
  id: '500001283',
  address: '93B Telok Blangah Street 31',
  block: '93B',
  street: 'Telok Blangah Street 31',
  postal: '091093',
  coordinates: { lat: 1.27022, lng: 103.81048 },
  flatType: '4 Room Flat',
  bedrooms: 3,
  bathrooms: 2,
  areaSqft: 1001,
  priceSgd: 950_000,
  psfSgd: 949,
  negotiable: false,
  topYear: 2018,
  leaseYears: 99,
  listedOn: '2026-05-08',
  listingUrl:
    'https://www.propertyguru.com.sg/listing/hdb-for-sale-93b-telok-blangah-street-31-500001283',
  agent: { name: 'Eugene Lin', agency: 'PROPNEX REALTY PTE. LTD.' },
  // Listing copy calls out a "bright north–south orientation"; keep corridor
  // facings as candidates for the camera demo.
  facingCandidates: ['North', 'North-East', 'East', 'South-East', 'South'],
  // No price history is published for this block, so we seed the typical
  // 40-storey Telok Blangah stack bands so the picker still demos.
  floorStack: [
    { label: '07 to 09' },
    { label: '13 to 15' },
    { label: '19 to 21' },
    { label: '25 to 27' },
    { label: '31 to 33' },
  ],
  nearestTransit: [
    { code: 'CC27', name: 'Labrador Park MRT', walkMinutes: 10, distanceMeters: 860 },
    { code: 'CC28', name: 'Telok Blangah MRT', walkMinutes: 11, distanceMeters: 880 },
  ],
  highlights: [
    'Bright north–south orientation, corner unit',
    'TOP Dec 2018 · 99-year lease',
    'Near Mount Faber Park, Henderson Waves, Southern Ridges',
    'Walk to VivoCity, HarbourFront, Mapletree Business City',
  ],
}

export function formatSgd(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(amount)
}
