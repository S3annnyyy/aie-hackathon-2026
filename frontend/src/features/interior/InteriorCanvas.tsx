import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'

const MODEL_URL = '/models/landing-hero.glb'

export function InteriorCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [3.2, 2.4, 3.2], fov: 44, near: 0.05, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="h-full w-full"
    >
      <color attach="background" args={['#1a1410']} />
      <fog attach="fog" args={['#1a1410', 14, 32]} />

      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        position={[6, 8, 4]}
        intensity={1.3}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-5, 4, -3]} intensity={0.35} color="#b86b4b" />

      <Suspense fallback={null}>
        <Environment preset="sunset" />
        <Model />
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.55}
          scale={16}
          blur={2.2}
          far={5}
          color="#2a221b"
        />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={10}
        target={[0, 1, 0]}
      />
    </Canvas>
  )
}

function Model() {
  const { scene } = useGLTF(MODEL_URL)
  const prepared = useMemo(() => {
    const cloned = scene.clone(true)
    const box = new THREE.Box3().setFromObject(cloned)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    cloned.position.sub(center)
    cloned.position.y += size.y / 2

    const longest = Math.max(size.x, size.y, size.z) || 1
    cloned.scale.setScalar(4 / longest)

    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    return cloned
  }, [scene])

  return <primitive object={prepared} />
}

useGLTF.preload(MODEL_URL)
