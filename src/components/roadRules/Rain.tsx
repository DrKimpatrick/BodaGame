import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Rain streaks in a box that follows the camera. One LineSegments draw call; positions are updated in
 * place each frame (no allocation).
 */
export function Rain({ count = 900 }: { count?: number }) {
  const camera = useThree((s) => s.camera)
  const ref = useRef<THREE.LineSegments>(null)
  const BOX = 22
  const HEIGHT = 14
  const { geo, speeds } = useMemo(() => {
    const pos = new Float32Array(count * 6)
    const sp = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * BOX * 2
      const y = Math.random() * HEIGHT
      const z = (Math.random() - 0.5) * BOX * 2
      pos.set([x, y, z, x + 0.03, y - 0.45, z + 0.02], i * 6)
      sp[i] = 13 + Math.random() * 6
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo: g, speeds: sp }
  }, [count])
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#b9c7d6', transparent: true, opacity: 0.45, depthWrite: false }),
    [],
  )

  useFrame((_, delta) => {
    const ls = ref.current
    if (!ls) return
    const dt = Math.min(delta, 0.05)
    ls.position.set(camera.position.x, camera.position.y - HEIGHT * 0.45, camera.position.z)
    const arr = geo.attributes.position!.array as Float32Array
    for (let i = 0; i < count; i++) {
      const o = i * 6
      const dy = speeds[i]! * dt
      arr[o + 1]! -= dy
      arr[o + 4]! -= dy
      if (arr[o + 1]! < 0) {
        arr[o + 1]! += HEIGHT
        arr[o + 4]! += HEIGHT
      }
    }
    geo.attributes.position!.needsUpdate = true
  })

  return <lineSegments ref={ref} args={[geo, mat]} frustumCulled={false} />
}
