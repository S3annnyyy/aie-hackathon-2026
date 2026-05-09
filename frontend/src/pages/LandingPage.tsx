import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-terracotta">
        Pascal · Landing — WIP
      </p>
      <h1 className="mt-6 font-[family-name:var(--font-display)] text-5xl font-semibold leading-tight tracking-tight text-cream md:text-7xl">
        See inside before
        <br />
        you move in.
      </h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-cream/75 md:text-lg">
        Resale flats deserve the same scrutiny as a new car. Stand at the window,
        furnish the living room, and decide from your laptop.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/explore"
          className="inline-flex items-center rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-terracotta-dark"
        >
          Explore a unit
        </Link>
        <Link
          to="/designer"
          className="inline-flex items-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition hover:border-cream/60 hover:bg-cream/5"
        >
          Open Designer
        </Link>
      </div>
      <p className="mt-16 text-xs text-cream/40">
        Hero, scroll chapters, and unit picker land in the next commit.
      </p>
    </div>
  )
}
