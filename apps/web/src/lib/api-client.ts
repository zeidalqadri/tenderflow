import { useAuthStore } from '@/stores/auth-store'
import type { 
  APIResponse, 
  PaginatedResponse,
  User,
  Tender,
  TenderDocument,
  PaginationParams
} from '@tenderflow/shared'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3457'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class ApiClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = useAuthStore.getState().token

    const url = `${this.baseURL}${endpoint}`
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        let errorData = null

        try {
          errorData = await response.json()
          errorMessage = errorData.message || errorData.error || errorMessage
        } catch {
          // If we can't parse the error response, use the status text
          errorMessage = response.statusText || errorMessage
        }

        throw new ApiError(errorMessage, response.status, errorData)
      }

      // Handle empty responses (like 204 No Content)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T
      }

      return await response.json()
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      // Network or other fetch errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error occurred',
        0
      )
    }
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<APIResponse<{ user: User; token: string }>> {
    return this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  async register(userData: {
    name: string
    email: string
    password: string
  }): Promise<APIResponse<{ user: User; token: string }>> {
    return this.request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    })
  }

  async refreshToken(): Promise<APIResponse<{ token: string }>> {
    return this.request('/api/v1/auth/refresh', { method: 'POST' })
  }

  async logout(): Promise<APIResponse<void>> {
    return this.request('/api/v1/auth/logout', { method: 'POST' })
  }

  async me(): Promise<APIResponse<User>> {
    return this.request('/api/v1/auth/me')
  }

  // Tender endpoints
  async getTenders(params: PaginationParams & {
    status?: string
    search?: string
    assignee?: string
  } = { page: 1, limit: 20 }): Promise<PaginatedResponse<Tender>> {
    const searchParams = new URLSearchParams()
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value))
      }
    })

    return this.request(`/api/v1/tenders?${searchParams}`)
  }

  async getTender(id: string): Promise<APIResponse<Tender>> {
    return this.request(`/api/v1/tenders/${id}`)
  }

  async createTender(tender: Omit<Tender, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'documents' | 'participants'>): Promise<APIResponse<Tender>> {
    return this.request('/api/v1/tenders', {
      method: 'POST',
      body: JSON.stringify(tender),
    })
  }

  async updateTender(
    id: string, 
    updates: Partial<Omit<Tender, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>
  ): Promise<APIResponse<Tender>> {
    return this.request(`/api/v1/tenders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteTender(id: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/tenders/${id}`, { method: 'DELETE' })
  }

  // Document endpoints
  async uploadDocument(
    tenderId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<APIResponse<TenderDocument>> {
    const formData = new FormData()
    formData.append('file', file)

    // Create XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const token = useAuthStore.getState().token

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100
          onProgress(progress)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            resolve(response)
          } catch (error) {
            reject(new ApiError('Invalid JSON response', xhr.status))
          }
        } else {
          try {
            const errorResponse = JSON.parse(xhr.responseText)
            reject(new ApiError(
              errorResponse.message || 'Upload failed',
              xhr.status,
              errorResponse
            ))
          } catch {
            reject(new ApiError('Upload failed', xhr.status))
          }
        }
      }

      xhr.onerror = () => {
        reject(new ApiError('Network error during upload', 0))
      }

      xhr.open('POST', `${this.baseURL}/api/v1/tenders/${tenderId}/documents`)
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }

      xhr.send(formData)
    })
  }

  async getDocuments(tenderId: string): Promise<APIResponse<TenderDocument[]>> {
    return this.request(`/api/v1/tenders/${tenderId}/documents`)
  }

  async deleteDocument(tenderId: string, documentId: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/tenders/${tenderId}/documents/${documentId}`, {
      method: 'DELETE'
    })
  }

  // User endpoints
  async getUsers(params: PaginationParams = { page: 1, limit: 20 }): Promise<PaginatedResponse<User>> {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value))
      }
    })

    return this.request(`/api/v1/users?${searchParams}`)
  }

  async updateUserProfile(updates: Partial<Pick<User, 'name' | 'email'>>): Promise<APIResponse<User>> {
    return this.request('/api/v1/users/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  // Health check
  async healthCheck(): Promise<APIResponse<{ status: string; timestamp: string }>> {
    return this.request('/health')
  }
}

// Export singleton instance
export const apiClient = new ApiClient()

// Export the ApiError for use in components
export { ApiError }