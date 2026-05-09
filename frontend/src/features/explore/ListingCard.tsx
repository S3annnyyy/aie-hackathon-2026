import { formatSgd, type ResaleListing } from '../../lib/sampleListing'

type ListingCardProps = {
  listing: ResaleListing
}

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <article className="rounded-3xl border border-line bg-paper p-6 shadow-sm md:p-7">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-terracotta">
          {listing.flatType} · HDB Resale
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
          {listing.address}
        </h2>
        <p className="text-sm text-muted">
          Listing {listing.id} ·{' '}
          <a
            href={listing.listingUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-muted/40 underline-offset-2 hover:text-terracotta hover:decoration-terracotta"
          >
            view source listing
          </a>
        </p>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
        <Stat label="Price" value={formatSgd(listing.priceSgd)} hint={listing.negotiable ? 'Negotiable' : undefined} />
        <Stat label="PSF" value={`S$ ${listing.psfSgd.toLocaleString('en-SG')}`} />
        <Stat label="Bedrooms" value={listing.bedrooms} />
        <Stat label="Bathrooms" value={listing.bathrooms} />
        <Stat label="Floor area" value={`${listing.areaSqft.toLocaleString()} sqft`} />
        <Stat label="Lease" value={`${listing.leaseYears}-yr · TOP ${listing.topYear}`} />
      </dl>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-espresso">Why it matters</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          {listing.highlights.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-terracotta" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-espresso">Nearest transit</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {listing.nearestTransit.map((stop) => (
            <li key={stop.code} className="flex items-center gap-3">
              <span className="rounded-md bg-warm px-1.5 py-0.5 text-[11px] font-semibold text-espresso">
                {stop.code}
              </span>
              <span>{stop.name}</span>
              <span className="text-subtle">
                {stop.walkMinutes} min · {stop.distanceMeters} m
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

type StatProps = {
  label: string
  value: string | number
  hint?: string
}

function Stat({ label, value, hint }: StatProps) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-espresso">
        {value}
        {hint ? <span className="ml-2 text-xs font-normal text-muted">{hint}</span> : null}
      </dd>
    </div>
  )
}
