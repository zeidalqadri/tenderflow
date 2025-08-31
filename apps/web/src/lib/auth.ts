import { NextRequest, NextResponse } from 'next/server'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@tenderflow/shared'

export function getAuthUser() {
  return useAuthStore.getState().user
}

export function getAuthToken() {
  return useAuthStore.getState().token
}

export function isAuthenticated() {
  return useAuthStore.getState().isAuthenticated
}

export function hasRole(role: UserRole): boolean {
  const user = getAuthUser()
  return user?.role === role
}

export function hasAnyRole(roles: UserRole[]): boolean {
  const user = getAuthUser()
  return user ? roles.includes(user.role) : false
}

export function hasPermission(permission: string): boolean {
  const user = getAuthUser()
  if (!user) return false

  // Define role hierarchy and permissions
  const rolePermissions: Record<UserRole, string[]> = {
    [UserRole.ADMIN]: [
      'tender:create',
      'tender:read',
      'tender:update',
      'tender:delete',
      'user:create',
      'user:read', 
      'user:update',
      'user:delete',
      'document:upload',
      'document:read',
      'document:delete',
      'system:manage',
    ],
    [UserRole.MANAGER]: [
      'tender:create',
      'tender:read',
      'tender:update',
      'tender:delete',
      'user:read',
      'document:upload',
      'document:read',
      'document:delete',
    ],
    [UserRole.PARTICIPANT]: [
      'tender:read',
      'tender:update', // Only assigned tenders
      'document:upload',
      'document:read',
    ],
    [UserRole.VIEWER]: [
      'tender:read',
      'document:read',
    ],
  }

  return rolePermissions[user.role]?.includes(permission) ?? false
}

// HOC for protecting routes
export function requireAuth<T extends Record<string, any>>(
  Component: React.ComponentType<T>
) {
  return function AuthenticatedComponent(props: T) {
    const { isAuthenticated, isLoading } = useAuthStore()

    if (isLoading) {
      return <div>Loading...</div>
    }

    if (!isAuthenticated) {
      // This should be handled by middleware, but as a fallback
      window.location.href = '/login'
      return null
    }

    return <Component {...props} />
  }
}

// HOC for role-based access control
export function requireRole<T extends Record<string, any>>(
  roles: UserRole[],
  fallbackComponent?: React.ComponentType
) {
  return function (Component: React.ComponentType<T>) {
    return function RoleProtectedComponent(props: T) {
      const { user, isAuthenticated } = useAuthStore()

      if (!isAuthenticated || !user) {
        window.location.href = '/login'
        return null
      }

      if (!roles.includes(user.role)) {
        if (fallbackComponent) {
          const FallbackComponent = fallbackComponent
          return <FallbackComponent />
        }
        return (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">
                You don't have permission to access this page.
              </p>
            </div>
          </div>
        )
      }

      return <Component {...props} />
    }
  }
}

// Middleware helper for server-side auth
export function createAuthMiddleware(
  requiredRoles?: UserRole[],
  redirectTo: string = '/login'
) {
  return function authMiddleware(request: NextRequest) {
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }

    // In a real implementation, you'd verify the JWT token here
    // For now, we'll assume the token is valid if it exists
    
    if (requiredRoles) {
      // Extract user role from token (you'd decode JWT in real implementation)
      // For now, we'll skip this check
    }

    return NextResponse.next()
  }
}

// Auth persistence helper
export function persistAuth(token: string) {
  // Store token in httpOnly cookie (this would be done server-side)
  document.cookie = `auth-token=${token}; path=/; secure; samesite=strict`
}

export function clearPersistedAuth() {
  document.cookie = 'auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}