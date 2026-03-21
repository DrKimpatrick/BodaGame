import { create } from 'zustand'

export type GameState = {
  money: number
  fuel: number
  condition: number
  setMoney: (money: number) => void
  setFuel: (fuel: number) => void
  setCondition: (condition: number) => void
}

export const useGameStore = create<GameState>((set) => ({
  money: 0,
  fuel: 100,
  condition: 100,
  setMoney: (money) => set({ money }),
  setFuel: (fuel) => set({ fuel }),
  setCondition: (condition) => set({ condition }),
}))
