import { createContext } from 'react'
import type { CurrentUserResponse, LoginUserRequest } from '../services/authService'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  user: CurrentUserResponse | null
  status: AuthStatus
  login: (credentials: LoginUserRequest) => Promise<CurrentUserResponse>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
