/**
 * Real resale listing used as the default demo target on the landing page
 * and the Explore page. Mirrors the shape of PropertyGuru's resale detail
 * view so we can extend this to parsed URLs later without reshaping callers.
 *
 * Source: PropertyGuru listing 500077059 (90A Telok Blangah Street 31).
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
  id: '500077059',
  address: '90A Telok Blangah Street 31',
  block: '90A',
  street: 'Telok Blangah Street 31',
  postal: '091090',
  coordinates: { lat: 1.27107, lng: 103.81166 },
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
  listingUrl:
    'https://www.propertyguru.com.sg/listing/hdb-for-sale-90a-telok-blangah-street-31-500077059',
  agent: { name: 'Lin Sallee 林玥廷', agency: 'HUTTONS ASIA PTE LTD' },
  facingCandidates: ['North', 'North-East', 'East', 'South-East', 'South'],
  floorStack: [
    { label: '07 to 09', recentSale: { date: 'Mar 2026', priceSgd: 919_000, psfSgd: 918 } },
    { label: '19 to 21', recentSale: { date: 'Dec 2025', priceSgd: 988_000, psfSgd: 987 } },
    { label: '22 to 24', recentSale: { date: 'Apr 2026', priceSgd: 1_000_000, psfSgd: 999 } },
    { label: '25 to 27', recentSale: { date: 'Mar 2026', priceSgd: 1_040_000, psfSgd: 1039 } },
  ],
  nearestTransit: [
    { code: 'CC28', name: 'Telok Blangah MRT', walkMinutes: 8, distanceMeters: 670 },
    { code: 'CC27', name: 'Labrador Park MRT', walkMinutes: 9, distanceMeters: 780 },
  ],
  highlights: [
    '670 m (8 min walk) from CC28 Telok Blangah MRT',
    'TOP Dec 2018 · 99-year lease',
    'Near Mount Faber Park, Southern Ridges, VivoCity',
    'Greater Southern Waterfront upside',
  ],
}

export function formatSgd(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(amount)
}
