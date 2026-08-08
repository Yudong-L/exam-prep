import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  Sparkles,
  BookX,
  BrainCircuit,
  NotebookPen,
  CalendarRange,
  CheckCircle2,
  Circle,
  Trophy,
  Settings,
  Flame,
  CalendarCheck,
  GraduationCap,
  Target,
  Calculator,
} from 'lucide-react'
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/store/useAppStore'
import { useDailyPlans, useMistakes, useReviews, useSaveCheckin, useCheckin, useCheckinHistory, useDueReviews } from '@/hooks/useData'
import { getModeMeta } from '@/lib/constants'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'

const QUICK_ENTRIES: { to: string; label: string; desc: string; icon: LucideIcon; color: string }[] = [
  { to: '/daily-plan', label: '每日计划', desc: '模式联动', icon: CalendarDays, color: 'text-primary' },
  { to: '/ai-grading', label: 'AI 批改', desc: '智能反馈', icon: Sparkles, color: 'text-info' },
  { to: '/mistakes', label: '错题本', desc: '查漏补缺', icon: BookX, color: 'text-destructive' },
  { to: '/quiz', label: '刷题练习', desc: '专项突破', icon: BrainCircuit, color: 'text-success' },
  { to: '/review', label: '复盘中心', desc: '每日每周', icon: NotebookPen, color: 'text-warning' },
  { to: '/monthly-plan', label: '月计划', desc: '状态·任务', icon: CalendarRange, color: 'text-primary' },
  { to: '/speed-calc', label: '速算练习', desc: '提速训练', icon: Calculator, color: 'text-warning' },
  { to: '/settings', label: '设置', desc: 'API Key · 备份', icon: Settings, color: 'text-muted-foreground' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const date = useAppStore((s) => s.currentDate)
  const mode = useAppStore((s) => s.currentMode)
  const modeMeta = getModeMeta(mode)

  const plans = useDailyPlans()
  const mistakes = useMistakes()
  const reviews = useReviews()
  const checkin = useCheckin()
  const saveCheckin = useSaveCheckin()
  const dueReviews = useDueReviews()

  const planList = plans.data ?? []
  // 仅按当前状态（模式）统计任务量，使打卡数量随状态联动
  const modeSubPlans = planList.filter((p) => p.plan_type !== 'main' && p.mode === mode)
  const total = modeSubPlans.length
  const completed = modeSubPlans.filter((p) => p.is_completed).length
  const rate = total ? Math.round((completed / total) * 100) : 0
  const todayChecked = !!checkin.data

  // 打卡连续天数 / 累计天数
  const checkinHistory = useCheckinHistory()
  const checkins = checkinHistory.data ?? []
  const streak = useMemo(() => {
    const dates = new Set(checkins.map((c) => c.date))
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const d = new Date()
    if (!dates.has(fmt(d))) d.setDate(d.getDate() - 1) // 今天还没打卡则从昨天起算
    let n = 0
    while (dates.has(fmt(d))) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  }, [checkins])

  // 错题掌握率
  const mistakeList = mistakes.data ?? []
  const masteredCount = mistakeList.filter((m) => m.mastered).length
  const masteryRate = mistakeList.length ? Math.round((masteredCount / mistakeList.length) * 100) : 0

  const handleCheckin = async () => {
    if (total === 0) {
      toast.warning('今日暂无计划，请先到「每日计划」生成')
      return
    }
    await saveCheckin.mutateAsync({
      id: '',
      user_id: userId,
      date,
      mode,
      total_tasks: total,
      completed_tasks: completed,
      notes: undefined,
    })
    toast.success('打卡成功！', { description: `已完成 ${completed}/${total} 项任务` })
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 问候 */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs text-muted-foreground">今天也是上岸的一天</p>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">今日概览</h2>
          <Badge variant="outline" className={modeMeta.accent}>
            {modeMeta.emoji} {modeMeta.label}
          </Badge>
        </div>
      </motion.div>

      {/* 进度 + 打卡 */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">今日完成进度</p>
              <p className="text-2xl font-bold">
                {completed}
                <span className="text-sm font-normal text-muted-foreground"> / {total}</span>
              </p>
            </div>
            <span className="text-3xl font-bold text-primary">{rate}%</span>
          </div>
          <Progress value={rate} className="h-2" />
          <Button onClick={handleCheckin} disabled={saveCheckin.isPending || todayChecked} className="w-full">
            {todayChecked ? (
              <>
                <CheckCircle2 className="size-4" />
                今日已打卡
              </>
            ) : (
              <>
                <Trophy className="size-4" />
                一键打卡
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 学习数据看板 */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 py-4">
          <MiniStat icon={Flame} label="连续打卡" value={`${streak}`} unit="天" accent="text-warning" />
          <MiniStat icon={CalendarCheck} label="累计打卡" value={`${checkins.length}`} unit="天" accent="text-success" />
          <MiniStat icon={Target} label="今日完成率" value={`${rate}`} unit="%" accent="text-primary" />
          <MiniStat icon={GraduationCap} label="错题掌握" value={`${masteryRate}`} unit="%" accent="text-info" />
        </CardContent>
      </Card>

      {/* 今日待复习（间隔重复排程） */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <GraduationCap className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">今日待复习</p>
                <p className="text-xs text-muted-foreground">按遗忘曲线自动排程</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-warning">{dueReviews.data?.length ?? 0}</span>
          </div>
          {dueReviews.isLoading ? (
            <Skeleton className="h-4 w-full" />
          ) : (dueReviews.data?.length ?? 0) === 0 ? (
            <p className="text-center text-xs text-muted-foreground">今天没有需要复习的错题，状态很好！</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {dueReviews.data!.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{m.module_type}</span>
                    <span className="flex-1 truncate text-foreground/90">{m.stem || m.question_content}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate('/mistakes')}>
                去错题本复习
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* 快捷入口 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">快捷入口</p>
        <div className="grid grid-cols-3 gap-2.5">
          {QUICK_ENTRIES.map((e, i) => {
            const Icon = e.icon
            return (
              <motion.button
                key={e.to}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(e.to)}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-center transition-all duration-200 hover:border-primary hover:bg-primary/5"
              >
                <Icon className={`size-6 ${e.color}`} />
                <span className="text-xs font-medium leading-tight">{e.label}</span>
                <span className="text-[10px] text-muted-foreground">{e.desc}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* 今日任务预览 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground">今日任务</p>
          <button className="text-xs text-primary" onClick={() => navigate('/daily-plan')}>
            查看全部
          </button>
        </div>
        <Card>
          <CardContent className="divide-y divide-border py-1">
            {plans.isLoading ? (
              <>
                <Skeleton className="my-2 h-4 w-full" />
                <Skeleton className="my-2 h-4 w-3/4" />
              </>
            ) : modeSubPlans.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">还没有任务</p>
            ) : (
              modeSubPlans.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  {p.is_completed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={p.is_completed ? 'text-muted-foreground line-through' : ''}>
                    {p.task_title}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 状态小卡片 */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          icon={BookX}
          label="错题本"
          value={mistakes.data?.length ?? 0}
          onClick={() => navigate('/mistakes')}
        />
        <StatCard
          icon={NotebookPen}
          label="复盘记录"
          value={reviews.data?.length ?? 0}
          onClick={() => navigate('/review')}
        />
      </div>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit: string
  accent: string
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${accent}`} />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold">
        {value}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent">
      <Icon className="size-5 text-primary" />
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </button>
  )
}
