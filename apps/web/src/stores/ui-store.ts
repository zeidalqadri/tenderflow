import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type Screen = 
  | 'inbox' 
  | 'validate' 
  | 'categorize' 
  | 'alerts' 
  | 'docs' 
  | 'bid-workspace' 
  | 'submissions' 
  | 'reports' 
  | 'outcomes'

interface UIState {
  activeScreen: Screen
  sidebarCollapsed: boolean
  showHelp: boolean
  showNotes: boolean
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    title: string
    message: string
    timestamp: Date
    read: boolean
  }>
  filters: {
    search: string
    status: string[]
    assignee: string[]
    dateRange: {
      from: Date | null
      to: Date | null
    }
  }
  preferences: {
    itemsPerPage: number
    defaultView: 'table' | 'cards' | 'list'
    autoRefresh: boolean
    showArchivedItems: boolean
    keyboardShortcutsEnabled: boolean
  }
}

interface UIActions {
  setActiveScreen: (screen: Screen) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleHelp: () => void
  toggleNotes: () => void
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
  updateFilters: (filters: Partial<UIState['filters']>) => void
  clearFilters: () => void
  updatePreferences: (preferences: Partial<UIState['preferences']>) => void
  getKeyboardShortcuts: () => Record<string, Screen>
}

type UIStore = UIState & UIActions

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // State
      activeScreen: 'inbox',
      sidebarCollapsed: false,
      showHelp: false,
      showNotes: false,
      notifications: [],
      filters: {
        search: '',
        status: [],
        assignee: [],
        dateRange: {
          from: null,
          to: null,
        },
      },
      preferences: {
        itemsPerPage: 20,
        defaultView: 'table',
        autoRefresh: true,
        showArchivedItems: false,
        keyboardShortcutsEnabled: true,
      },

      // Actions
      setActiveScreen: (screen) => set({ activeScreen: screen }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),

      toggleNotes: () => set((state) => ({ showNotes: !state.showNotes })),

      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date(),
              read: false,
            },
            ...state.notifications,
          ],
        })),

      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      clearNotifications: () => set({ notifications: [] }),

      updateFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),

      clearFilters: () =>
        set({
          filters: {
            search: '',
            status: [],
            assignee: [],
            dateRange: {
              from: null,
              to: null,
            },
          },
        }),

      updatePreferences: (preferences) =>
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
        })),

      getKeyboardShortcuts: () => ({
        g: 'inbox',
        v: 'validate', 
        c: 'categorize',
        a: 'alerts',
        d: 'docs',
        b: 'bid-workspace',
        s: 'submissions',
        r: 'reports',
        o: 'outcomes',
      }),
    }),
    {
      name: 'tenderflow-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        showNotes: state.showNotes,
        preferences: state.preferences,
      }),
    }
  )
)