/**
 * Real resale listing used as the default demo target on the landing page
 * and the Explore page. Shape mirrors a typical public resale listing so we
 * can extend this to user-parsed URLs later without reshaping callers.
 *
 * Source: web-scraped resale listing for 105A Depot Road (picked because it
 * is rendered in Google 3D Maps' photorealistic tile set — the unit-view
 * camera actually lands on a building, not a grey block).
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
  id: '500114919',
  address: '105A Depot Road',
  block: '105A',
  street: 'Depot Road',
  postal: '102105',
  coordinates: { lat: 1.27985, lng: 103.80476 },
  flatType: '4 Room Flat',
  bedrooms: 3,
  bathrooms: 2,
  areaSqft: 990,
  priceSgd: 868_000,
  psfSgd: 877,
  negotiable: true,
  topYear: 2016,
  leaseYears: 99,
  listedOn: '2026-05-08',
  listingUrl: 'https://www.propertyguru.com.sg/listing/hdb-for-sale-105a-depot-road-500114919',
  agent: { name: 'Kenny Ter', agency: 'PROPNEX REALTY PTE. LTD.' },
  // Listing copy: "highly coveted North-South facing, Zero West sun".
  facingCandidates: ['North', 'North-East', 'East', 'South-East', 'South'],
  floorStack: [
    { label: '04 to 06', recentSale: { date: 'Apr 2025', priceSgd: 800_000, psfSgd: 808 } },
    { label: '07 to 09', recentSale: { date: 'Dec 2025', priceSgd: 836_000, psfSgd: 844 } },
    { label: '10 to 12', recentSale: { date: 'Sep 2025', priceSgd: 815_000, psfSgd: 823 } },
    { label: '13 to 15', recentSale: { date: 'Feb 2026', priceSgd: 845_000, psfSgd: 853 } },
  ],
  nearestTransit: [
    { code: 'EW18', name: 'Redhill MRT', walkMinutes: 15, distanceMeters: 1100 },
    { code: 'CC27', name: 'Labrador Park MRT', walkMinutes: 10, distanceMeters: 750 },
    { code: 'CC28', name: 'Telok Blangah MRT', walkMinutes: 12, distanceMeters: 900 },
  ],
  highlights: [
    'Squarish 990 sqft layout, three intact bedrooms',
    'Rare "young flat" — TOP 2016, ~90 years left on the lease',
    'North–South facing, zero West sun',
    'Depot Heights mall + NTUC at the doorstep',
  ],
}

export function formatSgd(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(amount)
}
