import { ContactShadows, Environment, Html, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import * as THREE from 'three'

import type { EnvironmentData, LayoutSchema, Opening, Room, SolarSample, Wall } from '../../lib/api'

type Props = {
  glbUrl: string | null
  schema: LayoutSchema | null
  environment?: EnvironmentData | null
}

type ViewerMode = 'overview' | 'transitioning' | 'walkthrough'

type WorldPoint = {
  x: number
  z: number
}

type Bounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  centerX: number
  centerZ: number
  width: number
  depth: number
}

type WallSegment = {
  id: string
  start: WorldPoint
  end: WorldPoint
  radius: number
}

type DoorOpening = {
  id: string
  wall_id?: string | null
  center: number[]
  width_m?: number | null
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

type TransitionState = {
  roomId: string
  fromPosition: THREE.Vector3
  fromLookAt: THREE.Vector3
  toPosition: THREE.Vector3
  toLookAt: THREE.Vector3
  startTime: number
  duration: number
}

type ViewerErrorBoundaryProps = {
  children: ReactNode
  onError: (message: string) => void
}

type ViewerErrorBoundaryState = {
  hasError: boolean
}

const EYE_HEIGHT = 1.62
const WALK_SPEED = 2.2
const SPRINT_MULTIPLIER = 1.65
const LOOK_SENSITIVITY = 0.0022
const CAMERA_CLEARANCE = 0.16
const TRANSITION_SECONDS = 0.9

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error))
  }

  render() {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}

function toWorldPoint(point: number[], ppm: number): WorldPoint {
  return {
    x: (point[0] ?? 0) / ppm,
    z: (point[1] ?? 0) / ppm,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const DIRS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function windDirLabel(deg: number) {
  return DIRS_16[Math.round(deg / 22.5) % 16]
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

function openingToPortal(opening: Opening, ppm: number): WindowPortal | null {
  if (opening.center.length < 2) return null
  const center = toWorldPoint(opening.center, ppm)
  return {
    id: opening.id,
    position: new THREE.Vector3(center.x, 1.15, center.z),
    width: Math.max(opening.width_m || 1.1, 0.75),
    inferred: false,
  }
}

function inferSunEdgePortals(bounds: Bounds, sunFlat: THREE.Vector3): WindowPortal[] {
  const halfWidth = bounds.width / 2
  const halfDepth = bounds.depth / 2
  const tx = Math.abs(sunFlat.x) > 0.001 ? halfWidth / Math.abs(sunFlat.x) : Number.POSITIVE_INFINITY
  const tz = Math.abs(sunFlat.z) > 0.001 ? halfDepth / Math.abs(sunFlat.z) : Number.POSITIVE_INFINITY
  const center = new THREE.Vector3(bounds.centerX, 0, bounds.centerZ)
  const edgeCenter = center.clone().add(sunFlat.clone().multiplyScalar(Math.min(tx, tz)))
  const across = new THREE.Vector3(-sunFlat.z, 0, sunFlat.x).normalize()
  const spread = Math.min(Math.max(bounds.width, bounds.depth) * 0.34, 2.2)

  return [-0.5, 0, 0.5].map((offset, index) => ({
    id: `inferred-window-${index}`,
    position: edgeCenter.clone().add(across.clone().multiplyScalar(offset * spread)).setY(1.15),
    width: 1.15,
    inferred: true,
  }))
}

function getSunFacingPortals(schema: LayoutSchema | null, ppm: number, bounds: Bounds, sunFlat: THREE.Vector3): WindowPortal[] {
  const center = new THREE.Vector3(bounds.centerX, 0, bounds.centerZ)
  const portals = (schema?.windows ?? [])
    .map((opening) => openingToPortal(opening, ppm))
    .filter((portal): portal is WindowPortal => Boolean(portal))

  if (!portals.length) return inferSunEdgePortals(bounds, sunFlat)

  const facing = portals.filter((portal) => portal.position.clone().sub(center).dot(sunFlat) >= -0.15)
  return facing.length ? facing : portals
}

function distancePointToSegmentSquared(point: WorldPoint, start: WorldPoint, end: WorldPoint): number {
  const vx = end.x - start.x
  const vz = end.z - start.z
  const wx = point.x - start.x
  const wz = point.z - start.z
  const lenSq = vx * vx + vz * vz
  if (lenSq <= 1e-6) {
    return wx * wx + wz * wz
  }

  const t = clamp((wx * vx + wz * vz) / lenSq, 0, 1)
  const projX = start.x + vx * t
  const projZ = start.z + vz * t
  const dx = point.x - projX
  const dz = point.z - projZ
  return dx * dx + dz * dz
}

function averagePoint(points: number[][], ppm: number): WorldPoint {
  if (!points.length) {
    return { x: 0, z: 0 }
  }
  const total = points.reduce(
    (acc, point) => {
      const world = toWorldPoint(point, ppm)
      acc.x += world.x
      acc.z += world.z
      return acc
    },
    { x: 0, z: 0 },
  )
  return {
    x: total.x / points.length,
    z: total.z / points.length,
  }
}

function polygonCentroid(points: number[][], ppm: number): WorldPoint {
  if (points.length < 3) {
    return averagePoint(points, ppm)
  }

  let twiceArea = 0
  let centroidX = 0
  let centroidZ = 0

  for (let i = 0; i < points.length; i += 1) {
    const current = toWorldPoint(points[i], ppm)
    const next = toWorldPoint(points[(i + 1) % points.length], ppm)
    const cross = current.x * next.z - next.x * current.z
    twiceArea += cross
    centroidX += (current.x + next.x) * cross
    centroidZ += (current.z + next.z) * cross
  }

  if (Math.abs(twiceArea) <= 1e-6) {
    return averagePoint(points, ppm)
  }

  const factor = 1 / (3 * twiceArea)
  return {
    x: centroidX * factor,
    z: centroidZ * factor,
  }
}

function computeBounds(schema: LayoutSchema | null, ppm: number): Bounds {
  const points: WorldPoint[] = []

  for (const room of schema?.rooms ?? []) {
    for (const point of room.polygon) {
      points.push(toWorldPoint(point, ppm))
    }
  }

  for (const wall of schema?.walls ?? []) {
    points.push(toWorldPoint(wall.start, ppm))
    points.push(toWorldPoint(wall.end, ppm))
  }

  if (points.length === 0) {
    return {
      minX: -3,
      maxX: 3,
      minZ: -3,
      maxZ: 3,
      centerX: 0,
      centerZ: 0,
      width: 6,
      depth: 6,
    }
  }

  const minX = Math.min(...points.map((p) => p.x))
  const maxX = Math.max(...points.map((p) => p.x))
  const minZ = Math.min(...points.map((p) => p.z))
  const maxZ = Math.max(...points.map((p) => p.z))
  const padding = Math.max(Math.max(maxX - minX, maxZ - minZ) * 0.08, 0.8)

  const paddedMinX = minX - padding
  const paddedMaxX = maxX + padding
  const paddedMinZ = minZ - padding
  const paddedMaxZ = maxZ + padding

  return {
    minX: paddedMinX,
    maxX: paddedMaxX,
    minZ: paddedMinZ,
    maxZ: paddedMaxZ,
    centerX: (paddedMinX + paddedMaxX) / 2,
    centerZ: (paddedMinZ + paddedMaxZ) / 2,
    width: paddedMaxX - paddedMinX,
    depth: paddedMaxZ - paddedMinZ,
  }
}

function buildWallSegments(schema: LayoutSchema | null, ppm: number): WallSegment[] {
  const openingsByWall = new Map<string, Array<{ center: WorldPoint; width: number }>>()
  const orphanOpenings: Array<{ id: string; center: WorldPoint; width: number }> = []

  for (const opening of (schema?.doors ?? []) as DoorOpening[]) {
    if (!opening?.id || opening.center.length < 2) continue
    const center = toWorldPoint(opening.center, ppm)
    const width = Math.max(opening.width_m ?? 0.9, 0.18)
    if (opening.wall_id) {
      const wallId = String(opening.wall_id)
      const list = openingsByWall.get(wallId) ?? []
      list.push({ center, width })
      openingsByWall.set(wallId, list)
    } else {
      orphanOpenings.push({ id: opening.id, center, width })
    }
  }

  const isHorizontal = (start: WorldPoint, end: WorldPoint) => Math.abs(start.z - end.z) <= Math.abs(start.x - end.x)
  const consumedOrphans = new Set<string>()

  const subtractOpenings = (
    wall: WallSegment,
    wallOpenings: Array<{ center: WorldPoint; width: number }>,
  ): WallSegment[] => {
    const horizontal = isHorizontal(wall.start, wall.end)
    const wallCoord = horizontal ? (wall.start.z + wall.end.z) / 2 : (wall.start.x + wall.end.x) / 2
    const spanStart = horizontal ? Math.min(wall.start.x, wall.end.x) : Math.min(wall.start.z, wall.end.z)
    const spanEnd = horizontal ? Math.max(wall.start.x, wall.end.x) : Math.max(wall.start.z, wall.end.z)
    let spans: Array<[number, number]> = [[spanStart, spanEnd]]

    for (const opening of wallOpenings) {
      const openingCoord = horizontal ? opening.center.z : opening.center.x
      const openingAxis = horizontal ? opening.center.x : opening.center.z
      if (Math.abs(openingCoord - wallCoord) > 0.35) continue

      const half = opening.width / 2
      const gapPad = 0.08
      const gapStart = openingAxis - half - gapPad
      const gapEnd = openingAxis + half + gapPad

      const next: Array<[number, number]> = []
      for (const [start, end] of spans) {
        if (gapEnd <= start || gapStart >= end) {
          next.push([start, end])
          continue
        }
        if (gapStart > start + 0.16) {
          next.push([start, Math.min(gapStart, end)])
        }
        if (gapEnd < end - 0.16) {
          next.push([Math.max(gapEnd, start), end])
        }
      }
      spans = next
    }

    return spans
      .filter(([start, end]) => end - start >= 0.18)
      .map(([start, end], idx) =>
        horizontal
          ? {
              id: `${wall.id}_segment_${idx}`,
              start: { x: start, z: wallCoord },
              end: { x: end, z: wallCoord },
              radius: wall.radius,
            }
          : {
              id: `${wall.id}_segment_${idx}`,
              start: { x: wallCoord, z: start },
              end: { x: wallCoord, z: end },
              radius: wall.radius,
            },
      )
  }

  const fallbackOpeningsForWall = (wall: Wall, start: WorldPoint, end: WorldPoint) => {
    const horizontal = isHorizontal(start, end)
    const wallCoord = horizontal ? (start.z + end.z) / 2 : (start.x + end.x) / 2
    const spanStart = horizontal ? Math.min(start.x, end.x) : Math.min(start.z, end.z)
    const spanEnd = horizontal ? Math.max(start.x, end.x) : Math.max(start.z, end.z)

    const candidates = orphanOpenings
      .filter((opening) => !consumedOrphans.has(opening.id))
      .map((opening) => {
        const openingCoord = horizontal ? opening.center.z : opening.center.x
        const openingAxis = horizontal ? opening.center.x : opening.center.z
        const distanceToWall = Math.abs(openingCoord - wallCoord)
        const outsideSpan = openingAxis < spanStart - 0.4 || openingAxis > spanEnd + 0.4
        return {
          opening,
          distanceToWall,
          outsideSpan,
        }
      })
      .filter(({ distanceToWall, outsideSpan }) => distanceToWall <= 0.35 && !outsideSpan)
      .sort((a, b) => a.distanceToWall - b.distanceToWall)

    const selected = candidates.slice(0, 2)
    selected.forEach(({ opening }) => consumedOrphans.add(opening.id))
    return selected.map(({ opening }) => ({ center: opening.center, width: opening.width }))
  }

  return (schema?.walls ?? []).flatMap((wall: Wall) => {
    const start = toWorldPoint(wall.start, ppm)
    const end = toWorldPoint(wall.end, ppm)
    if ((end.x - start.x) ** 2 + (end.z - start.z) ** 2 <= 1e-6) {
      return []
    }

    const base: WallSegment = {
      id: wall.id,
      start,
      end,
      radius: Math.max(wall.thickness_m / 2 + CAMERA_CLEARANCE, 0.14),
    }

    const wallOpenings = [
      ...(openingsByWall.get(wall.id) ?? []),
      ...fallbackOpeningsForWall(wall, start, end),
    ]

    return wallOpenings.length ? subtractOpenings(base, wallOpenings) : [base]
  })
}

function createFloorTexture() {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#c7b19a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  base.addColorStop(0, '#d1bca6')
  base.addColorStop(0.5, '#bea993')
  base.addColorStop(1, '#b29c86')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < canvas.height; y += 96) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(0, y + 12)
    ctx.lineTo(canvas.width, y + 12)
    ctx.stroke()
  }

  for (let x = 0; x < canvas.width; x += 64) {
    ctx.strokeStyle = 'rgba(94, 69, 52, 0.045)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 9
    data[i] = clamp(data[i] + noise, 0, 255)
    data[i + 1] = clamp(data[i + 1] + noise * 0.8, 0, 255)
    data[i + 2] = clamp(data[i + 2] + noise * 0.6, 0, 255)
  }
  ctx.putImageData(image, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

function FloorPlane({ bounds }: { bounds: Bounds }) {
  const texture = useMemo(() => createFloorTexture(), [])
  const size = Math.max(bounds.width, bounds.depth) + 14

  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )

  if (!texture) return null

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[bounds.centerX, 0, bounds.centerZ]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={texture} color="#c7b19a" roughness={0.96} metalness={0.02} />
    </mesh>
  )
}

function chooseOverviewPosition(bounds: Bounds): THREE.Vector3 {
  const span = Math.max(bounds.width, bounds.depth)
  return new THREE.Vector3(bounds.centerX + span * 0.95, Math.max(4.5, span * 0.9), bounds.centerZ + span * 0.95)
}

function chooseRoomEntry(room: Room, ppm: number, overviewPosition: THREE.Vector3, bounds: Bounds): THREE.Vector3 {
  const centroid = room.polygon.length >= 3 ? polygonCentroid(room.polygon, ppm) : averagePoint(room.polygon, ppm)
  const fromOverview = new THREE.Vector3(
    overviewPosition.x - centroid.x,
    0,
    overviewPosition.z - centroid.z,
  )

  if (fromOverview.lengthSq() <= 1e-6) {
    fromOverview.set(1, 0, 0)
  }

  fromOverview.normalize()

  const entry = new THREE.Vector3(
    centroid.x - fromOverview.x * 1.35,
    EYE_HEIGHT,
    centroid.z - fromOverview.z * 1.35,
  )

  const margin = 0.45
  entry.x = clamp(entry.x, bounds.minX + margin, bounds.maxX - margin)
  entry.z = clamp(entry.z, bounds.minZ + margin, bounds.maxZ - margin)
  return entry
}

function roomHeading(from: THREE.Vector3, to: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(to, from)
  if (dir.lengthSq() <= 1e-6) {
    dir.set(0, 0, -1)
  }
  dir.normalize()
  const yaw = Math.atan2(dir.x, -dir.z)
  const pitch = Math.asin(clamp(dir.y, -1, 1))
  return { yaw, pitch }
}

function isBlocked(point: WorldPoint, walls: WallSegment[]) {
  return walls.some((wall) => distancePointToSegmentSquared(point, wall.start, wall.end) < wall.radius * wall.radius)
}

function resolveMovement(
  current: THREE.Vector3,
  candidate: THREE.Vector3,
  walls: WallSegment[],
  bounds: Bounds,
) {
  const margin = CAMERA_CLEARANCE
  const clamped = new THREE.Vector3(
    clamp(candidate.x, bounds.minX + margin, bounds.maxX - margin),
    EYE_HEIGHT,
    clamp(candidate.z, bounds.minZ + margin, bounds.maxZ - margin),
  )

  if (!isBlocked({ x: clamped.x, z: clamped.z }, walls)) {
    return clamped
  }

  const xOnly = new THREE.Vector3(clamped.x, EYE_HEIGHT, current.z)
  if (!isBlocked({ x: xOnly.x, z: xOnly.z }, walls)) {
    return xOnly
  }

  const zOnly = new THREE.Vector3(current.x, EYE_HEIGHT, clamped.z)
  if (!isBlocked({ x: zOnly.x, z: zOnly.z }, walls)) {
    return zOnly
  }

  return current.clone()
}

function AlignedGlbModel({ url, anchor }: { url: string; anchor: THREE.Vector3 }) {
  const { scene } = useGLTF(url)
  const [offset, setOffset] = useState(() => new THREE.Vector3())

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    if (box.isEmpty()) {
      setOffset(new THREE.Vector3())
      return
    }
    const center = box.getCenter(new THREE.Vector3())
    setOffset(new THREE.Vector3(anchor.x - center.x, 0, anchor.z - center.z))
  }, [anchor.x, anchor.z, scene, url])

  return (
    <group position={offset}>
      <primitive object={scene} />
    </group>
  )
}

type RoomMarkerProps = {
  room: Room
  position: THREE.Vector3
  active: boolean
  hovered: boolean
  onHoverChange: (roomId: string | null) => void
  onSelect: (room: Room) => void
}

function RoomMarker({ room, position, active, hovered, onHoverChange, onSelect }: RoomMarkerProps) {
  const markerRef = useRef<THREE.Mesh>(null)
  const labelScale = active ? 1.15 : hovered ? 1.08 : 1
  const displayName = room.name?.trim() || room.id
  const labelStyle: CSSProperties = {
    ['--room-marker-scale' as string]: labelScale,
  }

  useFrame((state) => {
    if (!markerRef.current) return
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.4) * 0.08
    markerRef.current.scale.setScalar(active ? pulse * 1.15 : pulse)
    const material = markerRef.current.material as THREE.MeshStandardMaterial | undefined
    if (material) {
      material.opacity = hovered || active ? 0.84 : 0.58
    }
  })

  return (
    <group position={[position.x, 0.045, position.z]}>
      <mesh
        ref={markerRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHoverChange(room.id)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          onHoverChange(null)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(room)
        }}
      >
        <circleGeometry args={[0.28, 36]} />
        <meshStandardMaterial color="#9ca1a8" transparent opacity={0.8} emissive="#80858d" emissiveIntensity={0.35} roughness={0.45} metalness={0.05} />
      </mesh>
      <Html center distanceFactor={9} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div
          className="room-marker-label is-visible"
          style={labelStyle}
        >
          {displayName}
        </div>
      </Html>
    </group>
  )
}

function SceneModel({
  glbUrl,
  anchor,
  onLoadError,
}: {
  glbUrl: string | null
  anchor: THREE.Vector3
  onLoadError: (message: string) => void
}) {
  if (!glbUrl) return null
  return (
    <ViewerErrorBoundary
      key={glbUrl}
      onError={(message) => {
        onLoadError(message)
      }}
    >
      <Suspense fallback={null}>
        <AlignedGlbModel url={glbUrl} anchor={anchor} />
      </Suspense>
    </ViewerErrorBoundary>
  )
}

function EnvironmentSceneOverlay({
  env,
  schema,
  ppm,
  bounds,
  sunMoment,
}: {
  env: EnvironmentData
  schema: LayoutSchema | null
  ppm: number
  bounds: Bounds
  sunMoment: SunMoment
}) {
  const center = useMemo(() => new THREE.Vector3(bounds.centerX, 0, bounds.centerZ), [bounds.centerX, bounds.centerZ])
  const radius = Math.max(Math.hypot(bounds.width, bounds.depth) / 2 + 1.2, 3.5)
  const windTo = useMemo(() => compassVector(env.wind_direction + 180), [env.wind_direction])
  const windAcross = useMemo(() => new THREE.Vector3(-windTo.z, 0, windTo.x).normalize(), [windTo])
  const windStart = center.clone().sub(windTo.clone().multiplyScalar(radius * 0.9))
  const windOffsets = [-0.36, 0, 0.36].map((factor) => factor * Math.max(bounds.width, bounds.depth, 3))

  const solarElevation = Math.max(sunMoment.solar_elevation, 3)
  const solarElevationRad = (solarElevation * Math.PI) / 180
  const sunFlat = compassVector(sunMoment.solar_azimuth)
  const sunVector = new THREE.Vector3(
    sunFlat.x * Math.cos(solarElevationRad),
    Math.sin(solarElevationRad),
    sunFlat.z * Math.cos(solarElevationRad),
  ).normalize()
  const sunOrigin = center.clone().add(sunVector.clone().multiplyScalar(radius * 1.35))
  const sunRayDirection = sunVector.clone().negate()
  const sunAcross = new THREE.Vector3(-sunRayDirection.z, 0, sunRayDirection.x).normalize()
  const sunPortals = useMemo(() => getSunFacingPortals(schema, ppm, bounds, sunFlat), [schema, ppm, bounds, sunFlat])
  const beamLength = radius * 1.35
  const beamOpacity = THREE.MathUtils.clamp(sunMoment.solar_elevation / 55, 0.14, 0.5)
  const patchLength = Math.max(1.2, Math.min(beamLength * Math.cos(solarElevationRad), radius * 1.25))
  const isNight = sunMoment.solar_elevation <= 0
  const sunTimeLabel = formatLocalTime(sunMoment.time)

  return (
    <group>
      <directionalLight
        position={[sunOrigin.x, sunOrigin.y + 2, sunOrigin.z]}
        intensity={isNight ? 0.12 : 1.35}
        color={isNight ? '#9ca3af' : '#ffd166'}
        castShadow={!isNight}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0.05, center.z]}>
        <ringGeometry args={[radius * 0.98, radius, 96]} />
        <meshBasicMaterial color="#7ad6cc" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[center.x, 0.24, center.z + radius]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="scene-factor-label">N</div>
      </Html>

      {!isNight && sunPortals.map((portal) => {
        const beamStart = portal.position.clone().add(sunRayDirection.clone().multiplyScalar(-0.25))
        const patchCenter = portal.position.clone().add(sunRayDirection.clone().multiplyScalar(patchLength * 0.5)).setY(0.08)
        const beamAngle = Math.atan2(sunRayDirection.x, sunRayDirection.z)
        return (
          <group key={portal.id}>
            <mesh position={[portal.position.x, portal.position.y, portal.position.z]} rotation={[0, beamAngle, 0]}>
              <boxGeometry args={[portal.width, 0.8, 0.06]} />
              <meshBasicMaterial color={portal.inferred ? '#fcd34d' : '#fde68a'} transparent opacity={0.52} />
            </mesh>
            <arrowHelper args={[sunRayDirection, beamStart, beamLength, '#f59e0b', 0.34, 0.22]} />
            <mesh position={[patchCenter.x, patchCenter.y, patchCenter.z]} rotation={[-Math.PI / 2, 0, -beamAngle]}>
              <planeGeometry args={[portal.width * 1.55, patchLength]} />
              <meshBasicMaterial color="#fbbf24" transparent opacity={beamOpacity} side={THREE.DoubleSide} />
            </mesh>
            <mesh
              position={[
                patchCenter.x + sunAcross.x * portal.width * 0.9,
                0.09,
                patchCenter.z + sunAcross.z * portal.width * 0.9,
              ]}
              rotation={[-Math.PI / 2, 0, -beamAngle]}
            >
              <planeGeometry args={[portal.width * 0.32, patchLength * 0.95]} />
              <meshBasicMaterial color="#111827" transparent opacity={0.18} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}

      <Html position={[sunOrigin.x, sunOrigin.y + 0.4, sunOrigin.z]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="scene-factor-label">
          <strong>{isNight ? 'No direct sun' : 'Shadow sim'}</strong>
          <span>{sunTimeLabel} · {sunMoment.solar_elevation.toFixed(0)} deg</span>
        </div>
      </Html>

      {windOffsets.map((offset, index) => {
        const origin = windStart.clone().add(windAcross.clone().multiplyScalar(offset)).setY(0.7 + index * 0.12)
        return <arrowHelper key={offset} args={[windTo, origin, radius * 0.9, '#38bdf8', 0.35, 0.22]} />
      })}
      <Html
        position={[center.x + windTo.x * radius * 0.75, 1.15, center.z + windTo.z * radius * 0.75]}
        center
        distanceFactor={9}
        style={{ pointerEvents: 'none' }}
      >
        <div className="scene-factor-label">
          <strong>Wind</strong>
          <span>{env.wind_speed.toFixed(1)} km/h from {windDirLabel(env.wind_direction)}</span>
        </div>
      </Html>
    </group>
  )
}

function SunSimulatorPanel({
  environment,
  samples,
  sunMoment,
  isPlaying,
  sampleIndex,
  activeTime,
  usesDetectedWindows,
  onPlayToggle,
  onScrub,
  onSelectSample,
}: {
  environment: EnvironmentData
  samples: SolarSample[]
  sunMoment: SunMoment | null
  isPlaying: boolean
  sampleIndex: number
  activeTime: string | null
  usesDetectedWindows: boolean
  onPlayToggle: () => void
  onScrub: (index: number) => void
  onSelectSample: (sample: SolarSample, index: number) => void
}) {
  return (
    <div className="sun-sim-panel">
      <div>
        <strong>Sun & wind simulator</strong>
        <span className="muted">
          {usesDetectedWindows ? 'Detected windows' : 'Estimated sun-facing edge'} - {sunMoment ? formatLocalTime(sunMoment.time) : '--:--'}
        </span>
        <span className="muted">
          Wind {environment.wind_speed.toFixed(1)} km/h from {windDirLabel(environment.wind_direction)}
        </span>
      </div>
      {samples.length > 0 ? (
        <>
          <div className="sun-sim-toolbar">
            <button type="button" onClick={onPlayToggle} disabled={samples.length < 2}>
              {isPlaying ? 'Pause' : 'Play day'}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(samples.length - 1, 0)}
              step={0.01}
              value={sampleIndex}
              onChange={(event) => onScrub(Number(event.currentTarget.value))}
              aria-label="Scrub sunlight timing"
            />
          </div>
          <div className="sun-time-buttons">
            {samples.map((sample, index) => (
              <button
                key={sample.time}
                type="button"
                className={sample.time === activeTime ? 'active' : ''}
                onClick={() => onSelectSample(sample, index)}
                title={`${sample.solar_elevation.toFixed(0)} deg elevation, ${sample.solar_azimuth.toFixed(0)} deg azimuth`}
              >
                {formatLocalTime(sample.time)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted sun-sim-empty">No daylight timeline was returned, so the viewer is showing the current sun and wind vectors only.</p>
      )}
    </div>
  )
}

type SceneRigProps = {
  mode: ViewerMode
  transition: TransitionState | null
  overviewPosition: THREE.Vector3
  overviewLookAt: THREE.Vector3
  walls: WallSegment[]
  bounds: Bounds
  onTransitionComplete: () => void
  onPointerLockChange: (locked: boolean) => void
  pointerLockTarget: MutableRefObject<HTMLCanvasElement | null>
}

function SceneRig({
  mode,
  transition,
  overviewPosition,
  overviewLookAt,
  walls,
  bounds,
  onTransitionComplete,
  onPointerLockChange,
  pointerLockTarget,
}: SceneRigProps) {
  const { camera, gl } = useThree()
  const keyState = useRef<Record<string, boolean>>({})
  const pointerDelta = useRef({ x: 0, y: 0 })
  const currentYawPitch = useRef({ yaw: 0, pitch: 0 })
  const currentTarget = useRef(overviewLookAt.clone())
  const transitionComplete = useRef(false)

  useEffect(() => {
    pointerLockTarget.current = gl.domElement
    const onPointerLock = () => {
      onPointerLockChange(document.pointerLockElement === gl.domElement)
    }

    const onBlur = () => {
      keyState.current = {}
      pointerDelta.current = { x: 0, y: 0 }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      keyState.current[event.key.toLowerCase()] = true
    }

    const onKeyUp = (event: KeyboardEvent) => {
      keyState.current[event.key.toLowerCase()] = false
    }

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      pointerDelta.current.x += event.movementX
      pointerDelta.current.y += event.movementY
    }

    window.addEventListener('pointerlockchange', onPointerLock)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('blur', onBlur)

    onPointerLock()

    return () => {
      window.removeEventListener('pointerlockchange', onPointerLock)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl.domElement, onPointerLockChange, pointerLockTarget])

  useEffect(() => {
    if (mode === 'overview') {
      camera.position.copy(overviewPosition)
      currentTarget.current = overviewLookAt.clone()
      camera.lookAt(overviewLookAt)
      currentYawPitch.current = roomHeading(camera.position, overviewLookAt)
    }
  }, [camera, mode, overviewLookAt, overviewPosition])

  useEffect(() => {
    if (!transition) return
    camera.position.copy(transition.fromPosition)
    currentTarget.current = transition.fromLookAt.clone()
    const heading = roomHeading(transition.fromPosition, transition.fromLookAt)
    currentYawPitch.current = heading
    transitionComplete.current = false
  }, [camera, transition])

  useFrame((_, delta) => {
    if (mode === 'transitioning' && transition) {
      const progress = clamp((performance.now() / 1000 - transition.startTime) / transition.duration, 0, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased)
      currentTarget.current.lerpVectors(transition.fromLookAt, transition.toLookAt, eased)
      camera.lookAt(currentTarget.current)
      currentYawPitch.current = roomHeading(camera.position, currentTarget.current)
      if (progress >= 1 && !transitionComplete.current) {
        transitionComplete.current = true
        onTransitionComplete()
      }
      return
    }

    if (mode !== 'walkthrough') {
      return
    }

    if (document.pointerLockElement === gl.domElement) {
      currentYawPitch.current.yaw -= pointerDelta.current.x * LOOK_SENSITIVITY
      currentYawPitch.current.pitch -= pointerDelta.current.y * LOOK_SENSITIVITY
      currentYawPitch.current.pitch = clamp(currentYawPitch.current.pitch, -1.25, 1.25)
      pointerDelta.current = { x: 0, y: 0 }
    }

    const yaw = currentYawPitch.current.yaw
    const pitch = currentYawPitch.current.pitch

    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
    const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
    const movement = new THREE.Vector3()
    const speed = WALK_SPEED * (keyState.current.shift || keyState.current['shift'] ? SPRINT_MULTIPLIER : 1)

    if (keyState.current['w'] || keyState.current['arrowup']) movement.add(forward)
    if (keyState.current['s'] || keyState.current['arrowdown']) movement.sub(forward)
    if (keyState.current['d'] || keyState.current['arrowright']) movement.add(right)
    if (keyState.current['a'] || keyState.current['arrowleft']) movement.sub(right)

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(speed * delta)
      const candidate = camera.position.clone().add(movement)
      const resolved = resolveMovement(camera.position, candidate, walls, bounds)
      camera.position.copy(resolved)
    }

    const lookDirection = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    )
    currentTarget.current.copy(camera.position).add(lookDirection)
    camera.lookAt(currentTarget.current)
  })

  return null
}

export function Viewer3D({ glbUrl, schema, environment }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewerMode>('overview')
  const [transition, setTransition] = useState<TransitionState | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [pointerLocked, setPointerLocked] = useState(false)
  const [selectedSunTime, setSelectedSunTime] = useState<string | null>(null)
  const [isSunPlaying, setIsSunPlaying] = useState(false)
  const [sunSampleIndex, setSunSampleIndex] = useState(0)
  const pointerLockTarget = useRef<HTMLCanvasElement | null>(null)

  const ppm = schema?.scale.pixels_per_meter ?? 100
  const bounds = useMemo(() => computeBounds(schema, ppm), [schema, ppm])
  const overviewPosition = useMemo(() => chooseOverviewPosition(bounds), [bounds])
  const overviewLookAt = useMemo(() => new THREE.Vector3(bounds.centerX, 0.6, bounds.centerZ), [bounds])
  const sceneAnchor = useMemo(() => new THREE.Vector3(bounds.centerX, 0, bounds.centerZ), [bounds])
  const rooms = useMemo(
    () =>
      (schema?.rooms ?? [])
        .filter((room) => room.clickable !== false)
        .map((room) => ({
          room,
          centroid: room.polygon.length >= 3 ? polygonCentroid(room.polygon, ppm) : averagePoint(room.polygon, ppm),
        })),
    [schema?.rooms, ppm],
  )
  const walls = useMemo(() => buildWallSegments(schema, ppm), [schema, ppm])
  const selectedRoom = useMemo(
    () => rooms.find((entry) => entry.room.id === selectedRoomId)?.room ?? null,
    [rooms, selectedRoomId],
  )
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
    setSelectedRoomId(null)
    setHoveredRoomId(null)
    setMode('overview')
    setTransition(null)
    setModelError(null)
    setPointerLocked(false)
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [glbUrl, schema?.layout_id])

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

  const enterWalkthrough = (room: Room) => {
    const canvas = pointerLockTarget.current
    const overviewCam = new THREE.Vector3(overviewPosition.x, overviewPosition.y, overviewPosition.z)
    const entryPosition = chooseRoomEntry(room, ppm, overviewCam, bounds)
    const focusPoint = room.polygon.length >= 3 ? polygonCentroid(room.polygon, ppm) : averagePoint(room.polygon, ppm)
    const toLookAt = new THREE.Vector3(focusPoint.x, EYE_HEIGHT, focusPoint.z)
    const fromLookAt = new THREE.Vector3(bounds.centerX, 0.6, bounds.centerZ)

    setSelectedRoomId(room.id)
    setTransition({
      roomId: room.id,
      fromPosition: overviewCam,
      fromLookAt,
      toPosition: entryPosition,
      toLookAt,
      startTime: performance.now() / 1000,
      duration: TRANSITION_SECONDS,
    })
    setMode('transitioning')

    if (canvas) {
      void canvas.requestPointerLock()
    }
  }

  const exitWalkthrough = () => {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    setMode('overview')
    setTransition(null)
    setSelectedRoomId(null)
  }

  return (
    <div className="viewer-shell">
      <div className="viewer-stage">
        <Canvas
          shadows
          camera={{ position: [overviewPosition.x, overviewPosition.y, overviewPosition.z], fov: 48, near: 0.05, far: 300 }}
          onCreated={({ gl, camera }) => {
            pointerLockTarget.current = gl.domElement
            camera.position.copy(overviewPosition)
            camera.lookAt(overviewLookAt)
          }}
        >
          <color attach="background" args={['#dde2e7']} />
          <fog attach="fog" args={['#dde2e7', 24, 90]} />
          <ambientLight intensity={0.78} />
          <hemisphereLight intensity={0.92} color="#f7fbff" groundColor="#aea08e" />
          <directionalLight
            position={[sceneAnchor.x + bounds.width * 0.45, Math.max(bounds.width, bounds.depth) * 1.8 + 12, sceneAnchor.z + bounds.depth * 0.25]}
            intensity={1.75}
            color="#fff3d9"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.1}
            shadow-camera-far={120}
            shadow-camera-left={-28}
            shadow-camera-right={28}
            shadow-camera-top={28}
            shadow-camera-bottom={-28}
          />
          <directionalLight position={[sceneAnchor.x - 18, 16, sceneAnchor.z - 14]} intensity={0.42} color="#c9dfff" />
          <Environment preset="apartment" background={false} />
          <FloorPlane bounds={bounds} />
          <ContactShadows
            position={[bounds.centerX, 0.02, bounds.centerZ]}
            scale={Math.max(bounds.width, bounds.depth) + 12}
            blur={2.8}
            far={Math.max(bounds.width, bounds.depth) + 16}
            opacity={0.28}
            resolution={1024}
          />
          <SceneRig
            mode={mode}
            transition={transition}
            overviewPosition={overviewPosition}
            overviewLookAt={overviewLookAt}
            walls={walls}
            bounds={bounds}
            onTransitionComplete={() => {
              setMode('walkthrough')
              setTransition(null)
            }}
            onPointerLockChange={setPointerLocked}
            pointerLockTarget={pointerLockTarget}
          />
          <Suspense fallback={null}>
            <SceneModel
              glbUrl={glbUrl}
              anchor={sceneAnchor}
              onLoadError={(message) => {
                setModelError(message)
              }}
            />
          </Suspense>
          {rooms.map(({ room, centroid }) => (
            <RoomMarker
              key={room.id}
              room={room}
              position={new THREE.Vector3(centroid.x, 0, centroid.z)}
              active={selectedRoomId === room.id}
              hovered={hoveredRoomId === room.id}
              onHoverChange={setHoveredRoomId}
              onSelect={enterWalkthrough}
            />
          ))}
          {environment && sunMoment ? (
            <EnvironmentSceneOverlay
              env={environment}
              schema={schema}
              ppm={ppm}
              bounds={bounds}
              sunMoment={sunMoment}
            />
          ) : null}
        </Canvas>
      </div>

      <div className="viewer-overlay">
        <div className="viewer-topbar">
          <div className="viewer-status">
            <span className="viewer-badge">3D walkthrough</span>
            <span className="viewer-badge viewer-badge-subtle">
              {mode === 'overview' ? 'Overview' : mode === 'transitioning' ? 'Entering room' : 'Walkthrough'}
            </span>
            {pointerLocked ? <span className="viewer-badge viewer-badge-subtle">Pointer lock active</span> : null}
          </div>
          <div className="viewer-actions">
            <button onClick={exitWalkthrough}>Exit walkthrough</button>
          </div>
        </div>

        <div className="viewer-hint viewer-hint-top">
          <p>
            {mode === 'overview'
              ? 'Hover a gray marker to see the room name, then click to enter first-person view.'
              : mode === 'transitioning'
                ? 'Moving to room view...'
                : pointerLocked
                  ? 'WASD to move, mouse to look. Esc exits pointer lock.'
                  : 'Click inside the view to re-engage pointer lock, then use WASD and mouse look.'}
          </p>
        </div>

        <div className="viewer-hint viewer-hint-bottom">
          {selectedRoom ? (
            <div className="viewer-room-card">
              <strong>{selectedRoom.name}</strong>
              <div className="muted">Type: {selectedRoom.type}</div>
              <div className="muted">Area: {selectedRoom.estimated_area_sqm ?? 'Estimated'} sqm</div>
              <div className="muted">Source page: {selectedRoom.source_page ?? schema?.source_page ?? 'N/A'}</div>
              <div className="muted">Notes: {selectedRoom.notes ?? schema?.notes ?? 'N/A'}</div>
            </div>
          ) : (
            <div className="viewer-room-card">
              <strong>No room selected</strong>
              <div className="muted">Click a marker to jump to its POV.</div>
              <div className="muted">Collision uses the exported wall schema and floor-plane bounds.</div>
            </div>
          )}
        </div>

        {modelError ? <div className="viewer-error">{modelError}</div> : null}
        {environment ? (
          <SunSimulatorPanel
            environment={environment}
            samples={daylightSamples}
            sunMoment={sunMoment}
            isPlaying={isSunPlaying}
            sampleIndex={sunSampleIndex}
            activeTime={activeSunTime}
            usesDetectedWindows={Boolean(schema?.windows?.length)}
            onPlayToggle={() => setIsSunPlaying((playing) => !playing)}
            onScrub={(nextIndex) => {
              const nextSample = daylightSamples[Math.round(nextIndex)]
              setIsSunPlaying(false)
              setSunSampleIndex(nextIndex)
              setSelectedSunTime(nextSample?.time ?? null)
            }}
            onSelectSample={(sample, index) => {
              setIsSunPlaying(false)
              setSunSampleIndex(index)
              setSelectedSunTime(sample.time)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
