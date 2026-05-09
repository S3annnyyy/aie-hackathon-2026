import { ContactShadows, Environment, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const HERO_MODEL_URL = '/models/landing-hero.glb'

type HeroCanvasProps = {
  /**
   * Scroll progress in [0, 1]. The hero camera tilts down and dollies in as
   * progress rises, so the landing story feels like you are leaning closer
   * to the model as you scroll.
   */
  progress: number
}

export function HeroCanvas({ progress }: HeroCanvasProps) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [4, 3, 4], fov: 38, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="h-full w-full"
    >
      <color attach="background" args={['#1a1410']} />
      <fog attach="fog" args={['#1a1410', 12, 28]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        position={[6, 8, 4]}
        intensity={1.4}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-5, 4, -3]} intensity={0.35} color="#b86b4b" />

      <Suspense fallback={null}>
        <Environment preset="sunset" />
        <GroupModel />
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.55}
          scale={14}
          blur={2.2}
          far={4}
          color="#2a221b"
        />
      </Suspense>

      <CinematicCamera progress={progress} reducedMotion={reducedMotion} />
    </Canvas>
  )
}

/**
 * Loads the hero GLB, centers it on the origin, and normalizes its scale so
 * its longest side is ~4 world units regardless of source scene units.
 */
function GroupModel() {
  const { scene } = useGLTF(HERO_MODEL_URL)

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
    const scale = 4 / longest
    cloned.scale.setScalar(scale)

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

type CinematicCameraProps = {
  progress: number
  reducedMotion: boolean
}

/**
 * Orbits the camera slowly while the page is idle, and as the user scrolls
 * we dolly toward the model and tilt down so the landing story feels like
 * approaching a piece in a gallery.
 */
function CinematicCamera({ progress, reducedMotion }: CinematicCameraProps) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3(0, 1.2, 0))
  const clockStart = useRef<number | null>(null)
  const lastProgress = useRef(progress)
  lastProgress.current = progress

  useEffect(() => {
    camera.lookAt(target.current)
  }, [camera])

  useFrame((state) => {
    if (clockStart.current === null) clockStart.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - clockStart.current

    const rawProgress = THREE.MathUtils.clamp(lastProgress.current, 0, 1)
    const ease = rawProgress * rawProgress * (3 - 2 * rawProgress) // smoothstep

    const orbitSpeed = reducedMotion ? 0 : 0.08
    const orbitRadius = THREE.MathUtils.lerp(5.2, 3.6, ease)
    const orbitY = THREE.MathUtils.lerp(2.8, 1.6, ease)
    const orbitAngle = elapsed * orbitSpeed

    const desiredX = Math.sin(orbitAngle) * orbitRadius
    const desiredZ = Math.cos(orbitAngle) * orbitRadius
    const desiredY = orbitY

    const blend = reducedMotion ? 0.18 : 0.05
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, blend)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, blend)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, blend)

    target.current.set(0, THREE.MathUtils.lerp(1.3, 0.9, ease), 0)
    camera.lookAt(target.current)
  })

  return null
}

useGLTF.preload(HERO_MODEL_URL)
