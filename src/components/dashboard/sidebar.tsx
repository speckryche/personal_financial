'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  DollarSign,
  Upload,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Net Worth', href: '/net-worth', icon: TrendingUp },
  { name: 'Expenses', href: '/expenses', icon: Receipt },
  { name: 'Income', href: '/income', icon: DollarSign },
  { name: 'Imports', href: '/imports', icon: Upload },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="glass-card"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Sidebar - Collapsible */}
      <aside
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        className={cn(
          'hidden lg:flex fixed left-0 top-0 z-40 h-screen flex-col border-r bg-card/80 backdrop-blur-xl transition-all duration-300 ease-out',
          isExpanded ? 'w-60' : 'w-[72px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b transition-all duration-300',
          isExpanded ? 'px-5 gap-3' : 'px-0 justify-center'
        )}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <span className={cn(
            'text-lg font-semibold transition-all duration-300 whitespace-nowrap',
            isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'
          )}>
            Finance
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center rounded-xl transition-all duration-200',
                  isExpanded ? 'px-3 py-2.5 gap-3' : 'px-0 py-2.5 justify-center',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {/* Active indicator */}
                <div className={cn(
                  'absolute left-0 w-1 rounded-r-full bg-primary transition-all duration-200',
                  isActive ? 'h-6 opacity-100' : 'h-0 opacity-0'
                )} />

                <div className={cn(
                  'flex items-center justify-center rounded-lg transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                )}>
                  <item.icon className="h-5 w-5" />
                </div>

                <span className={cn(
                  'text-sm font-medium transition-all duration-300 whitespace-nowrap',
                  isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'
                )}>
                  {item.name}
                </span>

                {/* Hover arrow indicator */}
                {isExpanded && !isActive && (
                  <ChevronRight className="h-4 w-4 ml-auto opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className={cn(
          'border-t p-3 space-y-2',
          isExpanded ? '' : 'flex flex-col items-center'
        )}>
          {/* Theme Toggle */}
          <div className={cn(
            'flex items-center rounded-xl transition-all duration-200',
            isExpanded ? 'px-3 py-2 justify-between' : 'justify-center py-2'
          )}>
            {isExpanded && <span className="text-sm text-muted-foreground">Theme</span>}
            <ThemeToggle />
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className={cn(
              'group flex items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 w-full',
              isExpanded ? 'px-3 py-2.5 gap-3' : 'px-0 py-2.5 justify-center'
            )}
          >
            <LogOut className="h-5 w-5" />
            <span className={cn(
              'text-sm font-medium transition-all duration-300 whitespace-nowrap',
              isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'
            )}>
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card/95 backdrop-blur-xl transition-transform duration-300',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold">Finance</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-3">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-3 space-y-2">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 w-full"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
