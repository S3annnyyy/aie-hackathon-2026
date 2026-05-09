import { Loader } from '@googlemaps/js-api-loader'
import { useEffect, useRef, useState } from 'react'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const MAP_ID = import.meta.env.VITE_GOOGLE_3D_MAP_ID as string | undefined
const FLOOR_HEIGHT_METERS = 3.2

const HEADING_BY_FACING: Record<string, number> = {
  North: 180,
  'North-East': 225,
  East: 270,
  'South-East': 315,
  South: 0,
  'South-West': 45,
  West: 90,
  'North-West': 135,
}

type Map3DViewProps = {
  lat: number
  lng: number
  stackLabel: string
  facing: string
}

export function Map3DView({ lat, lng, stackLabel, facing }: Map3DViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Mount the map element once.
  useEffect(() => {
    if (!API_KEY) {
      setError('VITE_GOOGLE_MAPS_API_KEY is not set.')
      return
    }
    if (!hostRef.current) return

    let disposed = false
    const loader = new Loader({ apiKey: API_KEY, version: 'alpha', libraries: ['maps3d'] })
    loader
      .importLibrary('maps3d')
      .then((maps3d) => {
        if (disposed || !hostRef.current) return

        const Map3DElement = (maps3d as { Map3DElement?: new () => HTMLElement }).Map3DElement
        if (!Map3DElement) {
          setError('Google Maps 3D element is unavailable in this build.')
          return
        }

        const element = new Map3DElement()
        element.setAttribute('mode', 'HYBRID')
        if (MAP_ID) element.setAttribute('map-id', MAP_ID)
        element.style.display = 'block'
        element.style.width = '100%'
        element.style.height = '100%'
        hostRef.current.replaceChildren(element)
        elementRef.current = element
        setReady(true)
      })
      .catch((err: unknown) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : 'Unable to load Google 3D Maps.')
      })

    return () => {
      disposed = true
      elementRef.current = null
    }
  }, [])

  // Drive the camera based on prop changes (unit/stack/facing).
  useEffect(() => {
    const element = elementRef.current as unknown as
      | {
          center?: { lat: number; lng: number; altitude?: number }
          heading?: number
          tilt?: number
          range?: number
        }
      | null
    if (!element || !ready) return

    const midLevel = parseStackMid(stackLabel) ?? 20
    const altitude = midLevel * FLOOR_HEIGHT_METERS
    const heading = HEADING_BY_FACING[facing] ?? 0

    element.center = { lat, lng, altitude }
    element.heading = heading
    element.tilt = 72
    element.range = 180
  }, [lat, lng, stackLabel, facing, ready])

  if (error) {
    return <MapFallback reason={error} lat={lat} lng={lng} />
  }

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl border border-line bg-warm">
      <div ref={hostRef} className="h-full w-full" aria-label="Google 3D Maps view of the block" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          Loading Google 3D Maps…
        </div>
      ) : null}
    </div>
  )
}

type MapFallbackProps = {
  reason: string
  lat: number
  lng: number
}

function MapFallback({ reason, lat, lng }: MapFallbackProps) {
  return (
    <div className="flex h-full min-h-[420px] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-warm p-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-terracotta">
        3D map unavailable
      </p>
      <p className="max-w-sm text-sm text-muted">
        {reason} Set <code className="rounded bg-cream px-1 py-0.5 text-xs">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
        and an optional <code className="rounded bg-cream px-1 py-0.5 text-xs">VITE_GOOGLE_3D_MAP_ID</code>{' '}
        in <code className="rounded bg-cream px-1 py-0.5 text-xs">frontend/.env.local</code> to
        enable the photorealistic 3D view.
      </p>
      <p className="text-xs text-subtle">
        Target: {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
    </div>
  )
}

function parseStackMid(label: string): number | null {
  const match = label.match(/(\d+)\s*to\s*(\d+)/i)
  if (!match) return null
  const from = Number(match[1])
  const to = Number(match[2])
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((from + to) / 2)
}
