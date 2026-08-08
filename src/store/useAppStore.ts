import { create } from 'zustand'
import type { StudyMode, User } from '@/lib/types'

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface AppState {
  /** 当前学习模式：加班没空 / 半天备考 / 全天摸鱼 */
  currentMode: StudyMode
  /** 当前日期 YYYY-MM-DD */
  currentDate: string
  /** 当前用户（匿名登录后填充） */
  user: User | null

  setMode: (mode: StudyMode) => void
  setDate: (date: string) => void
  setUser: (user: User | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentMode: 'halfday',
  currentDate: todayStr(),
  user: null,

  setMode: (mode) => set({ currentMode: mode }),
  setDate: (date) => set({ currentDate: date }),
  setUser: (user) => set({ user }),
}))

export { todayStr }
