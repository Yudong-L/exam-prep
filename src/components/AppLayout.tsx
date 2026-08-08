import { useEffect, type ReactNode } from 'react'
import { ensureLogin } from '@/lib/database'
import { useAppStore } from '@/store/useAppStore'
import { BottomTabBar } from './BottomTabBar'
import { GraduationCap } from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
}

/**
 * 移动端优先的应用外壳
 * - 顶部：品牌 + 当前日期
 * - 中部：页面内容（由 AnimatedRoutes 注入）
 * - 底部：固定导航栏
 * 全局居中 max-w-[480px]
 */
export function AppLayout({ children }: AppLayoutProps) {
  const setUser = useAppStore((s) => s.setUser)

  useEffect(() => {
    let active = true
    ensureLogin().then((u) => {
      if (active && u) setUser({ uid: u.uid, nickname: '', avatar: '' })
    })
    return () => {
      active = false
    }
  }, [setUser])

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col border-x border-border bg-background shadow-sm">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-bold">省考备考打卡</h1>
            <p className="text-[11px] text-muted-foreground">每日精进 · 一战成公</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          <DateChip />
        </div>
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-x-hidden">{children}</main>

      {/* 底部导航 */}
      <BottomTabBar />
    </div>
  )
}

function DateChip() {
  const date = useAppStore((s) => s.currentDate)
  const d = new Date(date + 'T00:00:00')
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return (
    <span>
      {d.getMonth() + 1}月{d.getDate()}日 {week}
    </span>
  )
}
