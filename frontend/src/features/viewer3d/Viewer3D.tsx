import { Environment, Html, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'

import type { EnvironmentData, LayoutSchema, Room, SolarSample, Wall } from '../../lib/api'

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

type SunMoment = {
  time: string
  solar_azimuth: number
  solar_elevation: number
}

type WindowPortal = {
  id: string
  position: THREE.Vector3
  width: number
  height: number
  normal: THREE.Vector3
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
  targetMode: ViewerMode
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
const CAMERA_CLEARANCE = 0.18
const TRANSITION_SECONDS = 0.9
const FLOOR_HEIGHT = -0.12
const SUN_PATCH_Y = 0.075
const SUN_MODEL_CLEARANCE = 2.4
const SUN_VISUAL_ORBIT_MULTIPLIER = 0.92
const SUN_LIGHT_ORBIT_MULTIPLIER = 1.65
const WINDOW_SILL_HEIGHT = 0.88
const OVERVIEW_ROTATION_SPEED = 0.045
const OVERVIEW_CURSOR_ROTATE_SPEED = 0.36
const OVERVIEW_CURSOR_DEADZONE = 0.08
const INITIAL_OVERVIEW_ANGLE = Math.PI / 4
const OVERVIEW_RADIUS_MULTIPLIER = 0.95 * Math.SQRT2
const WALKTHROUGH_CAMERA_ZOOM = 0.94
const WALL_COLLISION_BUFFER = 0.22
const WALL_GREY = '#c9c7c1'
const FLOOR_TONE = '#786d60'
const FLOOR_TONE_DEEP = '#675b4f'
const MIN_WIND_ARROW_LENGTH = 1.6
const MAX_WIND_ARROW_LENGTH = 5.2
const DAY_ANIMATION_INDEXES_PER_SECOND = 1.15

type Opening = {
  id: string
  wall_id?: string | null
  center: number[]
  width_m: number
  height_m: number
}

type WallCollisionSegment = {
  horizontal: boolean
  minAxis: number
  maxAxis: number
  coord: number
  halfThickness: number
}

type WindowPlacement = {
  id: string
  localCenter: number
  width: number
  height: number
}

type WallExtents = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

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

function compassDirLabel(deg: number) {
  return DIRS_16[Math.round(deg / 22.5) % 16]
}

function normalizeDegrees(deg: number) {
  return ((deg % 360) + 360) % 360
}

function lerpCompassDegrees(from: number, to: number, t: number) {
  const delta = ((to - from + 540) % 360) - 180
  return normalizeDegrees(from + delta * t)
}

function compassVector(deg: number): THREE.Vector3 {
  const rad = (deg * Math.PI) / 180
  // Layout images use y-down coordinates, which map to +Z in the scene.
  // Real-world north should therefore point toward -Z when viewed from above.
  return new THREE.Vector3(Math.sin(rad), 0, -Math.cos(rad)).normalize()
}

function formatLocalTime(value: string): string {
  const time = value.includes('T') ? value.split('T')[1] : value
  return time.slice(0, 5)
}

function minutesOfDay(value: string): number {
  const [hour = '0', minute = '0'] = formatLocalTime(value).split(':')
  return Number(hour) * 60 + Number(minute)
}

function timeAtMinutes(template: string, minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  const hour = Math.floor(clamped / 60).toString().padStart(2, '0')
  const minute = (clamped % 60).toString().padStart(2, '0')
  const datePrefix = template.includes('T') ? `${template.split('T')[0]}T` : ''
  return `${datePrefix}${hour}:${minute}`
}

function sunVectorFromAzEl(azimuth: number, elevation: number): THREE.Vector3 {
  const elevationRad = (Math.max(elevation, 3) * Math.PI) / 180
  const flat = compassVector(azimuth)
  return new THREE.Vector3(
    flat.x * Math.cos(elevationRad),
    Math.sin(elevationRad),
    flat.z * Math.cos(elevationRad),
  ).normalize()
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
    time: timeAtMinutes(lower.time, THREE.MathUtils.lerp(minutesOfDay(lower.time), minutesOfDay(upper.time), t)),
    solar_azimuth: lerpCompassDegrees(lower.solar_azimuth, upper.solar_azimuth, t),
    solar_elevation: THREE.MathUtils.lerp(lower.solar_elevation, upper.solar_elevation, t),
  }
}

function findOpeningWall(opening: Opening, walls: Wall[], ppm: number): Wall | null {
  if (opening.wall_id) {
    const direct = walls.find((wall) => wall.id === opening.wall_id)
    if (direct) return direct
  }

  const center = toWorldPoint(opening.center, ppm)
  let bestWall: Wall | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const wall of walls) {
    const start = toWorldPoint(wall.start, ppm)
    const end = toWorldPoint(wall.end, ppm)
    const distance = distancePointToSegmentSquared(center, start, end)
    if (distance < bestDistance) {
      bestDistance = distance
      bestWall = wall
    }
  }
  return bestWall
}

function exteriorWallNormal(wall: Wall, portalPosition: THREE.Vector3, bounds: Bounds, ppm: number): THREE.Vector3 {
  const start = toWorldPoint(wall.start, ppm)
  const end = toWorldPoint(wall.end, ppm)
  const along = new THREE.Vector3(end.x - start.x, 0, end.z - start.z)
  if (along.lengthSq() <= 1e-6) return new THREE.Vector3(0, 0, -1)
  along.normalize()

  const normalA = new THREE.Vector3(-along.z, 0, along.x).normalize()
  const normalB = normalA.clone().negate()
  const layoutCenter = new THREE.Vector3(bounds.centerX, 0, bounds.centerZ)
  const outwardProbe = portalPosition.clone().sub(layoutCenter).setY(0)
  if (outwardProbe.lengthSq() <= 1e-6) return normalA
  return normalA.dot(outwardProbe) >= normalB.dot(outwardProbe) ? normalA : normalB
}

function openingToPortal(opening: Opening, ppm: number, walls: Wall[], bounds: Bounds): WindowPortal | null {
  if (opening.center.length < 2) return null
  const center = toWorldPoint(opening.center, ppm)
  const height = Math.max(opening.height_m || 1.2, 0.75)
  const position = new THREE.Vector3(center.x, FLOOR_HEIGHT + WINDOW_SILL_HEIGHT + height / 2, center.z)
  const wall = findOpeningWall(opening, walls, ppm)
  return {
    id: opening.id,
    position,
    width: Math.max(opening.width_m || 1.1, 0.75),
    height,
    normal: wall ? exteriorWallNormal(wall, position, bounds, ppm) : position.clone().sub(new THREE.Vector3(bounds.centerX, 0, bounds.centerZ)).setY(0).normalize(),
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
    height: 1.2,
    normal: sunFlat.clone(),
    inferred: true,
  }))
}

function getSunFacingPortals(schema: LayoutSchema | null, ppm: number, bounds: Bounds, sunFlat: THREE.Vector3): WindowPortal[] {
  const portals = (schema?.windows ?? [])
    .map((opening) => openingToPortal(opening, ppm, schema?.walls ?? [], bounds))
    .filter((portal): portal is WindowPortal => Boolean(portal))

  if (!portals.length) return inferSunEdgePortals(bounds, sunFlat)

  return portals.filter((portal) => portal.normal.dot(sunFlat) > 0.12)
}

function clampVectorToBounds(point: THREE.Vector3, bounds: Bounds, margin = 0.25): THREE.Vector3 {
  return new THREE.Vector3(
    clamp(point.x, bounds.minX + margin, bounds.maxX - margin),
    point.y,
    clamp(point.z, bounds.minZ + margin, bounds.maxZ - margin),
  )
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

function createFloorTexture() {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  base.addColorStop(0, FLOOR_TONE)
  base.addColorStop(0.45, '#6f6458')
  base.addColorStop(1, FLOOR_TONE_DEEP)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
  ctx.lineWidth = 1.2
  for (let y = 0; y <= canvas.height; y += 46) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(canvas.width, y + 0.5)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(80, 67, 54, 0.05)'
  ctx.lineWidth = 2
  for (let x = 0; x <= canvas.width; x += 128) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, canvas.height)
    ctx.stroke()
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 3
    data[i] = clamp(data[i] + noise, 0, 255)
    data[i + 1] = clamp(data[i + 1] + noise * 0.8, 0, 255)
    data[i + 2] = clamp(data[i + 2] + noise * 0.6, 0, 255)
  }
  ctx.putImageData(image, 0, 0)

  const vignette = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.42,
    canvas.width * 0.12,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.72,
  )
  vignette.addColorStop(0, 'rgba(255, 255, 255, 0)')
  vignette.addColorStop(1, 'rgba(27, 21, 15, 0.16)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
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
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[bounds.centerX, FLOOR_HEIGHT, bounds.centerZ]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={texture} color="#77695c" roughness={1} metalness={0} />
    </mesh>
  )
}

function chooseOverviewPosition(bounds: Bounds): THREE.Vector3 {
  return getOverviewOrbitPose(bounds, INITIAL_OVERVIEW_ANGLE).position
}

function getOverviewOrbitPose(bounds: Bounds, angle: number) {
  const span = Math.max(bounds.width, bounds.depth)
  const radius = Math.max(span * OVERVIEW_RADIUS_MULTIPLIER, 5)
  const height = Math.max(4.5, span * 0.9)
  const lookAt = new THREE.Vector3(bounds.centerX, 0.6, bounds.centerZ)
  const position = new THREE.Vector3(
    lookAt.x + Math.cos(angle) * radius,
    height,
    lookAt.z + Math.sin(angle) * radius,
  )
  return { position, lookAt, radius, height }
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

function getMeshDimensions(mesh: THREE.Mesh) {
  const geometry = mesh.geometry as THREE.BufferGeometry | undefined
  if (!geometry) {
    return new THREE.Vector3(0, 0, 0)
  }

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox()
  }

  return geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(0, 0, 0)
}

function classifyInteriorSurface(mesh: THREE.Mesh) {
  const size = getMeshDimensions(mesh)
  const maxHorizontal = Math.max(size.x, size.z)
  const minHorizontal = Math.min(size.x, size.z)

  if (size.y <= Math.max(0.16, minHorizontal * 0.25) && maxHorizontal >= 1.2) {
    return 'floor' as const
  }

  if (size.y >= Math.max(size.x, size.z) * 1.15 && minHorizontal <= 0.55) {
    return 'wall' as const
  }

  return 'other' as const
}

function buildWallCollisionSegments(walls: Wall[], ppm: number): WallCollisionSegment[] {
  return walls.map((wall) => {
    const start = toWorldPoint(wall.start, ppm)
    const end = toWorldPoint(wall.end, ppm)
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)
    return {
      horizontal,
      minAxis: horizontal ? Math.min(start.x, end.x) : Math.min(start.z, end.z),
      maxAxis: horizontal ? Math.max(start.x, end.x) : Math.max(start.z, end.z),
      coord: horizontal ? (start.z + end.z) / 2 : (start.x + end.x) / 2,
      halfThickness: Math.max(0.05, wall.thickness_m / 2) + WALL_COLLISION_BUFFER,
    }
  })
}

function pointHitsWall(point: WorldPoint, wall: WallCollisionSegment) {
  if (wall.horizontal) {
    return (
      point.z >= wall.coord - wall.halfThickness &&
      point.z <= wall.coord + wall.halfThickness &&
      point.x >= wall.minAxis - WALL_COLLISION_BUFFER &&
      point.x <= wall.maxAxis + WALL_COLLISION_BUFFER
    )
  }

  return (
    point.x >= wall.coord - wall.halfThickness &&
    point.x <= wall.coord + wall.halfThickness &&
    point.z >= wall.minAxis - WALL_COLLISION_BUFFER &&
    point.z <= wall.maxAxis + WALL_COLLISION_BUFFER
  )
}

function collidesWithWalls(point: WorldPoint, walls: WallCollisionSegment[]) {
  return walls.some((wall) => pointHitsWall(point, wall))
}

function computeWallExtents(walls: Wall[], ppm: number): WallExtents | null {
  if (!walls.length) return null
  const points: WorldPoint[] = []
  for (const wall of walls) {
    points.push(toWorldPoint(wall.start, ppm))
    points.push(toWorldPoint(wall.end, ppm))
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  }
}

function templateWindowsForFourRoom(walls: Wall[]): Opening[] {
  const wallIds = new Set(walls.map((wall) => wall.id))
  const presets: Opening[] = [
    { id: 'template_window_1', wall_id: 'wall_window_living', center: [327.5, 220.0], width_m: 3.51, height_m: 1.2 },
    { id: 'template_window_2', wall_id: 'wall_window_bedroom_left', center: [722.0, 49.25], width_m: 2.28, height_m: 1.2 },
    { id: 'template_window_3', wall_id: 'wall_window_bedroom_middle', center: [1158.5, 49.25], width_m: 1.67, height_m: 1.2 },
    { id: 'template_window_4', wall_id: 'wall_window_main_bedroom', center: [1493.5, 49.25], width_m: 3.75, height_m: 1.2 },
  ]

  return presets.filter((opening) => typeof opening.wall_id === 'string' && wallIds.has(opening.wall_id))
}

function templateWindowWallsForFourRoom(walls: Wall[]): Wall[] {
  const wallIds = new Set(walls.map((wall) => wall.id))
  const presets: Wall[] = [
    { id: 'wall_window_living', start: [152.0, 220.0], end: [503.0, 220.0], thickness_m: 0.12, height_m: 2.8 },
    { id: 'wall_window_bedroom_left', start: [608.0, 49.25], end: [836.0, 49.25], thickness_m: 0.12, height_m: 2.8 },
    { id: 'wall_window_bedroom_middle', start: [1075.0, 49.25], end: [1242.0, 49.25], thickness_m: 0.12, height_m: 2.8 },
    { id: 'wall_window_main_bedroom', start: [1306.0, 49.25], end: [1681.0, 49.25], thickness_m: 0.12, height_m: 2.8 },
  ]

  return presets.filter((wall) => !wallIds.has(wall.id))
}

function dedupeOpeningsForViewer(openings: Opening[]) {
  const seen = new Set<string>()
  const deduped: Opening[] = []
  for (const opening of openings) {
    const centerX = Number.isFinite(opening.center?.[0] as number) ? Number(opening.center[0]) : 0
    const centerY = Number.isFinite(opening.center?.[1] as number) ? Number(opening.center[1]) : 0
    const key = `${opening.wall_id ?? 'none'}:${Math.round(centerX / 8)}:${Math.round(centerY / 8)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(opening)
  }
  return deduped
}

function isExteriorWall(wall: Wall, extents: WallExtents, ppm: number) {
  const start = toWorldPoint(wall.start, ppm)
  const end = toWorldPoint(wall.end, ppm)
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)
  const tolerance = Math.max(0.12, wall.thickness_m * 1.5, 0.35)

  if (horizontal) {
    const avgZ = (start.z + end.z) / 2
    return Math.abs(avgZ - extents.minZ) <= tolerance || Math.abs(avgZ - extents.maxZ) <= tolerance
  }

  const avgX = (start.x + end.x) / 2
  return Math.abs(avgX - extents.minX) <= tolerance || Math.abs(avgX - extents.maxX) <= tolerance
}

function styleMaterialForInterior(material: THREE.Material, kind: 'floor' | 'wall' | 'other') {
  const next = material.clone() as THREE.Material & Record<string, unknown>
  const typed = next as THREE.Material & {
    color?: THREE.Color
    roughness?: number
    metalness?: number
    transparent?: boolean
    opacity?: number
    depthWrite?: boolean
    side?: number
    envMapIntensity?: number
    emissive?: THREE.Color
    emissiveIntensity?: number
    clearcoat?: number
    sheen?: number
    map?: THREE.Texture | null
    alphaMap?: THREE.Texture | null
    transmission?: number
  }

  typed.transparent = false
  typed.opacity = 1
  typed.depthWrite = true
  typed.side = THREE.DoubleSide

  if (kind === 'wall' || kind === 'floor') {
    typed.color?.set(kind === 'floor' ? FLOOR_TONE : WALL_GREY)
    typed.roughness = kind === 'floor' ? 0.98 : 0.92
    typed.metalness = 0
    typed.envMapIntensity = kind === 'floor' ? 0.14 : 0.08
    typed.emissive?.set(kind === 'floor' ? '#15110d' : '#111111')
    typed.emissiveIntensity = 0.02
    typed.clearcoat = 0
    typed.sheen = 0
    typed.transmission = 0
  }

  if (kind === 'wall') {
    typed.color?.offsetHSL(0, -0.03, -0.02)
  }

  if (kind === 'floor') {
    typed.color?.offsetHSL(0, -0.02, -0.03)
  }

  if ('needsUpdate' in typed) {
    typed.needsUpdate = true
  }

  return next
}

function WallOverlay({ walls, windows, ppm }: { walls: Wall[]; windows: Opening[]; ppm: number }) {
  if (!walls.length) return null

  const openingsByWall = useMemo(() => {
    const wallById = new Map(walls.map((wall) => [wall.id, wall]))
    const placements = new Map<string, WindowPlacement[]>()
    const extents = computeWallExtents(walls, ppm)

    if (!extents) {
      return placements
    }

    for (const opening of windows) {
      let wall = opening.wall_id ? wallById.get(opening.wall_id) ?? null : null
      if (!wall) {
        const center = toWorldPoint(opening.center, ppm)
        let bestWall: Wall | null = null
        let bestDistance = Number.POSITIVE_INFINITY
        for (const candidate of walls) {
          const start = toWorldPoint(candidate.start, ppm)
          const end = toWorldPoint(candidate.end, ppm)
          const distance = distancePointToSegmentSquared(center, start, end)
          if (distance < bestDistance) {
            bestDistance = distance
            bestWall = candidate
          }
        }
        wall = bestWall
      }

      if (!wall || (!wall.id.startsWith('wall_window_') && !isExteriorWall(wall, extents, ppm))) continue

      const start = toWorldPoint(wall.start, ppm)
      const end = toWorldPoint(wall.end, ppm)
      const wallCenter = new THREE.Vector3((start.x + end.x) / 2, 0, (start.z + end.z) / 2)
      const wallDir = new THREE.Vector3(end.x - start.x, 0, end.z - start.z)
      const wallLength = Math.max(wallDir.length(), 1e-6)
      wallDir.normalize()
      const openingCenter = toWorldPoint(opening.center, ppm)
      const localCenterRaw = new THREE.Vector3(openingCenter.x - wallCenter.x, 0, openingCenter.z - wallCenter.z).dot(wallDir)
      const maxCenter = Math.max(0, wallLength / 2 - Math.max(0.18, opening.width_m / 2) - 0.05)
      const localCenter = clamp(localCenterRaw, -maxCenter, maxCenter)
      const list = placements.get(wall.id) ?? []
      list.push({
        id: opening.id,
        localCenter,
        width: Math.max(0.18, opening.width_m),
        height: Math.max(0.28, Math.min(opening.height_m, 1.35)),
      })
      placements.set(wall.id, list)
    }

    for (const list of placements.values()) {
      list.sort((a, b) => a.localCenter - b.localCenter)
    }

    return placements
  }, [walls, windows, ppm])

  return (
    <group>
      {walls.map((wall) => {
        const start = toWorldPoint(wall.start, ppm)
        const end = toWorldPoint(wall.end, ppm)
        const centerX = (start.x + end.x) / 2
        const centerZ = (start.z + end.z) / 2
        const length = Math.max(0.12, Math.hypot(end.x - start.x, end.z - start.z))
        const height = Math.max(2.2, wall.height_m)
        const thickness = Math.max(0.07, wall.thickness_m)
        const angle = Math.atan2(end.z - start.z, end.x - start.x)
        const openings = openingsByWall.get(wall.id) ?? []
        const sillHeight = WINDOW_SILL_HEIGHT
        const topHeight = openings.length
          ? Math.max(0.22, height - sillHeight - Math.max(...openings.map((opening) => opening.height)))
          : 0
        const frameDepth = Math.max(0.01, thickness * 0.08)
        const frameWidth = Math.min(0.14, Math.max(0.04, thickness * 0.42))

        return (
          <group key={wall.id} position={[centerX, FLOOR_HEIGHT, centerZ]} rotation={[0, -angle, 0]}>
            {openings.length === 0 ? (
              <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
                <boxGeometry args={[length, height, thickness]} />
                <meshStandardMaterial
                  color="#b9b8b3"
                  roughness={0.96}
                  metalness={0}
                  side={THREE.DoubleSide}
                  polygonOffset
                  polygonOffsetFactor={1}
                  polygonOffsetUnits={1}
                />
              </mesh>
            ) : (
              <>
                <mesh castShadow receiveShadow position={[0, sillHeight / 2, 0]}>
                  <boxGeometry args={[length, sillHeight, thickness]} />
                  <meshStandardMaterial
                    color="#b9b8b3"
                    roughness={0.96}
                    metalness={0}
                    side={THREE.DoubleSide}
                    polygonOffset
                    polygonOffsetFactor={1}
                    polygonOffsetUnits={1}
                  />
                </mesh>
                <mesh castShadow receiveShadow position={[0, sillHeight + Math.max(...openings.map((opening) => opening.height)) + topHeight / 2, 0]}>
                  <boxGeometry args={[length, topHeight, thickness]} />
                  <meshStandardMaterial
                    color="#b9b8b3"
                    roughness={0.96}
                    metalness={0}
                    side={THREE.DoubleSide}
                    polygonOffset
                    polygonOffsetFactor={1}
                    polygonOffsetUnits={1}
                  />
                </mesh>
                {openings.map((opening) => (
                  <group key={opening.id}>
                    <mesh castShadow receiveShadow position={[opening.localCenter - opening.width / 2 + frameWidth / 2, sillHeight + opening.height / 2, 0]}>
                      <boxGeometry args={[frameWidth, opening.height, thickness]} />
                      <meshStandardMaterial color="#b9b8b3" roughness={0.96} metalness={0} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh castShadow receiveShadow position={[opening.localCenter + opening.width / 2 - frameWidth / 2, sillHeight + opening.height / 2, 0]}>
                      <boxGeometry args={[frameWidth, opening.height, thickness]} />
                      <meshStandardMaterial color="#b9b8b3" roughness={0.96} metalness={0} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh castShadow receiveShadow position={[opening.localCenter, sillHeight + opening.height - frameWidth / 2, 0]}>
                      <boxGeometry args={[opening.width, frameWidth, frameDepth]} />
                      <meshStandardMaterial color="#8b9095" roughness={0.88} metalness={0} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh castShadow receiveShadow position={[opening.localCenter, sillHeight + frameWidth / 2, 0]}>
                      <boxGeometry args={[opening.width, frameWidth, frameDepth]} />
                      <meshStandardMaterial color="#8b9095" roughness={0.88} metalness={0} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh castShadow receiveShadow position={[opening.localCenter, sillHeight + opening.height / 2, 0]}>
                      <boxGeometry args={[opening.width * 0.92, opening.height * 0.88, frameDepth]} />
                      <meshStandardMaterial color="#d9e8f6" roughness={0.08} metalness={0} transparent opacity={0.48} emissive="#f2f8ff" emissiveIntensity={0.16} side={THREE.DoubleSide} depthWrite={false} />
                    </mesh>
                  </group>
                ))}
              </>
            )}
          </group>
        )
      })}
    </group>
  )
}

function resolveMovement(
  current: THREE.Vector3,
  candidate: THREE.Vector3,
  bounds: Bounds,
  wallSegments: WallCollisionSegment[],
) {
  const margin = CAMERA_CLEARANCE
  const isValid = (point: THREE.Vector3) =>
    point.x >= bounds.minX + margin &&
    point.x <= bounds.maxX - margin &&
    point.z >= bounds.minZ + margin &&
    point.z <= bounds.maxZ - margin &&
    !collidesWithWalls({ x: point.x, z: point.z }, wallSegments)

  const direct = new THREE.Vector3(
    clamp(candidate.x, bounds.minX + margin, bounds.maxX - margin),
    EYE_HEIGHT,
    clamp(candidate.z, bounds.minZ + margin, bounds.maxZ - margin),
  )
  if (isValid(direct)) {
    return direct
  }

  const xOnly = new THREE.Vector3(
    clamp(candidate.x, bounds.minX + margin, bounds.maxX - margin),
    EYE_HEIGHT,
    current.z,
  )
  if (isValid(xOnly)) {
    return xOnly
  }

  const zOnly = new THREE.Vector3(
    current.x,
    EYE_HEIGHT,
    clamp(candidate.z, bounds.minZ + margin, bounds.maxZ - margin),
  )
  if (isValid(zOnly)) {
    return zOnly
  }

  return current.clone()
}

function AlignedGlbModel({
  url,
  anchor,
  hideWallLikeMeshes,
}: {
  url: string
  anchor: THREE.Vector3
  hideWallLikeMeshes: boolean
}) {
  const { scene } = useGLTF(url)
  const [offset, setOffset] = useState(() => new THREE.Vector3())

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh

        const kind = classifyInteriorSurface(mesh)
        if (hideWallLikeMeshes && kind === 'wall') {
          mesh.visible = false
          return
        }

        const isGlassPane = mesh.name.startsWith('window::')
        mesh.castShadow = !isGlassPane
        mesh.receiveShadow = true

        if (kind !== 'other') {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mesh.material = materials.map((material) => styleMaterialForInterior(material, kind))
        } else {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mesh.material = materials.map((material) => {
            const next = styleMaterialForInterior(material, 'other')
            return next
          })
        }
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
  }, [anchor.x, anchor.z, hideWallLikeMeshes, scene, url])

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
  hideWallLikeMeshes,
  onLoadError,
}: {
  glbUrl: string | null
  anchor: THREE.Vector3
  hideWallLikeMeshes: boolean
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
        <AlignedGlbModel url={glbUrl} anchor={anchor} hideWallLikeMeshes={hideWallLikeMeshes} />
      </Suspense>
    </ViewerErrorBoundary>
  )
}

function SunDirectionalLight({
  color,
  intensity,
  position,
  target,
  castShadow,
}: {
  color: string
  intensity: number
  position: THREE.Vector3
  target: THREE.Vector3
  castShadow: boolean
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef(new THREE.Object3D())
  const { scene } = useThree()

  useEffect(() => {
    const targetObject = targetRef.current
    scene.add(targetObject)
    return () => {
      scene.remove(targetObject)
    }
  }, [scene])

  useEffect(() => {
    const targetObject = targetRef.current
    targetObject.position.copy(target)
    if (lightRef.current) {
      lightRef.current.target = targetObject
      lightRef.current.target.updateMatrixWorld()
    }
  }, [target])

  return (
    <directionalLight
      ref={lightRef}
      position={[position.x, position.y, position.z]}
      intensity={intensity}
      color={color}
      castShadow={castShadow}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-near={0.1}
      shadow-camera-far={160}
      shadow-camera-left={-24}
      shadow-camera-right={24}
      shadow-camera-top={24}
      shadow-camera-bottom={-24}
      shadow-bias={-0.00025}
      shadow-normalBias={0.035}
    />
  )
}

function SunModel({ position, strength }: { position: THREE.Vector3; strength: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const size = THREE.MathUtils.lerp(0.34, 0.52, strength)

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.18
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.045
    groupRef.current.scale.setScalar(pulse)
  })

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      <pointLight color="#fbbf24" intensity={1.25 + strength * 1.4} distance={5.5} decay={1.7} />
      <mesh>
        <sphereGeometry args={[size, 48, 48]} />
        <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={1.9 + strength} roughness={0.34} metalness={0.02} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size * 1.72, 48, 48]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.18 + strength * 0.08} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2.6, 0, 0]}>
        <torusGeometry args={[size * 1.38, size * 0.025, 8, 72]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2.8, Math.PI / 5]}>
        <torusGeometry args={[size * 1.18, size * 0.02, 8, 72]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.72} />
      </mesh>
    </group>
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
  const windFrom = useMemo(() => compassVector(env.wind_direction), [env.wind_direction])
  const windTo = useMemo(() => windFrom.clone().negate(), [windFrom])
  const windAcross = useMemo(() => new THREE.Vector3(-windTo.z, 0, windTo.x).normalize(), [windTo])
  const windStart = center.clone().sub(windTo.clone().multiplyScalar(radius * 0.9))
  const windOffsets = [-0.36, 0, 0.36].map((factor) => factor * Math.max(bounds.width, bounds.depth, 3))
  const windArrowLength = THREE.MathUtils.clamp(env.wind_speed * 0.16 + MIN_WIND_ARROW_LENGTH, MIN_WIND_ARROW_LENGTH, Math.min(MAX_WIND_ARROW_LENGTH, radius * 1.05))
  const windTowardLabel = compassDirLabel(env.wind_direction + 180)
  const compassLabels = useMemo(
    () => [
      { label: 'N', direction: compassVector(0) },
      { label: 'E', direction: compassVector(90) },
      { label: 'S', direction: compassVector(180) },
      { label: 'W', direction: compassVector(270) },
    ],
    [],
  )

  const solarElevation = Math.max(sunMoment.solar_elevation, 3)
  const solarElevationRad = (solarElevation * Math.PI) / 180
  const sunFlat = compassVector(sunMoment.solar_azimuth)
  const sunVector = sunVectorFromAzEl(sunMoment.solar_azimuth, solarElevation)
  const maxWallHeight = Math.max(...(schema?.walls ?? []).map((wall) => wall.height_m), 2.8)
  const sunMinY = FLOOR_HEIGHT + maxWallHeight + SUN_MODEL_CLEARANCE
  const sunLightDistance = Math.max(radius * SUN_LIGHT_ORBIT_MULTIPLIER, (sunMinY - center.y) / Math.max(sunVector.y, 0.08))
  const sunLightOrigin = center.clone().add(sunVector.clone().multiplyScalar(sunLightDistance))
  const sunVisualDistance = radius * SUN_VISUAL_ORBIT_MULTIPLIER
  const sunVisualOrigin = center.clone().add(sunVector.clone().multiplyScalar(sunVisualDistance))
  sunVisualOrigin.y = Math.max(sunVisualOrigin.y, sunMinY)
  const sunRayDirection = sunVector.clone().negate()
  const sunPortals = useMemo(() => getSunFacingPortals(schema, ppm, bounds, sunFlat), [schema, ppm, bounds, sunFlat])
  const sunPathPoints = useMemo(
    () =>
      (env.solar_samples ?? [])
        .filter((sample) => sample.solar_elevation > 0)
        .map((sample) => {
          const sampleVector = sunVectorFromAzEl(sample.solar_azimuth, sample.solar_elevation)
          const point = center.clone().add(sampleVector.clone().multiplyScalar(radius * SUN_VISUAL_ORBIT_MULTIPLIER))
          point.y = Math.max(point.y, sunMinY)
          return point
        }),
    [center, env.solar_samples, radius, sunMinY],
  )
  const sunPathGeometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(sunPathPoints), [sunPathPoints])
  const sunPathLine = useMemo(
    () =>
      new THREE.Line(
        sunPathGeometry,
        new THREE.LineBasicMaterial({
          color: '#fbbf24',
          transparent: true,
          opacity: 0.46,
        }),
      ),
    [sunPathGeometry],
  )
  const isNight = sunMoment.solar_elevation <= 0
  const sunStrength = isNight ? 0.03 : THREE.MathUtils.clamp(sunMoment.solar_elevation / 48, 0.38, 1)
  const sunLightIntensity = isNight ? 0.08 : THREE.MathUtils.lerp(0.75, 1.85, sunStrength)
  const sunTimeLabel = formatLocalTime(sunMoment.time)

  useEffect(
    () => () => {
      sunPathGeometry.dispose()
      const material = sunPathLine.material
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose())
      } else {
        material.dispose()
      }
    },
    [sunPathGeometry, sunPathLine],
  )

  return (
    <group>
      <SunDirectionalLight
        position={sunLightOrigin}
        target={center}
        intensity={sunLightIntensity}
        color={isNight ? '#9ca3af' : '#ffd166'}
        castShadow={!isNight}
      />
      {false && !isNight ? <SunModel position={sunVisualOrigin} strength={sunStrength} /> : null}
      {false && sunPathPoints.length > 1 ? <primitive object={sunPathLine} /> : null}
      {false ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0.05, center.z]}>
          <ringGeometry args={[radius * 0.98, radius, 96]} />
          <meshBasicMaterial color="#7ad6cc" transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {compassLabels.map(({ label, direction }) => (
        <Html
          key={label}
          position={[center.x + direction.x * radius, 0.24, center.z + direction.z * radius]}
          center
          distanceFactor={9}
          style={{ pointerEvents: 'none' }}
        >
          <div className="scene-factor-label">{label}</div>
        </Html>
      ))}

      {false && !isNight && sunPortals.map((portal) => {
        const directness = THREE.MathUtils.clamp((portal.normal.dot(sunFlat) - 0.12) / 0.7, 0, 1)
        const floorTravel = (portal.position.y - SUN_PATCH_Y) / Math.max(0.08, -sunRayDirection.y)
        const rawPatchCenter = portal.position.clone().add(sunRayDirection.clone().multiplyScalar(floorTravel)).setY(SUN_PATCH_Y)
        const patchCenter = clampVectorToBounds(rawPatchCenter, bounds, 0.35)
        const clampFade = THREE.MathUtils.clamp(1 - rawPatchCenter.distanceTo(patchCenter) / Math.max(radius * 0.45, 1), 0, 1)
        const patchLength = THREE.MathUtils.clamp(portal.height / Math.tan(solarElevationRad), 0.8, radius * 1.35)
        const patchWidth = THREE.MathUtils.clamp(
          portal.width / Math.max(0.35, directness),
          portal.width * 0.9,
          portal.width * 2.6,
        )
        const patchOpacity = THREE.MathUtils.clamp(0.1 + sunStrength * directness * clampFade * 0.34, 0, 0.46)
        const beamAngle = Math.atan2(sunRayDirection.x, sunRayDirection.z)
        if (patchOpacity <= 0.03) return null
        return (
          <group key={portal.id}>
            <mesh
              position={[patchCenter.x, patchCenter.y + 0.002, patchCenter.z]}
              rotation={[-Math.PI / 2, 0, -beamAngle]}
              scale={[patchWidth * 0.92, patchLength * 0.72, 1]}
            >
              <circleGeometry args={[1, 64]} />
              <meshBasicMaterial color="#fde68a" transparent opacity={patchOpacity * 0.35} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh
              position={[patchCenter.x, patchCenter.y + 0.004, patchCenter.z]}
              rotation={[-Math.PI / 2, 0, -beamAngle]}
              scale={[patchWidth * 0.5, patchLength * 0.5, 1]}
            >
              <circleGeometry args={[1, 64]} />
              <meshBasicMaterial color="#fbbf24" transparent opacity={patchOpacity} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}

      <Html position={[sunVisualOrigin.x, sunVisualOrigin.y + 0.7, sunVisualOrigin.z]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="scene-factor-label">
          <strong>{isNight ? 'No direct sun' : 'Shadow sim'}</strong>
          <span>{sunTimeLabel} - sun from {compassDirLabel(sunMoment.solar_azimuth)}, {sunMoment.solar_elevation.toFixed(0)} deg high</span>
        </div>
      </Html>

      {false && windOffsets.map((offset, index) => {
        const origin = windStart.clone().add(windAcross.clone().multiplyScalar(offset)).setY(0.7 + index * 0.12)
        return <arrowHelper key={offset} args={[windTo, origin, windArrowLength, '#38bdf8', 0.35, 0.22]} />
      })}
      <Html
        position={[center.x + windTo.x * radius * 0.75, 1.15, center.z + windTo.z * radius * 0.75]}
        center
        distanceFactor={9}
        style={{ pointerEvents: 'none' }}
      >
        <div className="scene-factor-label">
          <strong>Wind</strong>
          <span>{env.wind_speed.toFixed(1)} km/h from {compassDirLabel(env.wind_direction)} toward {windTowardLabel}</span>
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
          Wind {environment.wind_speed.toFixed(1)} km/h from {compassDirLabel(environment.wind_direction)} toward {compassDirLabel(environment.wind_direction + 180)}
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
                className={(isPlaying ? Math.round(sampleIndex) === index : sample.time === activeTime || Math.round(sampleIndex) === index) ? 'active' : ''}
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
  bounds: Bounds
  wallSegments: WallCollisionSegment[]
  onTransitionComplete: () => void
  onPointerLockChange: (locked: boolean) => void
  onPoseChange: (position: THREE.Vector3, lookAt: THREE.Vector3) => void
  pointerLockTarget: MutableRefObject<HTMLCanvasElement | null>
}

function SceneRig({
  mode,
  transition,
  overviewPosition,
  overviewLookAt,
  bounds,
  wallSegments,
  onTransitionComplete,
  onPointerLockChange,
  onPoseChange,
  pointerLockTarget,
}: SceneRigProps) {
  const { camera, gl, size } = useThree()
  const keyState = useRef<Record<string, boolean>>({})
  const pointerDelta = useRef({ x: 0, y: 0 })
  const pointerScreen = useRef<{ x: number; y: number } | null>(null)
  const currentYawPitch = useRef({ yaw: 0, pitch: 0 })
  const currentTarget = useRef(overviewLookAt.clone())
  const transitionComplete = useRef(false)
  const overviewAngle = useRef(Math.atan2(overviewPosition.z - overviewLookAt.z, overviewPosition.x - overviewLookAt.x))
  const overviewPause = useRef(false)

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

    const onScreenPointerMove = (event: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) return
      pointerScreen.current = { x: event.clientX, y: event.clientY }
    }

    const onWindowBlur = () => {
      pointerScreen.current = null
    }

    window.addEventListener('pointerlockchange', onPointerLock)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousemove', onScreenPointerMove)
    window.addEventListener('blur', onBlur)
    window.addEventListener('blur', onWindowBlur)

    onPointerLock()

    return () => {
      window.removeEventListener('pointerlockchange', onPointerLock)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousemove', onScreenPointerMove)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [gl.domElement, onPointerLockChange, pointerLockTarget])

  useEffect(() => {
    if (mode === 'overview') {
      const orbit = getOverviewOrbitPose(bounds, overviewAngle.current)
      camera.position.copy(orbit.position)
      currentTarget.current = overviewLookAt.clone()
      camera.lookAt(overviewLookAt)
      currentYawPitch.current = roomHeading(camera.position, overviewLookAt)
      onPoseChange(camera.position, currentTarget.current)
    }
  }, [camera, mode, onPoseChange, overviewLookAt, overviewPosition, bounds])

  useEffect(() => {
    camera.zoom = mode === 'walkthrough' ? WALKTHROUGH_CAMERA_ZOOM : 1
    camera.updateProjectionMatrix()
  }, [camera, mode])

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
      onPoseChange(camera.position, currentTarget.current)
      if (progress >= 1 && !transitionComplete.current) {
        transitionComplete.current = true
        onTransitionComplete()
      }
      return
    }

    if (mode === 'overview') {
      const pointer = pointerScreen.current
      const canvasRect = gl.domElement.getBoundingClientRect()
      const target = overviewLookAt.clone()
      const projected = target.project(camera)
      const targetScreen = {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
      }
      const pointerInsideCanvas =
        pointer !== null &&
        pointer.x >= canvasRect.left &&
        pointer.x <= canvasRect.right &&
        pointer.y >= canvasRect.top &&
        pointer.y <= canvasRect.bottom
      const pointerOverHud = Boolean(
        pointer &&
          typeof document.elementFromPoint === 'function' &&
          document.elementFromPoint(pointer.x, pointer.y)?.closest('.hud-shell'),
      )

      if (!pointerInsideCanvas) {
        overviewPause.current = false
      } else {
        const distanceToTarget = Math.hypot(pointer.x - targetScreen.x, pointer.y - targetScreen.y)
        const modelRadiusWorld = Math.max(bounds.width, bounds.depth) * 0.34
        const cameraDistance = Math.max(camera.position.distanceTo(target), 0.001)
        const perspectiveCamera = camera as THREE.PerspectiveCamera
        const projectedRadius =
          (modelRadiusWorld * size.height) /
          (2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2))
        const stopThreshold = clamp(projectedRadius + 60, 110, 260)
        const resumeThreshold = stopThreshold + 40
        if (distanceToTarget <= stopThreshold) {
          overviewPause.current = true
        } else if (distanceToTarget >= resumeThreshold) {
          overviewPause.current = false
        }
      }

      if (!overviewPause.current) {
        overviewAngle.current += delta * OVERVIEW_ROTATION_SPEED
      }

      if (pointerInsideCanvas && pointer && !pointerOverHud) {
        const normalizedX = (pointer.x - canvasRect.left) / Math.max(1, canvasRect.width)
        const cursorOffset = (normalizedX - 0.5) * 2
        if (Math.abs(cursorOffset) > OVERVIEW_CURSOR_DEADZONE) {
          overviewAngle.current += cursorOffset * delta * OVERVIEW_CURSOR_ROTATE_SPEED
        }
      }

      const orbit = getOverviewOrbitPose(bounds, overviewAngle.current)
      camera.position.copy(orbit.position)
      currentTarget.current.copy(overviewLookAt)
      camera.lookAt(currentTarget.current)
      currentYawPitch.current = roomHeading(camera.position, currentTarget.current)
      onPoseChange(camera.position, currentTarget.current)
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
      const resolved = resolveMovement(camera.position, candidate, bounds, wallSegments)
      camera.position.copy(resolved)
    }

    const lookDirection = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    )
    currentTarget.current.copy(camera.position).add(lookDirection)
    camera.lookAt(currentTarget.current)
    onPoseChange(camera.position, currentTarget.current)
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
  const [hudDashboardRoot, setHudDashboardRoot] = useState<HTMLElement | null>(null)
  const sunAnimationFrame = useRef<number | null>(null)
  const pointerLockTarget = useRef<HTMLCanvasElement | null>(null)
  const currentPoseRef = useRef({
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
  })

  const ppm = schema?.scale.pixels_per_meter ?? 100
  const isFourRoom = String(schema?.flat_type ?? '').toLowerCase().includes('4-room')
  const viewerWalls = useMemo(() => {
    const schemaWalls = schema?.walls ?? []
    return isFourRoom ? [...schemaWalls, ...templateWindowWallsForFourRoom(schemaWalls)] : schemaWalls
  }, [isFourRoom, schema?.walls])
  const bounds = useMemo(() => computeBounds(schema, ppm), [schema, ppm])
  const wallSegments = useMemo(() => buildWallCollisionSegments(viewerWalls, ppm), [viewerWalls, ppm])
  const overviewPosition = useMemo(() => chooseOverviewPosition(bounds), [bounds])
  const overviewLookAt = useMemo(() => new THREE.Vector3(bounds.centerX, 0.6, bounds.centerZ), [bounds])
  const sceneAnchor = useMemo(() => new THREE.Vector3(bounds.centerX, 0, bounds.centerZ), [bounds])
  const showSchemaWalls = Boolean(!glbUrl || modelError || isFourRoom)
  const viewerWindows = useMemo(() => {
    const schemaWindows = (schema?.windows ?? []) as Opening[]
    if (isFourRoom) {
      const fallbackWindows = templateWindowsForFourRoom(viewerWalls)
      return fallbackWindows.length ? fallbackWindows : schemaWindows
    }
    return schemaWindows
  }, [isFourRoom, schema?.windows, viewerWalls])
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
    if (daylightSamples.length && (isSunPlaying || selectedSunTime)) {
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
  const activeSunTime = sunMoment?.time ?? selectedSunTime

  useEffect(() => {
    const syncHudDashboardRoot = () => {
      setHudDashboardRoot(document.getElementById('viewer-hud-dashboard-root'))
    }

    syncHudDashboardRoot()
    const observer = new MutationObserver(syncHudDashboardRoot)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setSelectedRoomId(null)
    setHoveredRoomId(null)
    setMode('overview')
    setTransition(null)
    setModelError(null)
    setPointerLocked(false)
    currentPoseRef.current = {
      position: overviewPosition.clone(),
      lookAt: overviewLookAt.clone(),
    }
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
    let lastTime = performance.now()
    const maxIndex = daylightSamples.length - 1

    const animateDay = (now: number) => {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.12)
      lastTime = now
      setSunSampleIndex((current) => {
        const next = current + deltaSeconds * DAY_ANIMATION_INDEXES_PER_SECOND
        return next >= maxIndex ? 0 : next
      })
      sunAnimationFrame.current = window.requestAnimationFrame(animateDay)
    }

    sunAnimationFrame.current = window.requestAnimationFrame(animateDay)
    return () => {
      if (sunAnimationFrame.current !== null) {
        window.cancelAnimationFrame(sunAnimationFrame.current)
        sunAnimationFrame.current = null
      }
    }
  }, [daylightSamples.length, isSunPlaying])

  const enterWalkthrough = (room: Room) => {
    const canvas = pointerLockTarget.current
    const overviewCam = currentPoseRef.current.position.clone()
    const overviewLook = currentPoseRef.current.lookAt.clone()
    const entryPosition = chooseRoomEntry(room, ppm, overviewCam, bounds)
    const focusPoint = room.polygon.length >= 3 ? polygonCentroid(room.polygon, ppm) : averagePoint(room.polygon, ppm)
    const toLookAt = new THREE.Vector3(focusPoint.x, EYE_HEIGHT, focusPoint.z)
    const fromLookAt = overviewLook

    setSelectedRoomId(room.id)
    setTransition({
      roomId: room.id,
      fromPosition: overviewCam,
      fromLookAt,
      toPosition: entryPosition,
      toLookAt,
      startTime: performance.now() / 1000,
      duration: TRANSITION_SECONDS,
      targetMode: 'walkthrough',
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
    const pose = currentPoseRef.current
    setTransition({
      roomId: selectedRoomId ?? 'overview',
      fromPosition: pose.position.clone(),
      fromLookAt: pose.lookAt.clone(),
      toPosition: overviewPosition.clone(),
      toLookAt: overviewLookAt.clone(),
      startTime: performance.now() / 1000,
      duration: 0.95,
      targetMode: 'overview',
    })
    setMode('transitioning')
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
          <color attach="background" args={['#d3d5d6']} />
          <fog attach="fog" args={['#ccd0d2', 26, 120]} />
          <ambientLight intensity={environment ? 0.14 : 0.32} />
          <hemisphereLight intensity={environment ? 0.24 : 0.42} color="#f2f0ea" groundColor="#7b7367" />
          <directionalLight
            position={[sceneAnchor.x + bounds.width * 0.45, Math.max(bounds.width, bounds.depth) * 1.8 + 12, sceneAnchor.z + bounds.depth * 0.25]}
            intensity={environment ? 0.08 : 1.26}
            color="#fff6e6"
            castShadow={!environment}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.1}
            shadow-camera-far={120}
            shadow-camera-left={-28}
            shadow-camera-right={28}
            shadow-camera-top={28}
            shadow-camera-bottom={-28}
            shadow-bias={-0.0002}
            shadow-normalBias={0.035}
          />
          <directionalLight position={[sceneAnchor.x - 18, 16, sceneAnchor.z - 14]} intensity={environment ? 0.04 : 0.14} color="#d7dde4" />
          <Environment preset="city" background={false} />
          <FloorPlane bounds={bounds} />
          <SceneRig
            mode={mode}
            transition={transition}
            overviewPosition={overviewPosition}
            overviewLookAt={overviewLookAt}
            bounds={bounds}
            wallSegments={wallSegments}
            onTransitionComplete={() => {
              setMode(transition?.targetMode ?? 'overview')
              setTransition(null)
              if (transition?.targetMode === 'overview') {
                setSelectedRoomId(null)
              }
            }}
            onPointerLockChange={setPointerLocked}
            onPoseChange={(position, lookAt) => {
              currentPoseRef.current = {
                position: position.clone(),
                lookAt: lookAt.clone(),
              }
            }}
            pointerLockTarget={pointerLockTarget}
          />
          <Suspense fallback={null}>
          <SceneModel
            glbUrl={glbUrl}
            anchor={sceneAnchor}
            hideWallLikeMeshes={showSchemaWalls}
            onLoadError={(message) => {
              setModelError(message)
            }}
          />
          </Suspense>
          {showSchemaWalls ? (
            <WallOverlay walls={viewerWalls} windows={viewerWindows} ppm={ppm} />
          ) : null}
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

        {modelError ? <div className="viewer-error">{modelError}</div> : null}
        {hudDashboardRoot ? createPortal(
          <div className="viewer-dashboard">
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
          {environment ? (
            <SunSimulatorPanel
              environment={environment}
              samples={daylightSamples}
              sunMoment={sunMoment}
              isPlaying={isSunPlaying}
              sampleIndex={sunSampleIndex}
              activeTime={activeSunTime}
              usesDetectedWindows={Boolean(schema?.windows?.length)}
              onPlayToggle={() => {
                if (isSunPlaying) {
                  setSelectedSunTime(sunMoment?.time ?? selectedSunTime)
                }
                setIsSunPlaying((playing) => !playing)
              }}
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
          </div>,
          hudDashboardRoot,
        ) : null}
      </div>
    </div>
  )
}
