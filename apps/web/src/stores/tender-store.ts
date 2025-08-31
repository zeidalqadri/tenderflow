import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Tender, TenderStatus } from '@tenderflow/shared'

interface TenderState {
  tenders: Map<string, Tender>
  selectedTender: Tender | null
  loadingStates: {
    list: boolean
    details: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  error: string | null
  lastUpdated: Date | null
  pagination: {
    page: number
    totalPages: number
    totalItems: number
    hasMore: boolean
  }
  realTimeUpdates: {
    enabled: boolean
    lastSync: Date | null
    pendingChanges: string[]
  }
}

interface TenderActions {
  // CRUD Operations
  setTenders: (tenders: Tender[]) => void
  addTender: (tender: Tender) => void
  updateTender: (id: string, updates: Partial<Tender>) => void
  removeTender: (id: string) => void
  
  // Selection
  selectTender: (tender: Tender | null) => void
  selectTenderById: (id: string) => void
  
  // Loading States
  setLoading: (operation: keyof TenderState['loadingStates'], loading: boolean) => void
  
  // Error Handling
  setError: (error: string | null) => void
  clearError: () => void
  
  // Status Updates
  updateTenderStatus: (id: string, status: TenderStatus) => void
  batchUpdateStatus: (ids: string[], status: TenderStatus) => void
  
  // Pagination
  setPagination: (pagination: Partial<TenderState['pagination']>) => void
  
  // Real-time Updates
  enableRealTimeUpdates: (enabled: boolean) => void
  addPendingChange: (tenderId: string) => void
  clearPendingChanges: () => void
  
  // Utility Functions
  getTenderById: (id: string) => Tender | undefined
  getTendersByStatus: (status: TenderStatus) => Tender[]
  getFilteredTenders: (filters: {
    search?: string
    status?: TenderStatus[]
    assignee?: string[]
    dateRange?: { from: Date; to: Date }
  }) => Tender[]
  
  // Reset
  reset: () => void
}

type TenderStore = TenderState & TenderActions

const initialState: TenderState = {
  tenders: new Map(),
  selectedTender: null,
  loadingStates: {
    list: false,
    details: false,
    create: false,
    update: false,
    delete: false,
  },
  error: null,
  lastUpdated: null,
  pagination: {
    page: 1,
    totalPages: 0,
    totalItems: 0,
    hasMore: false,
  },
  realTimeUpdates: {
    enabled: true,
    lastSync: null,
    pendingChanges: [],
  },
}

export const useTenderStore = create<TenderStore>()(
  immer((set, get) => ({
    ...initialState,

    // CRUD Operations
    setTenders: (tenders) =>
      set((state) => {
        state.tenders = new Map(tenders.map((t) => [t.id, t]))
        state.lastUpdated = new Date()
      }),

    addTender: (tender) =>
      set((state) => {
        state.tenders.set(tender.id, tender)
        state.lastUpdated = new Date()
      }),

    updateTender: (id, updates) =>
      set((state) => {
        const existing = state.tenders.get(id)
        if (existing) {
          state.tenders.set(id, { ...existing, ...updates, updatedAt: new Date() })
          if (state.selectedTender?.id === id) {
            state.selectedTender = { ...state.selectedTender, ...updates }
          }
          state.lastUpdated = new Date()
        }
      }),

    removeTender: (id) =>
      set((state) => {
        state.tenders.delete(id)
        if (state.selectedTender?.id === id) {
          state.selectedTender = null
        }
        state.lastUpdated = new Date()
      }),

    // Selection
    selectTender: (tender) =>
      set((state) => {
        state.selectedTender = tender
      }),

    selectTenderById: (id) =>
      set((state) => {
        const tender = state.tenders.get(id)
        state.selectedTender = tender || null
      }),

    // Loading States
    setLoading: (operation, loading) =>
      set((state) => {
        state.loadingStates[operation] = loading
      }),

    // Error Handling
    setError: (error) =>
      set((state) => {
        state.error = error
      }),

    clearError: () =>
      set((state) => {
        state.error = null
      }),

    // Status Updates
    updateTenderStatus: (id, status) =>
      set((state) => {
        const tender = state.tenders.get(id)
        if (tender) {
          const updatedTender = { ...tender, status, updatedAt: new Date() }
          state.tenders.set(id, updatedTender)
          if (state.selectedTender?.id === id) {
            state.selectedTender = updatedTender
          }
        }
      }),

    batchUpdateStatus: (ids, status) =>
      set((state) => {
        ids.forEach((id) => {
          const tender = state.tenders.get(id)
          if (tender) {
            state.tenders.set(id, { ...tender, status, updatedAt: new Date() })
          }
        })
        state.lastUpdated = new Date()
      }),

    // Pagination
    setPagination: (pagination) =>
      set((state) => {
        Object.assign(state.pagination, pagination)
      }),

    // Real-time Updates
    enableRealTimeUpdates: (enabled) =>
      set((state) => {
        state.realTimeUpdates.enabled = enabled
      }),

    addPendingChange: (tenderId) =>
      set((state) => {
        if (!state.realTimeUpdates.pendingChanges.includes(tenderId)) {
          state.realTimeUpdates.pendingChanges.push(tenderId)
        }
      }),

    clearPendingChanges: () =>
      set((state) => {
        state.realTimeUpdates.pendingChanges = []
        state.realTimeUpdates.lastSync = new Date()
      }),

    // Utility Functions
    getTenderById: (id) => get().tenders.get(id),

    getTendersByStatus: (status) =>
      Array.from(get().tenders.values()).filter((t) => t.status === status),

    getFilteredTenders: (filters) => {
      const { tenders } = get()
      let filtered = Array.from(tenders.values())

      if (filters.search) {
        const search = filters.search.toLowerCase()
        filtered = filtered.filter(
          (t) =>
            t.title.toLowerCase().includes(search) ||
            t.description.toLowerCase().includes(search)
        )
      }

      if (filters.status && filters.status.length > 0) {
        filtered = filtered.filter((t) => filters.status!.includes(t.status))
      }

      if (filters.assignee && filters.assignee.length > 0) {
        filtered = filtered.filter((t) =>
          t.assignedTo?.some((a) => filters.assignee!.includes(a))
        )
      }

      if (filters.dateRange) {
        const { from, to } = filters.dateRange
        filtered = filtered.filter((t) => {
          const deadline = new Date(t.deadline)
          return deadline >= from && deadline <= to
        })
      }

      return filtered
    },

    // Reset
    reset: () => set(() => ({ ...initialState })),
  }))
)