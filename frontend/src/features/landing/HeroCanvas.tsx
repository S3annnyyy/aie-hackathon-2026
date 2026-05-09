import { ContactShadows, Environment, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export type HeroFrame =
  | 'hero'
  | 'wide'
  | 'orbit-block'
  | 'dolly-in'
  | 'interior'
  | 'interior-close'

const HERO_MODEL_URL = '/models/landing-hero.glb'

export type HeroCanvasProps = {
  /**
   * Scroll progress in [0, 1]. Drives the Act 1 hero camera push-in; ignored
   * once a `frame` is set, so the split-panel chapters don't fight.
   */
  progress?: number
  /**
   * Discrete framing driven by the active landing chapter. Falls back to
   * `"hero"` for the landing hero section.
   */
  frame?: HeroFrame
  /** Paints the canvas background. Transparent by default so split panels can show their own surface. */
  background?: string | null
  /** Show fog? Only looks right on dark backgrounds. */
  fog?: boolean
  /** Freeze the camera at its frame pose — no idle orbit, no scroll push-in. */
  still?: boolean
}

export function HeroCanvas({
  progress = 0,
  frame = 'hero',
  background = null,
  fog = false,
  still = false,
}: HeroCanvasProps) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [4, 3, 4], fov: 38, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: background === null }}
      className="h-full w-full"
    >
      {background !== null ? <color attach="background" args={[background]} /> : null}
      {fog ? <fog attach="fog" args={['#1a1410', 12, 28]} /> : null}

      <ambientLight intensity={0.4} />
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

      <CinematicCamera
        progress={progress}
        frame={frame}
        reducedMotion={reducedMotion || still}
      />
    </Canvas>
  )
}

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

type CameraPose = {
  /** Orbit radius in world units. */
  radius: number
  /** Camera Y in world units. */
  height: number
  /** Phase offset added to the slow idle orbit, in radians. */
  phase: number
  /** Look-at point Y in world units. */
  targetY: number
  /** Background orbit speed multiplier. 1 = nominal, 0 = static. */
  orbitSpeed: number
}

const FRAME_POSES: Record<HeroFrame, CameraPose> = {
  hero: { radius: 5.2, height: 2.8, phase: 0, targetY: 1.3, orbitSpeed: 1 },
  wide: { radius: 6.8, height: 3.6, phase: Math.PI * 0.15, targetY: 1.5, orbitSpeed: 0.7 },
  'orbit-block': { radius: 4.8, height: 2.4, phase: Math.PI * 0.6, targetY: 1.3, orbitSpeed: 1.2 },
  'dolly-in': { radius: 3.2, height: 1.8, phase: Math.PI * 0.9, targetY: 1.0, orbitSpeed: 0.5 },
  interior: { radius: 2.2, height: 1.4, phase: Math.PI * 1.15, targetY: 1.2, orbitSpeed: 0.4 },
  'interior-close': {
    radius: 1.6,
    height: 1.2,
    phase: Math.PI * 1.4,
    targetY: 1.1,
    orbitSpeed: 0.3,
  },
}

type CinematicCameraProps = {
  progress: number
  frame: HeroFrame
  reducedMotion: boolean
}

function CinematicCamera({ progress, frame, reducedMotion }: CinematicCameraProps) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3(0, 1.2, 0))
  const clockStart = useRef<number | null>(null)
  const lastProgress = useRef(progress)
  const lastFrame = useRef<HeroFrame>(frame)
  lastProgress.current = progress
  lastFrame.current = frame

  useEffect(() => {
    camera.lookAt(target.current)
  }, [camera])

  useFrame((state) => {
    if (clockStart.current === null) clockStart.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - clockStart.current

    const pose = FRAME_POSES[lastFrame.current] ?? FRAME_POSES.hero
    const rawProgress = THREE.MathUtils.clamp(lastProgress.current, 0, 1)
    const ease = rawProgress * rawProgress * (3 - 2 * rawProgress)

    // Hero chapter gets the scroll-driven push; split-panel chapters use the
    // frame pose directly.
    const radius =
      lastFrame.current === 'hero'
        ? THREE.MathUtils.lerp(pose.radius, pose.radius * 0.68, ease)
        : pose.radius
    const height =
      lastFrame.current === 'hero'
        ? THREE.MathUtils.lerp(pose.height, pose.height * 0.58, ease)
        : pose.height

    const baseOrbitSpeed = reducedMotion ? 0 : 0.07 * pose.orbitSpeed
    // Hero sweeps right→left (viewer's POV); chapter frames keep the original
    // direction so the panel scenes orbit toward the pose they were tuned for.
    const directionSign = lastFrame.current === 'hero' ? -1 : 1
    const angle = elapsed * baseOrbitSpeed * directionSign + pose.phase

    const desiredX = Math.sin(angle) * radius
    const desiredZ = Math.cos(angle) * radius

    // A larger blend smoothly interpolates when `frame` switches; we lean on
    // the lerp rather than per-frame tween libraries.
    const blend = reducedMotion ? 0.22 : 0.04
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, blend)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, height, blend)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, blend)

    target.current.y = THREE.MathUtils.lerp(target.current.y, pose.targetY, blend)
    camera.lookAt(target.current)
  })

  return null
}

useGLTF.preload(HERO_MODEL_URL)
