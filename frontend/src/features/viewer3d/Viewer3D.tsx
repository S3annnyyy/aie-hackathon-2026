import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as THREE from 'three'

import type { EnvironmentData, LayoutSchema, Opening, Room, SolarSample } from '../../lib/api'

type Props = {
  glbUrl: string | null
  schema: LayoutSchema | null
  environment?: EnvironmentData | null
}

type ViewerErrorBoundaryProps = { children: ReactNode }
type ViewerErrorBoundaryState = { hasError: boolean }

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="muted" style={{ padding: '0.75rem' }}>
          3D model failed to load for this layout. Generate 3D to create a model artifact.
        </div>
      )
    }
    return this.props.children
  }
}

function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene} />
}

type RoomMeshProps = { room: Room; ppm: number; onClick: (room: Room) => void }

type SceneBounds = {
  center: THREE.Vector3
  width: number
  depth: number
  radius: number
}

type SunMoment = {
  time: string
  solar_azimuth: number
  solar_elevation: number
}

type WindowPortal = {
  id: string
  position: THREE.Vector3
  width: number
  inferred: boolean
}

function compassVector(deg: number): THREE.Vector3 {
  const rad = (deg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad)).normalize()
}

function formatLocalTime(value: string): string {
  const time = value.includes('T') ? value.split('T')[1] : value
  return time.slice(0, 5)
}

function minutesOfDay(value: string): number {
  const [hour = '0', minute = '0'] = formatLocalTime(value).split(':')
  return Number(hour) * 60 + Number(minute)
}

function nearestSolarSample(env: EnvironmentData): SolarSample | null {
  const samples = env.solar_samples ?? []
  if (!samples.length) return null
  const currentMinutes = minutesOfDay(env.timestamp)
  return samples.reduce((nearest, sample) => {
    const nearestDelta = Math.abs(minutesOfDay(nearest.time) - currentMinutes)
    const sampleDelta = Math.abs(minutesOfDay(sample.time) - currentMinutes)
    return sampleDelta < nearestDelta ? sample : nearest
  }, samples[0])
}

function interpolateSolarSample(samples: SolarSample[], index: number): SunMoment | null {
  if (!samples.length) return null
  const lowerIndex = Math.floor(index)
  const upperIndex = (lowerIndex + 1) % samples.length
  const t = index - lowerIndex
  const lower = samples[lowerIndex]
  const upper = samples[upperIndex]
  if (!upper || upper.time < lower.time) return lower

  return {
    time: t < 0.5 ? lower.time : upper.time,
    solar_azimuth: THREE.MathUtils.lerp(lower.solar_azimuth, upper.solar_azimuth, t),
    solar_elevation: THREE.MathUtils.lerp(lower.solar_elevation, upper.solar_elevation, t),
  }
}

function getSceneBounds(schema: LayoutSchema | null, ppm: number): SceneBounds {
  const points: Array<[number, number]> = []

  schema?.rooms.forEach((room) => {
    room.polygon.forEach((point) => {
      if (point.length >= 2) points.push([point[0] / ppm, -point[1] / ppm])
    })
  })

  schema?.walls.forEach((wall) => {
    if (wall.start.length >= 2) points.push([wall.start[0] / ppm, -wall.start[1] / ppm])
    if (wall.end.length >= 2) points.push([wall.end[0] / ppm, -wall.end[1] / ppm])
  })

  if (!points.length) {
    return { center: new THREE.Vector3(0, 0, 0), width: 6, depth: 6, radius: 4 }
  }

  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const width = Math.max(maxX - minX, 2)
  const depth = Math.max(maxZ - minZ, 2)
  const radius = Math.max(Math.hypot(width, depth) / 2 + 1.2, 3.5)

  return {
    center: new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
    width,
    depth,
    radius,
  }
}

function openingToPortal(opening: Opening, ppm: number): WindowPortal | null {
  if (opening.center.length < 2) return null
  return {
    id: opening.id,
    position: new THREE.Vector3(opening.center[0] / ppm, 1.15, -opening.center[1] / ppm),
    width: Math.max(opening.width_m || 1.1, 0.75),
    inferred: false,
  }
}

function inferSunEdgePortals(bounds: SceneBounds, sunFlat: THREE.Vector3): WindowPortal[] {
  const halfWidth = bounds.width / 2
  const halfDepth = bounds.depth / 2
  const tx = Math.abs(sunFlat.x) > 0.001 ? halfWidth / Math.abs(sunFlat.x) : Number.POSITIVE_INFINITY
  const tz = Math.abs(sunFlat.z) > 0.001 ? halfDepth / Math.abs(sunFlat.z) : Number.POSITIVE_INFINITY
  const edgeCenter = bounds.center.clone().add(sunFlat.clone().multiplyScalar(Math.min(tx, tz)))
  const across = new THREE.Vector3(-sunFlat.z, 0, sunFlat.x).normalize()
  const spread = Math.min(Math.max(bounds.width, bounds.depth) * 0.34, 2.2)

  return [-0.5, 0, 0.5].map((offset, index) => ({
    id: `inferred-window-${index}`,
    position: edgeCenter.clone().add(across.clone().multiplyScalar(offset * spread)).setY(1.15),
    width: 1.15,
    inferred: true,
  }))
}

function getSunFacingPortals(schema: LayoutSchema | null, ppm: number, bounds: SceneBounds, sunFlat: THREE.Vector3): WindowPortal[] {
  const portals = (schema?.windows ?? [])
    .map((opening) => openingToPortal(opening, ppm))
    .filter((portal): portal is WindowPortal => Boolean(portal))

  if (!portals.length) return inferSunEdgePortals(bounds, sunFlat)

  const facing = portals.filter((portal) => portal.position.clone().sub(bounds.center).dot(sunFlat) >= -0.15)
  return facing.length ? facing : portals
}

function SceneLabel({ position, children }: { position: [number, number, number]; children: ReactNode }) {
  return (
    <Html position={position} center distanceFactor={9} occlude>
      <div className="scene-factor-label">{children}</div>
    </Html>
  )
}

function EnvironmentSceneOverlay({
  env,
  schema,
  ppm,
  sunMoment,
}: {
  env: EnvironmentData
  schema: LayoutSchema | null
  ppm: number
  sunMoment: SunMoment
}) {
  const bounds = useMemo(() => getSceneBounds(schema, ppm), [schema, ppm])
  const windTo = useMemo(() => compassVector(env.wind_direction + 180), [env.wind_direction])
  const windAcross = useMemo(() => new THREE.Vector3(-windTo.z, 0, windTo.x).normalize(), [windTo])
  const windLength = bounds.radius * 1.75
  const windArrowLength = bounds.radius * 0.9
  const windStart = bounds.center.clone().sub(windTo.clone().multiplyScalar(windLength / 2))
  const windOffsets = [-0.36, 0, 0.36].map((factor) => factor * Math.max(bounds.width, bounds.depth, 3))

  const solarElevation = Math.max(sunMoment.solar_elevation, 3)
  const solarElevationRad = (solarElevation * Math.PI) / 180
  const sunFlat = compassVector(sunMoment.solar_azimuth)
  const sunVector = new THREE.Vector3(
    sunFlat.x * Math.cos(solarElevationRad),
    Math.sin(solarElevationRad),
    sunFlat.z * Math.cos(solarElevationRad),
  ).normalize()
  const sunOrigin = bounds.center.clone().add(sunVector.clone().multiplyScalar(bounds.radius * 1.35))
  const sunRayDirection = sunVector.clone().negate()
  const sunAcross = new THREE.Vector3(-sunRayDirection.z, 0, sunRayDirection.x).normalize()
  const sunPortals = useMemo(() => getSunFacingPortals(schema, ppm, bounds, sunFlat), [schema, ppm, bounds, sunFlat])
  const beamLength = bounds.radius * 1.35
  const beamOpacity = THREE.MathUtils.clamp(sunMoment.solar_elevation / 55, 0.14, 0.5)
  const patchLength = Math.max(1.2, Math.min(beamLength * Math.cos(solarElevationRad), bounds.radius * 1.25))
  const isNight = sunMoment.solar_elevation <= 0
  const sunTimeLabel = formatLocalTime(sunMoment.time)

  return (
    <group>
      <directionalLight
        position={[sunOrigin.x, sunOrigin.y + 2, sunOrigin.z]}
        intensity={isNight ? 0.15 : 1.25}
        color={isNight ? '#9ca3af' : '#ffd166'}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.center.x, 0.045, bounds.center.z]}>
        <ringGeometry args={[bounds.radius * 0.98, bounds.radius, 96]} />
        <meshBasicMaterial color="#0f766e" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>

      <SceneLabel position={[bounds.center.x, 0.2, bounds.center.z + bounds.radius]}>
        N
      </SceneLabel>

      {!isNight && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.center.x, 0.055, bounds.center.z]}>
          <circleGeometry args={[bounds.radius * 0.55, 48]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.1} side={THREE.DoubleSide} />
        </mesh>
      )}

      {!isNight && sunPortals.map((portal) => {
        const beamStart = portal.position.clone().add(sunRayDirection.clone().multiplyScalar(-0.25))
        const patchCenter = portal.position.clone().add(sunRayDirection.clone().multiplyScalar(patchLength * 0.5)).setY(0.075)
        const beamAngle = Math.atan2(sunRayDirection.x, sunRayDirection.z)
        return (
          <group key={portal.id}>
            <mesh position={[portal.position.x, portal.position.y, portal.position.z]} rotation={[0, beamAngle, 0]}>
              <boxGeometry args={[portal.width, 0.8, 0.06]} />
              <meshBasicMaterial color={portal.inferred ? '#fcd34d' : '#fde68a'} transparent opacity={0.52} />
            </mesh>
            <arrowHelper args={[sunRayDirection, beamStart, beamLength, '#f59e0b', 0.34, 0.22]} />
            <mesh
              position={[patchCenter.x, patchCenter.y, patchCenter.z]}
              rotation={[-Math.PI / 2, 0, -beamAngle]}
            >
              <planeGeometry args={[portal.width * 1.55, patchLength]} />
              <meshBasicMaterial color="#fbbf24" transparent opacity={beamOpacity} side={THREE.DoubleSide} />
            </mesh>
            <mesh
              position={[
                patchCenter.x + sunAcross.x * portal.width * 0.9,
                0.08,
                patchCenter.z + sunAcross.z * portal.width * 0.9,
              ]}
              rotation={[-Math.PI / 2, 0, -beamAngle]}
            >
              <planeGeometry args={[portal.width * 0.32, patchLength * 0.95]} />
              <meshBasicMaterial color="#1f2937" transparent opacity={0.16} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}
      <SceneLabel position={[sunOrigin.x, sunOrigin.y + 0.4, sunOrigin.z]}>
        <strong>{isNight ? 'No direct sun' : 'Shadow sim'}</strong>
        <span>{sunTimeLabel} · {sunMoment.solar_elevation.toFixed(0)} deg</span>
      </SceneLabel>

      {windOffsets.map((offset, index) => {
        const origin = windStart.clone().add(windAcross.clone().multiplyScalar(offset)).setY(0.7 + index * 0.12)
        return (
          <arrowHelper
            key={offset}
            args={[windTo, origin, windArrowLength, '#38bdf8', 0.35, 0.22]}
          />
        )
      })}

      <SceneLabel position={[
        bounds.center.x + windTo.x * bounds.radius * 0.75,
        1.15,
        bounds.center.z + windTo.z * bounds.radius * 0.75,
      ]}>
        <strong>Wind</strong>
        <span>{env.wind_speed.toFixed(1)} km/h from {windDirLabel(env.wind_direction)}</span>
      </SceneLabel>
    </group>
  )
}

function RoomMesh({ room, ppm, onClick }: RoomMeshProps) {
  const geometry = useMemo(() => {
    if (room.polygon.length < 3) return null
    const shape = new THREE.Shape()
    room.polygon.forEach((point, idx) => {
      const x = point[0] / ppm
      const y = point[1] / ppm
      if (idx === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    return new THREE.ShapeGeometry(shape)
  }, [room.polygon, ppm])

  if (!geometry) return null
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} onClick={() => onClick(room)}>
      <meshStandardMaterial color="#59a9a3" transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  )
}

const DIRS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
function windDirLabel(deg: number) { return DIRS_16[Math.round(deg / 22.5) % 16] }

function EnvironmentPanel({ env }: { env: EnvironmentData }) {
  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 42

  // Wind arrow points where wind blows TO (meteorological FROM + 180°)
  const windToRad = ((env.wind_direction + 180) * Math.PI) / 180
  const windEndX = cx + r * 0.72 * Math.sin(windToRad)
  const windEndY = cy - r * 0.72 * Math.cos(windToRad)

  // Sun marker on compass ring
  const sunRad = (env.solar_azimuth * Math.PI) / 180
  const sunX = cx + r * Math.sin(sunRad)
  const sunY = cy - r * Math.cos(sunRad)

  const isNight = env.solar_elevation <= 0

  return (
    <div className="card">
      <h3>Sun &amp; Wind</h3>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Compass */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          {/* Ring */}
          <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.04)" stroke="var(--border)" strokeWidth={1.5} />

          {/* Cardinal labels */}
          {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([lbl, angle]) => {
            const a = (Number(angle) * Math.PI) / 180
            return (
              <text key={lbl} x={cx + (r + 13) * Math.sin(a)} y={cy - (r + 13) * Math.cos(a)}
                textAnchor="middle" dominantBaseline="central" fontSize={10}
                fill={lbl === 'N' ? '#f87171' : 'var(--muted, #888)'}
                fontWeight={lbl === 'N' ? 700 : 400}>{lbl}</text>
            )
          })}

          {/* Sun marker */}
          <circle cx={sunX} cy={sunY} r={6} fill={isNight ? '#374151' : '#fbbf24'} />
          <text x={sunX} y={sunY} textAnchor="middle" dominantBaseline="central" fontSize={8}>
            {isNight ? '🌙' : '☀'}
          </text>

          {/* Wind arrow */}
          <line x1={cx} y1={cy} x2={windEndX} y2={windEndY} stroke="#60a5fa" strokeWidth={2.5} strokeLinecap="round" />
          {/* Arrowhead */}
          <polygon
            points={[
              `${windEndX},${windEndY}`,
              `${windEndX - 6 * Math.cos(windToRad) - 3.5 * Math.sin(windToRad)},${windEndY + 6 * Math.sin(windToRad) - 3.5 * Math.cos(windToRad)}`,
              `${windEndX - 6 * Math.cos(windToRad) + 3.5 * Math.sin(windToRad)},${windEndY + 6 * Math.sin(windToRad) + 3.5 * Math.cos(windToRad)}`,
            ].join(' ')}
            fill="#60a5fa"
          />

          {/* Center dot */}
          <circle cx={cx} cy={cy} r={3} fill="var(--muted, #888)" />
        </svg>

        {/* Stats */}
        <div style={{ lineHeight: 2, fontSize: 13 }}>
          <div>
            <span style={{ fontSize: 18 }}>💨</span>{' '}
            <strong>{env.wind_speed.toFixed(1)}</strong> km/h
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: -6 }}>
            From {windDirLabel(env.wind_direction)} ({env.wind_direction.toFixed(0)}°)
          </div>

          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 18 }}>{isNight ? '🌙' : '☀️'}</span>{' '}
            <strong>{env.solar_elevation.toFixed(0)}°</strong> elevation
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: -6 }}>
            Azimuth {env.solar_azimuth.toFixed(0)}° · {isNight ? 'Below horizon' : 'Above horizon'}
          </div>

          <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>
            {env.timestamp.replace('T', ' ')}
          </div>
          <div className="muted" style={{ fontSize: 10 }}>
            {env.lat.toFixed(4)}, {env.lon.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: 11 }} className="muted">
        <span><span style={{ color: '#60a5fa' }}>→</span> Wind direction</span>
        <span><span style={{ color: '#fbbf24' }}>●</span> Sun position (azimuth)</span>
        <span style={{ color: '#f87171' }}>N = top of floor plan</span>
      </div>
    </div>
  )
}

export function Viewer3D({ glbUrl, schema, environment }: Props) {
  const [selected, setSelected] = useState<Room | null>(null)
  const [selectedSunTime, setSelectedSunTime] = useState<string | null>(null)
  const [isSunPlaying, setIsSunPlaying] = useState(false)
  const [sunSampleIndex, setSunSampleIndex] = useState(0)
  const ppm = schema?.scale.pixels_per_meter ?? 100
  const daylightSamples = useMemo(
    () => (environment?.solar_samples ?? []).filter((sample) => sample.solar_elevation > 0),
    [environment],
  )
  const sunMoment = useMemo<SunMoment | null>(() => {
    if (!environment) return null
    if (isSunPlaying && daylightSamples.length) {
      return interpolateSolarSample(daylightSamples, sunSampleIndex)
    }
    const selectedSample = daylightSamples.find((sample) => sample.time === selectedSunTime)
    const nearestSample = nearestSolarSample(environment)
    return selectedSample ?? (nearestSample && nearestSample.solar_elevation > 0 ? nearestSample : null) ?? daylightSamples[0] ?? {
      time: environment.timestamp,
      solar_azimuth: environment.solar_azimuth,
      solar_elevation: environment.solar_elevation,
    }
  }, [daylightSamples, environment, isSunPlaying, selectedSunTime, sunSampleIndex])
  const activeSunTime = isSunPlaying && sunMoment ? sunMoment.time : selectedSunTime

  useEffect(() => {
    if (!environment) {
      setSelectedSunTime(null)
      setIsSunPlaying(false)
      return
    }
    const nearestSample = nearestSolarSample(environment)
    const initialSample = daylightSamples.find((sample) => sample.time === nearestSample?.time) ?? daylightSamples[0] ?? nearestSample
    setSelectedSunTime(initialSample?.time ?? environment.timestamp)
    setSunSampleIndex(Math.max(daylightSamples.findIndex((sample) => sample.time === initialSample?.time), 0))
  }, [daylightSamples, environment])

  useEffect(() => {
    if (!isSunPlaying || daylightSamples.length < 2) return
    const interval = window.setInterval(() => {
      setSunSampleIndex((current) => (current + 0.08) % daylightSamples.length)
    }, 80)
    return () => window.clearInterval(interval)
  }, [daylightSamples.length, isSunPlaying])

  return (
    <>
      <div className="card">
        <h3>3D Viewer</h3>
        <div className="viewer-wrap">
          <ViewerErrorBoundary key={glbUrl ?? 'no-glb'}>
            <Canvas camera={{ position: [6, 6, 6], fov: 48 }}>
              <ambientLight intensity={0.8} />
              <directionalLight position={[5, 8, 2]} intensity={0.9} />
              <gridHelper args={[20, 20, '#c4c7cb', '#e3e7ea']} />
              <Suspense fallback={null}>{glbUrl ? <GlbModel url={glbUrl} /> : null}</Suspense>
              {schema?.rooms.map((room) => (
                <RoomMesh key={room.id} room={room} ppm={ppm} onClick={setSelected} />
              ))}
              {environment && sunMoment ? (
                <EnvironmentSceneOverlay env={environment} schema={schema} ppm={ppm} sunMoment={sunMoment} />
              ) : null}
              <OrbitControls makeDefault />
            </Canvas>
          </ViewerErrorBoundary>
        </div>
        {environment && daylightSamples.length > 0 ? (
          <div className="sun-time-control">
            <div>
              <strong>Shadow simulator</strong>
              <span className="muted">
                Animating sunlight through {schema?.windows?.length ? 'detected windows' : 'estimated window edge'} at {sunMoment ? formatLocalTime(sunMoment.time) : '--:--'}
              </span>
            </div>
            <div className="sun-sim-toolbar">
              <button
                type="button"
                onClick={() => setIsSunPlaying((playing) => !playing)}
                disabled={daylightSamples.length < 2}
              >
                {isSunPlaying ? 'Pause' : 'Play day'}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(daylightSamples.length - 1, 0)}
                step={0.01}
                value={sunSampleIndex}
                onChange={(event) => {
                  const nextIndex = Number(event.currentTarget.value)
                  const nextSample = daylightSamples[Math.round(nextIndex)]
                  setIsSunPlaying(false)
                  setSunSampleIndex(nextIndex)
                  setSelectedSunTime(nextSample?.time ?? null)
                }}
                aria-label="Scrub sunlight timing"
              />
            </div>
            <div className="sun-time-buttons">
              {daylightSamples.map((sample, index) => (
                <button
                  key={sample.time}
                  type="button"
                  className={sample.time === activeSunTime ? 'active' : ''}
                  onClick={() => {
                    setIsSunPlaying(false)
                    setSunSampleIndex(index)
                    setSelectedSunTime(sample.time)
                  }}
                  title={`${sample.solar_elevation.toFixed(0)} deg elevation, ${sample.solar_azimuth.toFixed(0)} deg azimuth`}
                >
                  {formatLocalTime(sample.time)}
                </button>
              ))}
            </div>
          </div>
        ) : environment ? (
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            No direct sunlight sample is above the horizon for the selected time range.
          </p>
        ) : null}
        {selected ? (
          <div style={{ marginTop: '0.75rem' }}>
            <strong>{selected.name}</strong>
            <div className="muted">Type: {selected.type}</div>
            <div className="muted">Area: {selected.estimated_area_sqm ?? 'Estimated'}</div>
            <div className="muted">Source page: {selected.source_page ?? schema?.source_page ?? 'N/A'}</div>
            <div className="muted">Notes: {selected.notes ?? schema?.notes ?? 'N/A'}</div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '0.75rem' }}>Click a room overlay to inspect metadata.</p>
        )}
      </div>

      {environment && <EnvironmentPanel env={environment} />}
    </>
  )
}
