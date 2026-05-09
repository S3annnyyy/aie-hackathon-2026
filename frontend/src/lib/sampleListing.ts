/**
 * Real resale listing used as the default demo target on the landing page
 * and the Explore page. Shape mirrors a typical public resale listing so we
 * can extend this to user-parsed URLs later without reshaping callers.
 *
 * Source: web-scraped resale listing for 90A Telok Blangah Street 31.
 * Coordinates verified against OneMap Singapore (authoritative).
 */

export type FloorStackBand = {
  readonly label: string // e.g. "13 to 15"
  readonly recentSale?: {
    readonly date: string
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
  readonly flatType: string
  readonly bedrooms: number
  readonly bathrooms: number
  readonly areaSqft: number
  readonly priceSgd: number
  readonly psfSgd: number
  readonly negotiable: boolean
  readonly topYear: number
  readonly leaseYears: number
  readonly listedOn: string
  readonly listingUrl: string
  readonly agent: { readonly name: string; readonly agency: string }
  readonly facingCandidates: readonly string[]
  readonly floorStack: readonly FloorStackBand[]
  readonly nearestTransit: readonly NearestTransit[]
  readonly highlights: readonly string[]
}

export const SAMPLE_LISTING: ResaleListing = {
  id: '500077059',
  address: '90A Telok Blangah Street 31',
  block: '90A',
  street: 'Telok Blangah Street 31',
  postal: '101090',
  // OneMap-verified coordinates for the block footprint.
  coordinates: { lat: 1.2777346, lng: 103.8070933 },
  flatType: '4 Room Flat',
  bedrooms: 3,
  bathrooms: 2,
  areaSqft: 1001,
  priceSgd: 933_000,
  psfSgd: 932,
  negotiable: true,
  topYear: 2018,
  leaseYears: 99,
  listedOn: '2026-05-08',
  listingUrl: 'https://www.propertyguru.com.sg/listing/hdb-for-sale-90a-telok-blangah-street-31-500077059',
  agent: { name: 'Lin Sallee 林玥廷', agency: 'HUTTONS ASIA PTE LTD' },
  facingCandidates: ['North', 'North-East', 'East', 'South-East', 'South'],
  // This listing has no published transaction history on the source page, so
  // we seed plausible stack bands for a typical ~40-storey Telok Blangah block
  // to keep the stack picker meaningful for the demo.
  floorStack: [
    { label: '07 to 09' },
    { label: '13 to 15' },
    { label: '19 to 21' },
    { label: '25 to 27' },
    { label: '31 to 33' },
  ],
  nearestTransit: [
    { code: 'CC28', name: 'Telok Blangah MRT', walkMinutes: 8, distanceMeters: 670 },
    { code: 'CC27', name: 'Labrador Park MRT', walkMinutes: 11, distanceMeters: 880 },
  ],
  highlights: [
    'Minutes to Telok Blangah MRT (Circle Line) and HarbourFront',
    'Close to Mount Faber Park, Southern Ridges, VivoCity',
    'Greater Southern Waterfront upside potential',
    'TOP Dec 2018 · 99-year lease · minimal build-in, ready for renovation',
  ],
}

export function formatSgd(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(amount)
}
