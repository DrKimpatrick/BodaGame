import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  Component,
  useMemo,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import * as THREE from 'three'

type Props = {
  url: string
  leanRef: MutableRefObject<number>
  pitch?: number
  scale?: number
}

/**
 * Humanoid from a local or reachable GLB URL only.
 * Do not hard-code remote URLs — DNS/offline will crash the Canvas if load fails.
 */
export function RiderAvatar({ url, leanRef, pitch = 0.22, scale = 1.05 }: Props) {
  const { scene } = useGLTF(url)
  const root = useMemo(() => {
    const g = new THREE.Group()
    const clone = scene.clone(true)
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    g.add(clone)
    return g
  }, [scene])

  useFrame(() => {
    const z = leanRef.current
    root.rotation.z = z
    root.rotation.x = pitch
  })

  return (
    <group position={[0, -0.85, 0.15]} scale={scale}>
      <primitive object={root} rotation={[0, Math.PI, 0]} />
    </group>
  )
}

type BoundaryProps = { children: ReactNode; fallback: ReactNode }
type BoundaryState = { failed: boolean }

/** Catches useGLTF / Suspense failures so WebGL context is not lost. */
export class GlbLoadErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(err: Error, _info: ErrorInfo) {
    console.warn('[Rider GLB]', err.message)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
