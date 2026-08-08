import { motion } from 'framer-motion'
import { MODES } from '@/lib/constants'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { StudyMode } from '@/lib/types'

interface ModeSwitcherProps {
  className?: string
  /** 切换后回调（例如触发保存/统计） */
  onModeChange?: (mode: StudyMode) => void
}

/**
 * 模式切换组件（加班没空 / 半天备考 / 全天摸鱼）
 * 切换会写入全局 store，页面根据 mode 联动展示不同任务集合
 */
export function ModeSwitcher({ className, onModeChange }: ModeSwitcherProps) {
  const currentMode = useAppStore((s) => s.currentMode)
  const setMode = useAppStore((s) => s.setMode)

  const handleSelect = (mode: StudyMode) => {
    if (mode === currentMode) return
    setMode(mode)
    const meta = MODES.find((m) => m.key === mode)
    toast.success(`已切换到「${meta?.label}」`, {
      description: meta?.desc,
    })
    onModeChange?.(mode)
  }

  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/50 p-1',
        className
      )}
      role="tablist"
      aria-label="学习模式切换"
    >
      {MODES.map((m) => {
        const active = m.key === currentMode
        return (
          <button
            key={m.key}
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(m.key)}
            className={cn(
              'relative flex flex-col items-center justify-center rounded-lg px-2 py-2 text-xs font-medium transition-colors duration-200',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-active-pill"
                className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              />
            )}
            <span className="relative z-10 text-base leading-none">{m.emoji}</span>
            <span className="relative z-10 mt-1 leading-none">{m.short}</span>
          </button>
        )
      })}
    </div>
  )
}
