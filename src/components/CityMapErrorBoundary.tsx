import { CITY_TOTAL } from '@game/cityGrid'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RoadNetwork } from './RoadNetwork'

/** Matches `CityMap` ground extent so colliders stay aligned. */
const GROUND_MARGIN = 80

/**
 * If `CityMap` throws (texture load, GPU limits, etc.), Rapier + bike still run but the world
 * would otherwise be empty. This keeps a visible ground plane and road network.
 */
function CityMapDegraded() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[CITY_TOTAL + GROUND_MARGIN, CITY_TOTAL + GROUND_MARGIN]} />
        <meshStandardMaterial color="#4a5d43" roughness={0.92} metalness={0.04} />
      </mesh>
      <RoadNetwork />
    </group>
  )
}

type Props = { children: ReactNode }

type State = { failed: boolean }

export class CityMapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      '[CityMap] render failed — showing degraded world (ground + roads only)',
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.failed) {
      return <CityMapDegraded />
    }
    return this.props.children
  }
}
