import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Home,
  CalendarDays,
  Sparkles,
  BookX,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabItem {
  to: string
  label: string
  icon: LucideIcon
}

const TABS: TabItem[] = [
  { to: '/ai-grading', label: '批改', icon: Sparkles },
  { to: '/daily-plan', label: '计划', icon: CalendarDays },
  { to: '/', label: '首页', icon: Home },
  { to: '/mistakes', label: '错题', icon: BookX },
  { to: '/settings', label: '设置', icon: Settings },
]

/**
 * 底部导航栏（移动端优先，5 个主入口）
 * 复盘中心 / 周计划在首页快捷入口直达
 */
export function BottomTabBar() {
  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      aria-label="主导航"
    >
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                    />
                  )}
                  <Icon className="size-5" strokeWidth={isActive ? 2.4 : 2} />
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
