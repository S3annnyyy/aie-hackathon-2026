import { Loader } from '@googlemaps/js-api-loader'
import { useEffect, useRef, useState } from 'react'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const MAP_ID = import.meta.env.VITE_GOOGLE_3D_MAP_ID as string | undefined
const FLOOR_HEIGHT_METERS = 3.2
const GROUND_CLEARANCE_METERS = 1.5 // pilotis / void deck allowance

/**
 * Heading is the compass bearing the camera *looks along*. If a unit "faces
 * North", the resident looks north out of their window — so the Google 3D
 * camera should point north as well (heading = 0°).
 *
 * Google Maps 3D alpha interprets heading as 0° = North, 90° = East.
 */
const HEADING_BY_FACING: Record<string, number> = {
  North: 0,
  'North-East': 45,
  East: 90,
  'South-East': 135,
  South: 180,
  'South-West': 225,
  West: 270,
  'North-West': 315,
}

export type MapCameraMode = 'birdseye' | 'unit'

type Map3DViewProps = {
  lat: number
  lng: number
  stackLabel: string
  facing: string
  /**
   * `birdseye` — high orbit over the block, used on the initial landing
   * stage so the viewer sees the whole precinct. `unit` — camera hovers at
   * the picked stack midpoint and looks along the facing.
   */
  mode?: MapCameraMode
  /**
   * Optional nudge (meters, compass bearing) applied to the camera in unit
   * mode. Used to anchor the view slightly toward a known feature — e.g.
   * the block's courtyard playground — instead of the bare block centroid.
   */
  unitCameraBias?: { headingDeg: number; distanceMeters: number }
}

export function Map3DView({
  lat,
  lng,
  stackLabel,
  facing,
  mode = 'unit',
  unitCameraBias,
}: Map3DViewProps) {
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
    type MapElement = {
      center?: { lat: number; lng: number; altitude?: number }
      heading?: number
      tilt?: number
      range?: number
      cameraPosition?: { lat: number; lng: number; altitude?: number }
    }
    const element = elementRef.current as unknown as MapElement | null
    if (!element || !ready) return

    if (mode === 'birdseye') {
      // Wide, elevated orbit — show the precinct, not the window.
      element.center = { lat, lng, altitude: 0 }
      element.heading = 28 // slight off-axis so the block reads as a 3D mass
      element.tilt = 55
      element.range = 650
      if ('cameraPosition' in element) {
        try {
          // Clearing any previous explicit camera position so `range` + tilt
          // take over; alpha element sometimes latches onto a stale value.
          element.cameraPosition = undefined
        } catch {
          /* ignore */
        }
      }
      return
    }

    const midLevel = parseStackMid(stackLabel) ?? 20
    const headingDeg = HEADING_BY_FACING[facing] ?? 0

    // Eye altitude in meters above ellipsoid. Google 3D maps uses
    // AltitudeMode.ABSOLUTE by default, which is close enough to "metres
    // above sea level" that ~floor offset sits the camera correctly above
    // the block footprint at this latitude.
    const unitAltitude = GROUND_CLEARANCE_METERS + midLevel * FLOOR_HEIGHT_METERS

    // Optional bias — nudge the camera toward a known landmark (e.g.
    // playground on the courtyard side) so the framing feels grounded
    // instead of floating above the bare block centroid.
    const biased = unitCameraBias
      ? offsetLatLng(lat, lng, unitCameraBias.headingDeg, unitCameraBias.distanceMeters)
      : { lat, lng }

    // Look-at sits ~220m ahead of the biased position along the facing,
    // so the camera parallels the ground from the window outward.
    const LOOK_AHEAD_METERS = 220
    const target = offsetLatLng(biased.lat, biased.lng, headingDeg, LOOK_AHEAD_METERS)

    element.center = { lat: target.lat, lng: target.lng, altitude: unitAltitude }
    element.heading = headingDeg
    element.tilt = 85
    element.range = 180

    if ('cameraPosition' in element) {
      try {
        element.cameraPosition = { lat: biased.lat, lng: biased.lng, altitude: unitAltitude }
      } catch {
        /* alpha element may ignore — center/range fallback covers it */
      }
    }
  }, [lat, lng, stackLabel, facing, ready, mode, unitCameraBias])

  if (error) {
    return <MapFallback reason={error} lat={lat} lng={lng} />
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-warm">
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-warm p-6 text-center">
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

/**
 * Move a lat/lng by `distanceMeters` along a compass `headingDeg` (0 = N).
 * Flat-earth approximation — accurate to a few centimetres at Singapore
 * latitudes for distances under a kilometre.
 */
function offsetLatLng(
  lat: number,
  lng: number,
  headingDeg: number,
  distanceMeters: number,
): { lat: number; lng: number } {
  const metersPerDegLat = 111_320
  const metersPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180)
  const headingRad = (headingDeg * Math.PI) / 180
  const north = Math.cos(headingRad) * distanceMeters
  const east = Math.sin(headingRad) * distanceMeters
  return {
    lat: lat + north / metersPerDegLat,
    lng: lng + east / metersPerDegLng,
  }
}
