import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useMemo, useState, type ReactNode } from 'react'
import * as THREE from 'three'

import type { LayoutSchema, Room } from '../../lib/api'

type Props = {
  glbUrl: string | null
  schema: LayoutSchema | null
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
      <meshStandardMaterial color="#59a9a3" transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function Viewer3D({ glbUrl, schema }: Props) {
  const [selected, setSelected] = useState<Room | null>(null)
  const ppm = schema?.scale.pixels_per_meter ?? 100

  return (
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
            <OrbitControls makeDefault />
          </Canvas>
        </ViewerErrorBoundary>
      </div>
      {selected ? (
        <div style={{ marginTop: '0.75rem' }}>
          <strong>{selected.name}</strong>
          <div className="muted">Type: {selected.type}</div>
          <div className="muted">Area: {selected.estimated_area_sqm ?? 'Estimated'}</div>
          <div className="muted">Source page: {selected.source_page ?? schema?.source_page ?? 'N/A'}</div>
          <div className="muted">Notes: {selected.notes ?? schema?.notes ?? 'N/A'}</div>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Click a room overlay to inspect metadata.
        </p>
      )}
    </div>
  )
}
