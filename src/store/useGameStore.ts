import { create } from 'zustand'

export type GameState = {
  money: number
  fuel: number
  condition: number
  /** Display speed (KM/H), updated from physics — keep updates throttled in Boda. */
  speedKmh: number
  setMoney: (money: number) => void
  setFuel: (fuel: number) => void
  setCondition: (condition: number) => void
  setSpeedKmh: (speedKmh: number) => void
}

export const useGameStore = create<GameState>((set) => ({
  money: 0,
  fuel: 100,
  condition: 100,
  speedKmh: 0,
  setMoney: (money) => set({ money }),
  setFuel: (fuel) => set({ fuel }),
  setCondition: (condition) => set({ condition }),
  setSpeedKmh: (speedKmh) => set({ speedKmh }),
}))
