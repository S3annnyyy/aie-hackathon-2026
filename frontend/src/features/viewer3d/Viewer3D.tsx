import { Environment, Html, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import * as THREE from 'three'

import type { LayoutSchema, Room, Wall } from '../../lib/api'

type Props = {
  glbUrl: string | null
  schema: LayoutSchema | null
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
const WINDOW_SILL_HEIGHT = 0.88
const OVERVIEW_ROTATION_SPEED = 0.12
const INITIAL_OVERVIEW_ANGLE = Math.PI / 4
const OVERVIEW_RADIUS_MULTIPLIER = 0.95 * Math.SQRT2
const WALL_COLLISION_BUFFER = 0.22
const WALL_GREY = '#c9c7c1'
const FLOOR_TONE = '#786d60'
const FLOOR_TONE_DEEP = '#675b4f'

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

function WallOverlay({ walls, ppm }: { walls: Wall[]; ppm: number }) {
  if (!walls.length) return null

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

        return (
          <group key={wall.id} position={[centerX, FLOOR_HEIGHT, centerZ]} rotation={[0, -angle, 0]}>
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
          </group>
        )
      })}
    </group>
  )
}

function WindowOverlay({ windows, walls, ppm }: { windows: Opening[]; walls: Wall[]; ppm: number }) {
  if (!windows.length || !walls.length) return null

  const wallById = new Map(walls.map((wall) => [wall.id, wall]))

  const resolveWall = (opening: Opening) => {
    if (opening.wall_id && wallById.has(opening.wall_id)) {
      return wallById.get(opening.wall_id) ?? null
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

  return (
    <group>
      {windows.map((opening) => {
        const wall = resolveWall(opening)
        if (!wall) return null

        const start = toWorldPoint(wall.start, ppm)
        const end = toWorldPoint(wall.end, ppm)
        const center = toWorldPoint(opening.center, ppm)
        const angle = Math.atan2(end.z - start.z, end.x - start.x)
        const width = Math.max(0.18, opening.width_m)
        const height = Math.max(0.28, opening.height_m)
        const depth = Math.max(0.03, wall.thickness_m * 0.86)
        const sillHeight = WINDOW_SILL_HEIGHT
        const y = FLOOR_HEIGHT + sillHeight + height / 2

        return (
          <group key={opening.id} position={[center.x, y, center.z]} rotation={[0, -angle, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[width * 1.12, height * 1.12, depth]} />
              <meshStandardMaterial
                color="#8b9095"
                roughness={0.82}
                metalness={0}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={2}
                polygonOffsetUnits={2}
              />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0, 0.001]}>
              <boxGeometry args={[width * 0.82, height * 0.82, Math.max(0.012, depth * 0.22)]} />
              <meshPhysicalMaterial
                color="#d9e3eb"
                roughness={0.06}
                metalness={0}
                transmission={0.75}
                transparent
                opacity={0.2}
                ior={1.45}
                thickness={0.03}
                clearcoat={0.55}
                clearcoatRoughness={0.12}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0, depth * 0.36]}>
              <boxGeometry args={[Math.max(0.03, width * 0.05), height * 0.92, depth * 0.16]} />
              <meshStandardMaterial color="#6f7478" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0, -depth * 0.36]}>
              <boxGeometry args={[Math.max(0.03, width * 0.05), height * 0.92, depth * 0.16]} />
              <meshStandardMaterial color="#6f7478" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0, 0]}>
              <boxGeometry args={[width * 1.08, Math.max(0.03, height * 0.05), depth * 0.16]} />
              <meshStandardMaterial color="#6f7478" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
            </mesh>
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

function AlignedGlbModel({ url, anchor }: { url: string; anchor: THREE.Vector3 }) {
  const { scene } = useGLTF(url)
  const [offset, setOffset] = useState(() => new THREE.Vector3())

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true

        const kind = classifyInteriorSurface(mesh)
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

export function Viewer3D({ glbUrl, schema }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewerMode>('overview')
  const [transition, setTransition] = useState<TransitionState | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [pointerLocked, setPointerLocked] = useState(false)
  const pointerLockTarget = useRef<HTMLCanvasElement | null>(null)
  const currentPoseRef = useRef({
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
  })

  const ppm = schema?.scale.pixels_per_meter ?? 100
  const bounds = useMemo(() => computeBounds(schema, ppm), [schema, ppm])
  const wallSegments = useMemo(() => buildWallCollisionSegments(schema?.walls ?? [], ppm), [schema?.walls, ppm])
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
  const selectedRoom = useMemo(
    () => rooms.find((entry) => entry.room.id === selectedRoomId)?.room ?? null,
    [rooms, selectedRoomId],
  )

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
          <ambientLight intensity={0.32} />
          <hemisphereLight intensity={0.42} color="#f2f0ea" groundColor="#7b7367" />
          <directionalLight
            position={[sceneAnchor.x + bounds.width * 0.45, Math.max(bounds.width, bounds.depth) * 1.8 + 12, sceneAnchor.z + bounds.depth * 0.25]}
            intensity={1.26}
            color="#fff6e6"
            castShadow
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
          <directionalLight position={[sceneAnchor.x - 18, 16, sceneAnchor.z - 14]} intensity={0.14} color="#d7dde4" />
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
            onLoadError={(message) => {
              setModelError(message)
            }}
          />
          </Suspense>
          <WallOverlay walls={schema?.walls ?? []} ppm={ppm} />
          <WindowOverlay windows={(schema?.windows as Opening[]) ?? []} walls={schema?.walls ?? []} ppm={ppm} />
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
      </div>
    </div>
  )
}
