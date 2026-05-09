import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import {
  Component,
  Suspense,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import * as THREE from 'three'

import type { LayoutSchema, Room } from '../../lib/api'

export type ViewportCapture = {
  /** Captured PNG as a Blob for uploading to image APIs. */
  blob: Blob
  /** Object URL for previewing the capture in the UI. Caller must revokeObjectURL when done. */
  objectUrl: string
  /** Pixel dimensions of the captured image. */
  width: number
  height: number
}

export type Viewer3DHandle = {
  /**
   * Captures the current canvas frame as a PNG blob. Forces a synchronous
   * render before reading pixels to avoid a blank capture on some GPUs.
   */
  captureViewport(): Promise<ViewportCapture | null>
}

type Viewer3DProps = {
  glbUrl: string | null
  schema: LayoutSchema | null
  onRoomSelect?: (room: Room | null) => void
}

type ViewerErrorBoundaryProps = {
  children: ReactNode
}

type ViewerErrorBoundaryState = {
  hasError: boolean
}

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

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

type RoomMeshProps = {
  room: Room
  ppm: number
  onClick: (room: Room) => void
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
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.03, 0]}
      onClick={() => onClick(room)}
    >
      <meshStandardMaterial color="#7c8a6a" transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Exposes the renderer + scene + camera to the parent via a shared handle. */
type CaptureBridgeProps = {
  bridgeRef: { current: CaptureBridge | null }
}

type CaptureBridge = {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
}

function CaptureBridge({ bridgeRef }: CaptureBridgeProps) {
  const { gl, scene, camera } = useThree()
  bridgeRef.current = { gl, scene, camera }
  return null
}

export const Viewer3D = forwardRef(function Viewer3D(
  { glbUrl, schema, onRoomSelect }: Viewer3DProps,
  ref: Ref<Viewer3DHandle>,
) {
  const [selected, setSelected] = useState<Room | null>(null)
  const ppm = schema?.scale.pixels_per_meter ?? 100
  const bridgeRef = useRef<CaptureBridge | null>(null)

  const handleSelect = (room: Room | null) => {
    setSelected(room)
    onRoomSelect?.(room)
  }

  useImperativeHandle(ref, () => ({
    async captureViewport() {
      const bridge = bridgeRef.current
      if (!bridge) return null

      // Force a fresh render so the framebuffer holds the current frame.
      bridge.gl.render(bridge.scene, bridge.camera)
      const canvas = bridge.gl.domElement

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) return null

      return {
        blob,
        objectUrl: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
      }
    },
  }))

  return (
    <div className="card">
      <h3 className="mb-2 text-base font-semibold">3D Viewer</h3>
      <div className="viewer-wrap">
        <ViewerErrorBoundary key={glbUrl ?? 'no-glb'}>
          <Canvas
            camera={{ position: [6, 6, 6], fov: 48 }}
            gl={{ preserveDrawingBuffer: true }}
          >
            <CaptureBridge bridgeRef={bridgeRef} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 8, 2]} intensity={0.9} />
            <gridHelper args={[20, 20, '#d6c9b4', '#ebe3d4']} />
            <Suspense fallback={null}>{glbUrl ? <GlbModel url={glbUrl} /> : null}</Suspense>
            {schema?.rooms.map((room) => (
              <RoomMesh key={room.id} room={room} ppm={ppm} onClick={handleSelect} />
            ))}
            <OrbitControls makeDefault />
          </Canvas>
        </ViewerErrorBoundary>
      </div>
      {selected ? (
        <div className="mt-3">
          <strong>{selected.name}</strong>
          <div className="muted">Type: {selected.type}</div>
          <div className="muted">Area: {selected.estimated_area_sqm ?? 'Estimated'}</div>
          <div className="muted">
            Source page: {selected.source_page ?? schema?.source_page ?? 'N/A'}
          </div>
          <div className="muted">Notes: {selected.notes ?? schema?.notes ?? 'N/A'}</div>
        </div>
      ) : (
        <p className="muted mt-3">Click a room overlay to inspect metadata.</p>
      )}
    </div>
  )
})
