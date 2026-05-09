export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-terracotta">
        Coming up
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight md:text-5xl">
        Pick your unit. See the view from its window.
      </h1>
      <p className="mt-6 text-base leading-relaxed text-muted md:text-lg">
        Paste a PropertyGuru listing URL, or dial in a block / level / facing.
        We map the unit on Google 3D Maps and generate the outward view with
        Gemini — so you can compare three listings without three commutes.
      </p>
      <p className="mt-10 text-sm text-subtle">Unit picker skeleton ships in a later phase.</p>
    </div>
  )
}
