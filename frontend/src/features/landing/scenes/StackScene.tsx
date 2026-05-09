/**
 * Chapter 03 background — a stylised block silhouette with window lights
 * cycling floor by floor, suggesting "we can pin the camera at any stack
 * level". Pure SVG + CSS; no canvas, no network.
 */
export function StackScene() {
  const floors = 12
  const unitsPerFloor = 6

  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#2a3040] via-[#1f2432] to-[#151821]">
      {/* Radial accent on the right side — balances the left-anchored block
          silhouette and gives the copy pinned to the right a warm halo. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,rgba(184,107,75,0.28),transparent_58%)]" />

      {/* Block silhouette pushed to the left third of the viewport so the
          right-rail chapter copy has clear space on the right. */}
      <div className="absolute inset-0 flex items-end justify-start pb-24 pl-4 md:pb-32 md:pl-16">
        <svg
          viewBox="0 0 420 620"
          className="h-[78vh] w-auto max-w-[48vw]"
          preserveAspectRatio="xMinYEnd meet"
          aria-hidden
        >
          {/* Building silhouette */}
          <rect x="80" y="40" width="260" height="560" rx="8" fill="#d9d2c2" opacity="0.92" />
          <rect x="80" y="40" width="260" height="560" rx="8" fill="url(#stackviewBuildingStroke)" opacity="0.25" />

          <defs>
            <linearGradient id="stackviewBuildingStroke" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f5efe6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#8f4f34" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          {/* Windows grid */}
          {Array.from({ length: floors }).map((_, row) =>
            Array.from({ length: unitsPerFloor }).map((_, col) => {
              const x = 100 + col * 36
              const y = 60 + row * 42
              const cycleDelay = (row * unitsPerFloor + col) * 0.35
              return (
                <rect
                  key={`${row}-${col}`}
                  x={x}
                  y={y}
                  width="22"
                  height="26"
                  rx="2"
                  fill="#b86b4b"
                  style={{
                    animation: `stackview-window-glow 9s ease-in-out ${cycleDelay}s infinite`,
                    transformOrigin: 'center',
                  }}
                />
              )
            }),
          )}

          {/* Horizon line */}
          <line x1="0" y1="600" x2="420" y2="600" stroke="#8f4f34" strokeOpacity="0.35" strokeWidth="2" />

          {/* Stack pointer — a subtle arc indicating "this is the camera pose" */}
          <g transform="translate(30 220)">
            <circle cx="0" cy="0" r="7" fill="#b86b4b" />
            <path d="M0,0 Q 45,-40 80,-25" stroke="#b86b4b" strokeWidth="2" fill="none" strokeDasharray="4 4" />
          </g>
        </svg>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#151821]/95 via-[#151821]/30 to-transparent" />
    </div>
  )
}
