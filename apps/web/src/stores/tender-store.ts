import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Tender {
  id: string
  title: string
  description?: string
  organization: string
  publishedDate: string
  deadline: string
  value?: number
  currency: string
  status: 'scraped' | 'validated' | 'categorized' | 'qualified' | 'archived'
  priority: 'low' | 'medium' | 'high'
  aiScore?: number
  tags: string[]
  source: string
  category?: string
  assignedTo?: string[]
  notes?: string
  documents?: TenderDocument[]
  bids?: TenderBid[]
  metadata?: Record<string, any>
}

export interface TenderDocument {
  id: string
  name: string
  type: string
  size: number
  url: string
  uploadedAt: string
  uploadedBy: string
}

export interface TenderBid {
  id: string
  amount: number
  currency: string
  status: 'draft' | 'submitted' | 'accepted' | 'rejected'
  submittedAt?: string
  notes?: string
}

export interface TenderState {
  // Selected tender
  selectedTender: Tender | null
  
  // Recently viewed tenders
  recentTenders: Tender[]
  
  // Favorites
  favoriteTenders: string[]
  
  // Local tender edits (before saving)
  draftChanges: Record<string, Partial<Tender>>
  
  // Actions
  selectTender: (tender: Tender | null) => void
  updateSelectedTender: (updates: Partial<Tender>) => void
  addToRecent: (tender: Tender) => void
  toggleFavorite: (tenderId: string) => void
  isFavorite: (tenderId: string) => boolean
  
  // Draft changes
  saveDraftChanges: (tenderId: string, changes: Partial<Tender>) => void
  getDraftChanges: (tenderId: string) => Partial<Tender> | undefined
  clearDraftChanges: (tenderId: string) => void
  hasDraftChanges: (tenderId: string) => boolean
  
  // Bulk operations
  bulkUpdateStatus: (tenderIds: string[], status: Tender['status']) => void
  bulkUpdatePriority: (tenderIds: string[], priority: Tender['priority']) => void
  bulkAddTag: (tenderIds: string[], tag: string) => void
  bulkAssign: (tenderIds: string[], userId: string) => void
  
  // Utilities
  getTendersByStatus: (status: Tender['status']) => Tender[]
  getTendersByPriority: (priority: Tender['priority']) => Tender[]
  getExpiringSoon: (days?: number) => Tender[]
  clearAll: () => void
}

export const useTenderStore = create<TenderState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedTender: null,
      recentTenders: [],
      favoriteTenders: [],
      draftChanges: {},
      
      // Selection actions
      selectTender: (tender: Tender | null) => {
        set({ selectedTender: tender })
        
        if (tender) {
          get().addToRecent(tender)
        }
      },
      
      updateSelectedTender: (updates: Partial<Tender>) => {
        set(state => ({
          selectedTender: state.selectedTender 
            ? { ...state.selectedTender, ...updates }
            : null
        }))
      },
      
      // Recent tenders
      addToRecent: (tender: Tender) => {
        set(state => {
          const filtered = state.recentTenders.filter(t => t.id !== tender.id)
          return {
            recentTenders: [tender, ...filtered].slice(0, 10) // Keep last 10
          }
        })
      },
      
      // Favorites
      toggleFavorite: (tenderId: string) => {
        set(state => ({
          favoriteTenders: state.favoriteTenders.includes(tenderId)
            ? state.favoriteTenders.filter(id => id !== tenderId)
            : [...state.favoriteTenders, tenderId]
        }))
      },
      
      isFavorite: (tenderId: string) => {
        return get().favoriteTenders.includes(tenderId)
      },
      
      // Draft changes
      saveDraftChanges: (tenderId: string, changes: Partial<Tender>) => {
        set(state => ({
          draftChanges: {
            ...state.draftChanges,
            [tenderId]: {
              ...state.draftChanges[tenderId],
              ...changes
            }
          }
        }))
      },
      
      getDraftChanges: (tenderId: string) => {
        return get().draftChanges[tenderId]
      },
      
      clearDraftChanges: (tenderId: string) => {
        set(state => {
          const { [tenderId]: removed, ...rest } = state.draftChanges
          return { draftChanges: rest }
        })
      },
      
      hasDraftChanges: (tenderId: string) => {
        const changes = get().draftChanges[tenderId]
        return changes && Object.keys(changes).length > 0
      },
      
      // Bulk operations (these would typically trigger API calls)
      bulkUpdateStatus: (tenderIds: string[], status: Tender['status']) => {
        // This would typically make API calls to update multiple tenders
        // For now, we'll update any selected tender if it's in the list
        const state = get()
        if (state.selectedTender && tenderIds.includes(state.selectedTender.id)) {
          state.updateSelectedTender({ status })
        }
      },
      
      bulkUpdatePriority: (tenderIds: string[], priority: Tender['priority']) => {
        const state = get()
        if (state.selectedTender && tenderIds.includes(state.selectedTender.id)) {
          state.updateSelectedTender({ priority })
        }
      },
      
      bulkAddTag: (tenderIds: string[], tag: string) => {
        const state = get()
        if (state.selectedTender && tenderIds.includes(state.selectedTender.id)) {
          const currentTags = state.selectedTender.tags || []
          if (!currentTags.includes(tag)) {
            state.updateSelectedTender({ 
              tags: [...currentTags, tag] 
            })
          }
        }
      },
      
      bulkAssign: (tenderIds: string[], userId: string) => {
        const state = get()
        if (state.selectedTender && tenderIds.includes(state.selectedTender.id)) {
          const currentAssignees = state.selectedTender.assignedTo || []
          if (!currentAssignees.includes(userId)) {
            state.updateSelectedTender({ 
              assignedTo: [...currentAssignees, userId] 
            })
          }
        }
      },
      
      // Utility functions
      getTendersByStatus: (status: Tender['status']) => {
        return get().recentTenders.filter(tender => tender.status === status)
      },
      
      getTendersByPriority: (priority: Tender['priority']) => {
        return get().recentTenders.filter(tender => tender.priority === priority)
      },
      
      getExpiringSoon: (days: number = 7) => {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() + days)
        
        return get().recentTenders.filter(tender => {
          const deadline = new Date(tender.deadline)
          return deadline <= cutoffDate && deadline > new Date()
        })
      },
      
      clearAll: () => {
        set({
          selectedTender: null,
          recentTenders: [],
          favoriteTenders: [],
          draftChanges: {},
        })
      },
    }),
    {
      name: 'tenderflow-tenders',
      partialize: (state) => ({
        recentTenders: state.recentTenders,
        favoriteTenders: state.favoriteTenders,
        draftChanges: state.draftChanges,
      }),
    }
  )
)