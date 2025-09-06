import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
  avatar?: string
}

interface AuthState {
  // State
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshTokens: () => Promise<boolean>
  setUser: (user: User) => void
  setTokens: (token: string, refreshToken: string) => void
  clearError: () => void
  validateToken: () => boolean
  
  // Internal
  _tokenRefreshPromise: Promise<boolean> | null
}

// Token validation utility
const isTokenExpired = (token: string): boolean => {
  if (!token) return true
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const currentTime = Date.now() / 1000
    const bufferTime = 30 // 30 seconds buffer before expiration
    
    return payload.exp < (currentTime + bufferTime)
  } catch {
    return true
  }
}

// Extract user info from token
const getUserFromToken = (token: string): User | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return {
      id: payload.userId,
      email: payload.email,
      name: payload.name || payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    }
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state - auto-authenticate in dev mode
      user: process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true' ? {
        id: 'dev-user-001',
        email: 'dev@tenderflow.com',
        name: 'Development User',
        role: 'admin',
        tenantId: 'dev-tenant-001',
      } : null,
      token: process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true' ? 'dev-mock-token' : null,
      refreshToken: process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true' ? 'dev-refresh-token' : null,
      isAuthenticated: process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true',
      isLoading: false,
      error: null,
      _tokenRefreshPromise: null,

      // Login action
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('http://localhost:3457/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Login failed' }))
            throw new Error(errorData.message || 'Login failed')
          }

          const data = await response.json()
          const { accessToken, refreshToken } = data

          if (!accessToken || !refreshToken) {
            throw new Error('Invalid response from server')
          }

          const user = getUserFromToken(accessToken)
          if (!user) {
            throw new Error('Invalid token received')
          }

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })

          // Schedule automatic token refresh
          get().scheduleTokenRefresh()
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed'
          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          })
          throw error
        }
      },

      // Logout action
      logout: () => {
        // Clear any pending refresh
        const state = get()
        if (state._tokenRefreshPromise) {
          state._tokenRefreshPromise = null
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          _tokenRefreshPromise: null,
        })

        // Optional: Call logout endpoint to invalidate tokens on server
        fetch('http://localhost:3457/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.token}`,
          },
        }).catch(() => {
          // Ignore errors - we're logging out anyway
        })
      },

      // Token refresh with concurrency protection
      refreshTokens: async (): Promise<boolean> => {
        const state = get()
        
        // Return existing promise if refresh is already in progress
        if (state._tokenRefreshPromise) {
          return state._tokenRefreshPromise
        }

        if (!state.refreshToken) {
          get().logout()
          return false
        }

        // Create refresh promise
        const refreshPromise = (async (): Promise<boolean> => {
          try {
            const response = await fetch('http://localhost:3457/api/v1/auth/refresh', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                refreshToken: state.refreshToken,
              }),
            })

            if (!response.ok) {
              throw new Error('Token refresh failed')
            }

            const data = await response.json()
            const { accessToken, refreshToken } = data

            const user = getUserFromToken(accessToken)
            if (!user) {
              throw new Error('Invalid refreshed token')
            }

            set({
              user,
              token: accessToken,
              refreshToken,
              isAuthenticated: true,
              error: null,
              _tokenRefreshPromise: null,
            })

            // Schedule next refresh
            get().scheduleTokenRefresh()
            return true
          } catch (error) {
            console.error('Token refresh failed:', error)
            set({ _tokenRefreshPromise: null })
            get().logout()
            return false
          }
        })()

        set({ _tokenRefreshPromise: refreshPromise })
        return refreshPromise
      },

      // Utility actions
      setUser: (user: User) => set({ user }),
      
      setTokens: (token: string, refreshToken: string) => {
        const user = getUserFromToken(token)
        set({
          user,
          token,
          refreshToken,
          isAuthenticated: !!user,
          error: null,
        })
        get().scheduleTokenRefresh()
      },

      clearError: () => set({ error: null }),

      validateToken: (): boolean => {
        // Skip validation in dev mode
        if (process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true') {
          return true
        }
        const { token } = get()
        if (!token) return false
        return !isTokenExpired(token)
      },

      // Schedule automatic token refresh (75% of token lifetime)
      scheduleTokenRefresh: () => {
        // Skip in dev mode
        if (process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true') {
          return
        }
        
        const { token } = get()
        if (!token) return

        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          const expirationTime = payload.exp * 1000 // Convert to milliseconds
          const currentTime = Date.now()
          const tokenLifetime = expirationTime - currentTime
          const refreshTime = tokenLifetime * 0.75 // Refresh at 75% of lifetime

          if (refreshTime > 0) {
            setTimeout(() => {
              const currentState = get()
              if (currentState.isAuthenticated && currentState.token) {
                currentState.refreshTokens()
              }
            }, refreshTime)
          }
        } catch (error) {
          console.error('Failed to schedule token refresh:', error)
        }
      },
    }),
    {
      name: 'tenderflow-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Validate token on rehydration
          if (state.token && !state.validateToken()) {
            // Token expired, try to refresh
            state.refreshTokens().catch(() => {
              state.logout()
            })
          } else if (state.token && state.validateToken()) {
            // Token is valid, schedule next refresh
            state.scheduleTokenRefresh()
          }
        }
      },
    }
  )
)