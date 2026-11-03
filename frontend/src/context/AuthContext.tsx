import { useEffect, useState, type ReactNode } from 'react'
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  type CurrentUserResponse,
  type LoginUserRequest,
} from '../services/authService'
import { AuthContext, type AuthStatus } from './authContextStore'

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<CurrentUserResponse | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    sessionStorage.getItem('access_token') ? 'loading' : 'unauthenticated',
  )

  useEffect(() => {
    let active = true
    const token = sessionStorage.getItem('access_token')

    if (!token) {
      return () => {
        active = false
      }
    }

    getCurrentUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser)
          setStatus('authenticated')
        }
      })
      .catch((error: unknown) => {
        if (!active) return

        if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error &&
          typeof error.response === 'object' &&
          error.response !== null &&
          'status' in error.response &&
          error.response.status === 401
        ) {
          sessionStorage.removeItem('access_token')
        }

        setUser(null)
        setStatus('unauthenticated')
      })

    return () => {
      active = false
    }
  }, [])

  async function login(
    credentials: LoginUserRequest,
  ): Promise<CurrentUserResponse> {
    setStatus('loading')

    try {
      const { access_token: accessToken } = await loginUser(credentials)
      sessionStorage.setItem('access_token', accessToken)

      const currentUser = await getCurrentUser()
      setUser(currentUser)
      setStatus('authenticated')
      return currentUser
    } catch (error) {
      sessionStorage.removeItem('access_token')
      setUser(null)
      setStatus('unauthenticated')
      throw error
    }
  }

  function logout() {
    const token = sessionStorage.getItem('access_token')
    const revocationRequest = token ? logoutUser(token) : null

    sessionStorage.removeItem('access_token')
    setUser(null)
    setStatus('unauthenticated')

    if (revocationRequest) {
      void revocationRequest.catch(() => undefined)
    }
  }

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
