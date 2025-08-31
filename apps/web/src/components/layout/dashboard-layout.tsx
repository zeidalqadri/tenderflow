'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Inbox, 
  CheckCircle, 
  Tag, 
  Bell, 
  FileText, 
  Briefcase, 
  Send, 
  BarChart3, 
  MessageSquare,
  Menu,
  Search,
  User,
  Settings,
  Moon,
  Sun,
  LogOut,
  HelpCircle
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUIStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import { useLogout } from '@/hooks/use-api'
import { cn } from '@/lib/utils'

const screens = [
  { key: 'inbox', label: 'Inbox', icon: Inbox, shortcut: 'g' },
  { key: 'validate', label: 'Validate', icon: CheckCircle, shortcut: 'v' },
  { key: 'categorize', label: 'Categorize', icon: Tag, shortcut: 'c' },
  { key: 'alerts', label: 'Alerts', icon: Bell, shortcut: 'a' },
  { key: 'docs', label: 'Docs', icon: FileText, shortcut: 'd' },
  { key: 'bid-workspace', label: 'Bid Workspace', icon: Briefcase, shortcut: 'b' },
  { key: 'submissions', label: 'Submissions', icon: Send, shortcut: 's' },
  { key: 'reports', label: 'Reports', icon: BarChart3, shortcut: 'r' },
  { key: 'outcomes', label: 'Outcomes', icon: MessageSquare, shortcut: 'o' },
] as const

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { 
    activeScreen, 
    sidebarCollapsed, 
    showHelp, 
    showNotes,
    preferences,
    setActiveScreen, 
    toggleSidebar, 
    toggleHelp, 
    toggleNotes,
    updateFilters,
    filters
  } = useUIStore()
  const { user } = useAuthStore()
  const logoutMutation = useLogout()

  // Keyboard navigation
  useEffect(() => {
    if (!preferences.keyboardShortcutsEnabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return
      }

      // Numeric shortcuts 1-9
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1
        if (index < screens.length) {
          const screen = screens[index]
          setActiveScreen(screen.key as any)
          router.push(`/${screen.key}`)
          e.preventDefault()
        }
      }

      // Letter shortcuts
      const key = e.key.toLowerCase()
      const screen = screens.find(s => s.shortcut === key)
      if (screen) {
        setActiveScreen(screen.key as any)
        router.push(`/${screen.key}`)
        e.preventDefault()
      }

      // Help toggle
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        toggleHelp()
        e.preventDefault()
      }

      // Toggle sidebar
      if (e.key === '[') {
        toggleSidebar()
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [preferences.keyboardShortcutsEnabled, router, setActiveScreen, toggleHelp, toggleSidebar])

  const handleLogout = () => {
    logoutMutation.mutate()
  }

  return (
    <div className="h-screen bg-background flex">
      {/* Sidebar */}
      <div
        className={cn(
          'bg-card border-r border-border transition-all duration-200 flex flex-col',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8"
            >
              <Menu className="h-4 w-4" />
            </Button>
            {!sidebarCollapsed && (
              <h1 className="font-semibold tracking-tight">TenderFlow</h1>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 sidebar-scroll overflow-y-auto">
          <div className="space-y-1">
            {screens.map((screen, index) => {
              const Icon = screen.icon
              const isActive = activeScreen === screen.key
              
              return (
                <Button
                  key={screen.key}
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2 h-9',
                    sidebarCollapsed && 'px-2'
                  )}
                  onClick={() => {
                    setActiveScreen(screen.key as any)
                    router.push(`/${screen.key}`)
                  }}
                  title={sidebarCollapsed ? `${screen.label} (${index + 1})` : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1">{screen.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                    </>
                  )}
                </Button>
              )
            })}
          </div>
        </nav>

        {/* User Menu */}
        <div className="p-2 border-t border-border">
          <div className="space-y-1">
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2 h-9',
                sidebarCollapsed && 'px-2'
              )}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title={sidebarCollapsed ? 'Toggle theme' : undefined}
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              {!sidebarCollapsed && <span>Toggle theme</span>}
            </Button>
            
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2 h-9',
                sidebarCollapsed && 'px-2'
              )}
              onClick={toggleHelp}
              title={sidebarCollapsed ? 'Help (?)' : undefined}
            >
              <HelpCircle className="h-4 w-4" />
              {!sidebarCollapsed && <span>Help</span>}
            </Button>

            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2 h-9',
                sidebarCollapsed && 'px-2'
              )}
              onClick={handleLogout}
              title={sidebarCollapsed ? 'Logout' : undefined}
            >
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed && <span>Logout</span>}
            </Button>
          </div>
          
          {!sidebarCollapsed && user && (
            <div className="mt-2 p-2 bg-muted rounded-md">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Role: {user.role}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="h-full px-4 flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenders... (q)"
                  value={filters.search}
                  onChange={(e) => updateFilters({ search: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleNotes}
                className="text-xs"
              >
                {showNotes ? 'Hide notes' : 'Show notes'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={toggleHelp}
                className="text-xs"
              >
                Help (?)
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                <Button variant="ghost" size="sm" onClick={toggleHelp}>
                  ✕
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Navigation</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {screens.map((screen, index) => (
                      <div key={screen.key} className="flex justify-between">
                        <span>{screen.label}</span>
                        <div className="text-muted-foreground">
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">{index + 1}</kbd>
                          {' or '}
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">{screen.shortcut}</kbd>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">General</h3>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span>Show/hide this help</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs">?</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Toggle sidebar</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs">[</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Focus search</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs">q</kbd>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Keyboard shortcuts are {preferences.keyboardShortcutsEnabled ? 'enabled' : 'disabled'}. 
                  You can toggle them in your preferences.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}