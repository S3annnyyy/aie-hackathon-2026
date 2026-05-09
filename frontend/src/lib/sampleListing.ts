/**
 * Real resale listing used as the default demo target on the landing page
 * and the Explore page. Shape mirrors a typical public resale listing so we
 * can extend this to user-parsed URLs later without reshaping callers.
 *
 * Source: web-scraped resale listing for 70C Telok Blangah Heights (corner
 * unit, high floor, Telok Blangah Ridgeview, TOP 2016/2017).
 * Coordinates verified against OneMap Singapore (authoritative).
 */

export type FloorStackBand = {
  readonly label: string // e.g. "16 to 18"
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
  id: '500031072',
  address: '70C Telok Blangah Heights',
  block: '70C',
  street: 'Telok Blangah Heights',
  postal: '103070',
  // OneMap-verified coordinates for the block footprint.
  coordinates: { lat: 1.2759962, lng: 103.810863 },
  flatType: '4 Room Flat',
  bedrooms: 3,
  bathrooms: 2,
  areaSqft: 1001,
  priceSgd: 979_333,
  psfSgd: 978,
  negotiable: false,
  topYear: 2017,
  leaseYears: 99,
  listedOn: '2026-05-08',
  listingUrl:
    'https://www.propertyguru.com.sg/listing/hdb-for-sale-70c-telok-blangah-heights-500031072',
  agent: { name: 'Pius Yap Chih Hong 叶智弘', agency: 'ERA REALTY NETWORK PTE LTD' },
  // Listing copy: "Quiet and peaceful facing, greenery view" — corner unit
  // looking over the Telok Blangah Hill Park side.
  facingCandidates: ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West'],
  // Real transaction history from the source page.
  floorStack: [
    { label: '13 to 15', recentSale: { date: 'Aug 2025', priceSgd: 970_000, psfSgd: 969 } },
    { label: '16 to 18', recentSale: { date: 'Mar 2026', priceSgd: 1_060_000, psfSgd: 1059 } },
    { label: '19 to 21', recentSale: { date: 'Apr 2025', priceSgd: 1_000_000, psfSgd: 999 } },
    { label: '22 to 24', recentSale: { date: 'Apr 2025', priceSgd: 1_010_000, psfSgd: 1008 } },
  ],
  nearestTransit: [
    { code: 'CC28', name: 'Telok Blangah MRT', walkMinutes: 10, distanceMeters: 830 },
    { code: 'CC27', name: 'Labrador Park MRT', walkMinutes: 14, distanceMeters: 1100 },
    { code: 'NE1', name: 'HarbourFront MRT', walkMinutes: 16, distanceMeters: 1300 },
  ],
  highlights: [
    'Corner unit, high floor with greenery view',
    'TOP 2017 · 99-year lease · 25-storey block',
    'Stream Garden & Telok Blangah Hill Park at the doorstep',
    'Blangah Rise Primary · My First Skool · Blangah Rise Kindergarten within 200 m',
  ],
}

export function formatSgd(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(amount)
}
