import { createContext, useContext } from 'react'
import type { AppState } from '@shared/types'

export interface AppContextValue {
  state: AppState | null
  loading: boolean
  refresh: () => Promise<AppState | null>
  setState: (next: AppState) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppContext 未初始化')
  return value
}
