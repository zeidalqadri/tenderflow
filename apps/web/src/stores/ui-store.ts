import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type ViewMode = 'table' | 'grid' | 'list'

export interface PreferencesState {
  keyboardShortcutsEnabled: boolean
  autoSave: boolean
  compactMode: boolean
  showTooltips: boolean
}

export interface FilterState {
  search: string
  status: string[]
  category: string[]
  priority: string[]
  source: string[]
  dateRange: {
    from: Date | null
    to: Date | null
  }
  valueRange: {
    min: number | null
    max: number | null
  }
}

export interface UIState {
  // Theme and appearance
  theme: Theme
  sidebarCollapsed: boolean
  showNotes: boolean
  
  // Navigation and screen state
  activeScreen: string
  showHelp: boolean
  
  // User preferences
  preferences: PreferencesState
  
  // View preferences
  viewMode: ViewMode
  itemsPerPage: number
  
  // Filters
  filters: FilterState
  
  // UI state
  isLoading: boolean
  notifications: Notification[]
  modals: {
    [key: string]: boolean
  }
  
  // Actions
  setTheme: (theme: Theme) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleNotes: () => void
  setShowNotes: (show: boolean) => void
  
  // Navigation actions
  setActiveScreen: (screen: string) => void
  toggleHelp: () => void
  setShowHelp: (show: boolean) => void
  
  // Preferences actions
  updatePreferences: (preferences: Partial<PreferencesState>) => void
  
  setViewMode: (mode: ViewMode) => void
  setItemsPerPage: (count: number) => void
  
  updateFilters: (filters: Partial<FilterState>) => void
  clearFilters: () => void
  
  setLoading: (loading: boolean) => void
  
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  
  openModal: (modalId: string) => void
  closeModal: (modalId: string) => void
  toggleModal: (modalId: string) => void
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: Date
  read: boolean
  persistent?: boolean
}

const defaultFilters: FilterState = {
  search: '',
  status: [],
  category: [],
  priority: [],
  source: [],
  dateRange: {
    from: null,
    to: null,
  },
  valueRange: {
    min: null,
    max: null,
  },
}

const defaultPreferences: PreferencesState = {
  keyboardShortcutsEnabled: true,
  autoSave: true,
  compactMode: false,
  showTooltips: true,
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      theme: 'system',
      sidebarCollapsed: false,
      showNotes: true, // Show development notes by default
      
      // Navigation and screen state
      activeScreen: 'inbox', // Default to inbox screen
      showHelp: false,
      
      // User preferences
      preferences: defaultPreferences,
      
      viewMode: 'list',
      itemsPerPage: 20,
      
      filters: defaultFilters,
      
      isLoading: false,
      notifications: [],
      modals: {},
      
      // Theme and appearance actions
      setTheme: (theme: Theme) => {
        set({ theme })
        
        // Apply theme to document
        if (typeof document !== 'undefined') {
          const root = document.documentElement
          
          if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            root.classList.toggle('dark', systemTheme === 'dark')
          } else {
            root.classList.toggle('dark', theme === 'dark')
          }
        }
      },
      
      toggleSidebar: () => {
        set(state => ({ sidebarCollapsed: !state.sidebarCollapsed }))
      },
      
      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed })
      },
      
      toggleNotes: () => {
        set(state => ({ showNotes: !state.showNotes }))
      },
      
      setShowNotes: (show: boolean) => {
        set({ showNotes: show })
      },
      
      // Navigation actions
      setActiveScreen: (screen: string) => {
        set({ activeScreen: screen })
      },
      
      toggleHelp: () => {
        set(state => ({ showHelp: !state.showHelp }))
      },
      
      setShowHelp: (show: boolean) => {
        set({ showHelp: show })
      },
      
      // Preferences actions
      updatePreferences: (newPreferences: Partial<PreferencesState>) => {
        set(state => ({
          preferences: { ...state.preferences, ...newPreferences }
        }))
      },
      
      // View preferences
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode })
      },
      
      setItemsPerPage: (count: number) => {
        set({ itemsPerPage: count })
      },
      
      // Filter actions
      updateFilters: (newFilters: Partial<FilterState>) => {
        set(state => ({
          filters: { ...state.filters, ...newFilters }
        }))
      },
      
      clearFilters: () => {
        set({ filters: defaultFilters })
      },
      
      // Loading state
      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },
      
      // Notification actions
      addNotification: (notification: Omit<Notification, 'id'>) => {
        const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const newNotification: Notification = {
          ...notification,
          id,
          timestamp: new Date(),
          read: false,
        }
        
        set(state => ({
          notifications: [newNotification, ...state.notifications].slice(0, 50) // Keep max 50 notifications
        }))
        
        // Auto-remove non-persistent notifications after 5 seconds
        if (!notification.persistent) {
          setTimeout(() => {
            get().removeNotification(id)
          }, 5000)
        }
      },
      
      removeNotification: (id: string) => {
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id)
        }))
      },
      
      clearNotifications: () => {
        set({ notifications: [] })
      },
      
      // Modal actions
      openModal: (modalId: string) => {
        set(state => ({
          modals: { ...state.modals, [modalId]: true }
        }))
      },
      
      closeModal: (modalId: string) => {
        set(state => ({
          modals: { ...state.modals, [modalId]: false }
        }))
      },
      
      toggleModal: (modalId: string) => {
        set(state => ({
          modals: { ...state.modals, [modalId]: !state.modals[modalId] }
        }))
      },
    }),
    {
      name: 'tenderflow-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        showNotes: state.showNotes,
        activeScreen: state.activeScreen,
        showHelp: state.showHelp,
        preferences: state.preferences,
        viewMode: state.viewMode,
        itemsPerPage: state.itemsPerPage,
        filters: state.filters,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          // Apply theme on rehydration
          state.setTheme(state.theme)
        }
      },
    }
  )
)