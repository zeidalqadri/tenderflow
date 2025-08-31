import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions 
} from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { useTenderStore } from '@/stores/tender-store'
import { useUIStore } from '@/stores/ui-store'
import type { 
  User, 
  Tender, 
  TenderDocument,
  PaginationParams,
  APIResponse,
  PaginatedResponse 
} from '@tenderflow/shared'

// Query Keys
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  tenders: {
    all: ['tenders'] as const,
    lists: () => [...queryKeys.tenders.all, 'list'] as const,
    list: (params: any) => [...queryKeys.tenders.lists(), params] as const,
    details: () => [...queryKeys.tenders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tenders.details(), id] as const,
    documents: (tenderId: string) => [...queryKeys.tenders.detail(tenderId), 'documents'] as const,
  },
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (params: any) => [...queryKeys.users.lists(), params] as const,
  },
} as const

// Auth Hooks
export function useMe(options?: Omit<UseQueryOptions<APIResponse<User>, ApiError>, 'queryKey' | 'queryFn'>) {
  const { isAuthenticated } = useAuthStore()
  
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.me(),
    enabled: isAuthenticated,
    retry: (failureCount, error) => {
      // Don't retry on 401 errors (unauthorized)
      if (error.status === 401) {
        useAuthStore.getState().logout()
        return false
      }
      return failureCount < 3
    },
    ...options,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  const { login } = useAuthStore()
  const { addNotification } = useUIStore()

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiClient.login(email, password),
    onSuccess: (response) => {
      if (response.success && response.data) {
        login(response.data.user, response.data.token)
        queryClient.setQueryData(queryKeys.auth.me, response.data.user)
        addNotification({
          type: 'success',
          title: 'Welcome back!',
          message: `Logged in as ${response.data.user.name}`,
        })
      }
    },
    onError: (error: ApiError) => {
      addNotification({
        type: 'error',
        title: 'Login failed',
        message: error.message,
      })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: () => apiClient.logout(),
    onSettled: () => {
      logout()
      queryClient.clear() // Clear all cached data
      window.location.href = '/login'
    },
  })
}

// Tender Hooks
export function useTenders(
  params: PaginationParams & {
    status?: string
    search?: string
    assignee?: string
  } = { page: 1, limit: 20 },
  options?: Omit<UseQueryOptions<PaginatedResponse<Tender>, ApiError>, 'queryKey' | 'queryFn'>
) {
  const { setTenders, setPagination, setError } = useTenderStore()

  return useQuery({
    queryKey: queryKeys.tenders.list(params),
    queryFn: () => apiClient.getTenders(params),
    onSuccess: (data) => {
      if (data.success && data.data && data.pagination) {
        setTenders(data.data)
        setPagination(data.pagination)
        setError(null)
      }
    },
    onError: (error) => {
      setError(error.message)
    },
    staleTime: 30000, // 30 seconds
    ...options,
  })
}

export function useTender(id: string, options?: Omit<UseQueryOptions<APIResponse<Tender>, ApiError>, 'queryKey' | 'queryFn'>) {
  const { selectTender, setError } = useTenderStore()

  return useQuery({
    queryKey: queryKeys.tenders.detail(id),
    queryFn: () => apiClient.getTender(id),
    enabled: !!id,
    onSuccess: (data) => {
      if (data.success && data.data) {
        selectTender(data.data)
        setError(null)
      }
    },
    onError: (error) => {
      setError(error.message)
    },
    ...options,
  })
}

export function useCreateTender() {
  const queryClient = useQueryClient()
  const { addTender, setLoading } = useTenderStore()
  const { addNotification } = useUIStore()

  return useMutation({
    mutationFn: (tender: Omit<Tender, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'documents' | 'participants'>) =>
      apiClient.createTender(tender),
    onMutate: () => {
      setLoading('create', true)
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        addTender(data.data)
        queryClient.invalidateQueries({ queryKey: queryKeys.tenders.lists() })
        addNotification({
          type: 'success',
          title: 'Tender created',
          message: `"${data.data.title}" has been created successfully`,
        })
      }
    },
    onError: (error: ApiError) => {
      addNotification({
        type: 'error',
        title: 'Failed to create tender',
        message: error.message,
      })
    },
    onSettled: () => {
      setLoading('create', false)
    },
  })
}

export function useUpdateTender() {
  const queryClient = useQueryClient()
  const { updateTender, setLoading } = useTenderStore()
  const { addNotification } = useUIStore()

  return useMutation({
    mutationFn: ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<Omit<Tender, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>> 
    }) => apiClient.updateTender(id, updates),
    onMutate: () => {
      setLoading('update', true)
    },
    onSuccess: (data, { id }) => {
      if (data.success && data.data) {
        updateTender(id, data.data)
        queryClient.invalidateQueries({ queryKey: queryKeys.tenders.detail(id) })
        queryClient.invalidateQueries({ queryKey: queryKeys.tenders.lists() })
        addNotification({
          type: 'success',
          title: 'Tender updated',
          message: 'Changes have been saved successfully',
        })
      }
    },
    onError: (error: ApiError) => {
      addNotification({
        type: 'error',
        title: 'Failed to update tender',
        message: error.message,
      })
    },
    onSettled: () => {
      setLoading('update', false)
    },
  })
}

export function useDeleteTender() {
  const queryClient = useQueryClient()
  const { removeTender, setLoading } = useTenderStore()
  const { addNotification } = useUIStore()

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTender(id),
    onMutate: () => {
      setLoading('delete', true)
    },
    onSuccess: (_, id) => {
      removeTender(id)
      queryClient.invalidateQueries({ queryKey: queryKeys.tenders.lists() })
      addNotification({
        type: 'success',
        title: 'Tender deleted',
        message: 'Tender has been removed successfully',
      })
    },
    onError: (error: ApiError) => {
      addNotification({
        type: 'error',
        title: 'Failed to delete tender',
        message: error.message,
      })
    },
    onSettled: () => {
      setLoading('delete', false)
    },
  })
}

// Document Hooks
export function useDocuments(tenderId: string) {
  return useQuery({
    queryKey: queryKeys.tenders.documents(tenderId),
    queryFn: () => apiClient.getDocuments(tenderId),
    enabled: !!tenderId,
    staleTime: 60000, // 1 minute
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  const { addNotification } = useUIStore()

  return useMutation({
    mutationFn: ({ 
      tenderId, 
      file, 
      onProgress 
    }: { 
      tenderId: string; 
      file: File; 
      onProgress?: (progress: number) => void 
    }) => apiClient.uploadDocument(tenderId, file, onProgress),
    onSuccess: (data, { tenderId }) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tenders.documents(tenderId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.tenders.detail(tenderId) })
        addNotification({
          type: 'success',
          title: 'Document uploaded',
          message: 'File has been uploaded successfully',
        })
      }
    },
    onError: (error: ApiError) => {
      addNotification({
        type: 'error',
        title: 'Upload failed',
        message: error.message,
      })
    },
  })
}

// User Hooks
export function useUsers(
  params: PaginationParams = { page: 1, limit: 20 },
  options?: Omit<UseQueryOptions<PaginatedResponse<User>, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => apiClient.getUsers(params),
    staleTime: 300000, // 5 minutes
    ...options,
  })
}

// Utility Hooks
export function useOptimisticUpdate<T>(
  queryKey: string[],
  updateFn: (oldData: T | undefined, variables: any) => T
) {
  const queryClient = useQueryClient()

  return {
    onMutate: async (variables: any) => {
      await queryClient.cancelQueries({ queryKey })
      const previousData = queryClient.getQueryData<T>(queryKey)
      queryClient.setQueryData(queryKey, (old: T | undefined) => updateFn(old, variables))
      return { previousData }
    },
    onError: (_error: any, _variables: any, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  }
}