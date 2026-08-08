import { useState, useCallback, useEffect } from 'react'

// 记录已经弹过「昨日续做」提示的日期，模块级以保证跨页面切换不重复弹窗
const rolloverPromptedDates = new Set<string>()
import { motion } from 'framer-motion'
import { Plus, Pencil, Info, ChevronLeft, ChevronRight, Calendar, CheckSquare, Square, Sparkles, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ModeSwitcher } from '@/components/ModeSwitcher'
import { TaskCard } from '@/components/TaskCard'
import { AiPlanDialog } from '@/components/AiPlanDialog'
import { cn } from '@/lib/utils'
import { useAppStore, todayStr } from '@/store/useAppStore'
import {
  useDailyPlans,
  useTogglePlan,
  useSavePlan,
  useDeletePlan,
} from '@/hooks/useData'
import { useQueryClient } from '@tanstack/react-query'
import { getSubPlansByDate, updatePlanField, upsertDailyPlan, deletePlansByDateRange, upsertDayStatus } from '@/lib/api'
import { MODULES, getModeMeta } from '@/lib/constants'
import { toast } from 'sonner'
import type { DailyPlan, TaskCategory, StudyMode } from '@/lib/types'

export default function DailyPlanPage() {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const mode = useAppStore((s) => s.currentMode)

  // 页面级别的浏览日期（初始为今天，可通过导航切换）
  const [viewDate, setViewDate] = useState(todayStr())

  // 当前展示的状态：今天/过去跟随全局模式；未来日期默认「半天」状态
  const [viewMode, setViewMode] = useState<StudyMode>(mode)
  useEffect(() => {
    if (viewDate > todayStr()) setViewMode('halfday')
  }, [viewDate])
  useEffect(() => {
    if (viewDate <= todayStr()) setViewMode(mode)
  }, [mode, viewDate])

  const plans = useDailyPlans(viewDate)
  const togglePlan = useTogglePlan(viewDate)
  const savePlan = useSavePlan(viewDate)
  const deletePlan = useDeletePlan(viewDate)

  const [editing, setEditing] = useState<DailyPlan | null>(null)
  const [creating, setCreating] = useState(false)

  // 次日续做：将前一天未完成的任务延续到当天
  const [rolloverOpen, setRolloverOpen] = useState(false)
  const [rolloverTasks, setRolloverTasks] = useState<DailyPlan[]>([])
  const [rolloverPicked, setRolloverPicked] = useState<string[]>([])
  const [rolling, setRolling] = useState(false)
  // 模块级集合：跨页面切换（组件卸载/重挂载）后依然保留，保证某日期只弹一次续做提示
  const promptedDates = rolloverPromptedDates

  // 批量删除某日期范围内的计划
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchFrom, setBatchFrom] = useState('')
  const [batchTo, setBatchTo] = useState('')
  const [deleting, setDeleting] = useState(false)

  // AI 制定未来一周计划
  const [aiPlanOpen, setAiPlanOpen] = useState(false)

  const queryClient = useQueryClient()

  const planList = plans.data ?? []
  // 区分主计划（周计划导入）和次计划（按状态分组的任务）
  // 主计划同样随当前模式筛选，切换模式时只显示该模式的任务
  const mainPlans = planList.filter((p) => p.plan_type === 'main' && p.mode === viewMode)
  const subPlans = planList.filter((p) => p.plan_type !== 'main')
  // 按当前展示状态过滤：切换模式只显示该状态的计划
  const visibleMeta = getModeMeta(viewMode)
  const visibleSubPlans = subPlans.filter((p) => p.mode === viewMode)
  // 当前展示的全部任务（主计划 + 次计划），用于按模块分组
  const visibleAll = [...mainPlans, ...visibleSubPlans]
  const total = visibleAll.length
  const completed = visibleAll.filter((p) => p.is_completed).length
  const rate = total ? Math.round((completed / total) * 100) : 0
  // 按模块分组，模块顺序沿用 MODULES 定义，其余模块排其后
  const groups: { module: string; plans: DailyPlan[] }[] = []
  const groupMap = new Map<string, DailyPlan[]>()
  for (const p of visibleAll) {
    if (!groupMap.has(p.module_name)) groupMap.set(p.module_name, [])
    groupMap.get(p.module_name)!.push(p)
  }
  const moduleOrder = (m: string) => {
    const i = (MODULES as readonly string[]).indexOf(m)
    return i === -1 ? 999 : i
  }
  for (const module of [...groupMap.keys()].sort((a, b) => moduleOrder(a) - moduleOrder(b))) {
    groups.push({ module, plans: groupMap.get(module)! })
  }

  // 模式联动说明
  const categoryLabel =
    viewMode === 'overtime' ? '核心任务' : viewMode === 'fish' ? '核心 + 常规 + 保温' : '核心 + 常规'

  // 日期导航
  const isToday = viewDate === todayStr()
  const isFuture = viewDate > todayStr()
  const isPast = viewDate < todayStr()

  const navigateDate = useCallback((days: number) => {
    setViewDate((prev) => {
      const d = new Date(prev + 'T00:00:00')
      d.setDate(d.getDate() + days)
      return formatDate(d)
    })
  }, [])

  const goToToday = useCallback(() => {
    setViewDate(todayStr())
  }, [])

  const handleDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setViewDate(e.target.value)
  }, [])

  // 次日续做：进入某一天时，若该天前一天还有未完成任务，提示用户选择延续到当天
  useEffect(() => {
    if (promptedDates.has(viewDate)) return
    const prev = dateAdd(viewDate, -1)
    if (prev > todayStr()) return
    let active = true
    ;(async () => {
      try {
        const prevPlans = await getSubPlansByDate(userId, prev)
        const unfinished = prevPlans.filter((p) => !p.is_completed)
        if (!active) return
        if (unfinished.length > 0) {
          promptedDates.add(viewDate)
          setRolloverTasks(unfinished)
          setRolloverPicked(unfinished.map((p) => p.id))
          setRolloverOpen(true)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      active = false
    }
  }, [viewDate, userId])

  const handleRollover = useCallback(async () => {
    const picked = rolloverTasks.filter((p) => rolloverPicked.includes(p.id))
    if (picked.length === 0) {
      setRolloverOpen(false)
      return
    }
    setRolling(true)
    try {
      for (const p of picked) {
        await upsertDailyPlan({
          id: '',
          user_id: userId,
          date: viewDate,
          mode: p.mode,
          plan_type: p.plan_type === 'main' ? 'sub' : p.plan_type,
          module_name: p.module_name,
          task_title: p.task_title,
          task_description: p.task_description,
          target_count: p.target_count,
          is_completed: false,
          task_category: p.task_category,
          sort_order: p.sort_order,
          is_ai: false,
        })
        // 源任务标记为已完成（已续做到当天）
        await updatePlanField(p.id, { is_completed: true })
      }
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] })
      toast.success(`已将 ${picked.length} 项任务续做到 ${viewDate.slice(5)}`)
      setRolloverOpen(false)
    } catch (e: any) {
      toast.error(e.message || '续做失败')
    } finally {
      setRolling(false)
    }
  }, [rolloverTasks, rolloverPicked, userId, viewDate, queryClient])

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    if (!batchFrom || !batchTo) {
      toast.warning('请选择起止日期')
      return
    }
    if (batchFrom > batchTo) {
      toast.warning('开始日期不能晚于结束日期')
      return
    }
    setDeleting(true)
    try {
      const n = await deletePlansByDateRange(userId, batchFrom, batchTo)
      toast.success(`已删除 ${n} 条计划`)
      setBatchOpen(false)
      setBatchFrom('')
      setBatchTo('')
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] })
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }, [batchFrom, batchTo, userId, queryClient])

  // 切换浏览日期时同步更新全局日期，以触发正确的数据加载
  // 注意：这里不直接使用 setGlobalDate 而是使用 viewDate 作为查询参数
  // 实际上 useDailyPlans 使用的是 globalDate，所以需要同步
  // 但为了不破坏首页等其他页面的日期显示，这里采用局部日期切换 + API 直调的方式
  // 更优雅的做法是让 useDailyPlans 支持传入自定义日期

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">每日计划</h2>
          <p className="text-xs text-muted-foreground">{viewDate}</p>
        </div>
        {/* 日期导航器 */}
        <DateNavigator
          viewDate={viewDate}
          isToday={isToday}
          isFuture={isFuture}
          isPast={isPast}
          onPrev={() => navigateDate(-1)}
          onNext={() => navigateDate(1)}
          onToday={goToToday}
          onDateInput={handleDateInput}
        />
      </div>

      {/* 未来日期提示 */}
      {isFuture && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>你正在查看未来的计划，可以提前安排任务。点击下方「添加自定义任务」或「AI 制定下周计划」来安排。</span>
        </div>
      )}

      {/* 模式切换：同步写入当日状态，使月计划状态跟随切换 */}
      <ModeSwitcher
        onModeChange={(m) => {
          setViewMode(m)
          upsertDayStatus({ user_id: userId, date: viewDate, status: m })
        }}
      />

      {/* 批量管理 */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-primary"
          onClick={() => setAiPlanOpen(true)}
        >
          <Sparkles className="size-3.5" />
          AI 制定下周计划
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => setBatchOpen(true)}
        >
          <Trash2 className="size-3.5" />
          批量删除计划
        </Button>
      </div>

      {/* 联动提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          当前展示「{visibleMeta.label}」状态的计划：<b className="text-foreground">{categoryLabel}</b>，
          共 {total} 项任务。切换上方模式可只看对应状态的计划。
        </span>
      </div>

      {/* 进度 */}
      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">已完成 {completed} / {total} 项任务</span>
            <span className="font-bold text-primary">{rate}%</span>
          </div>
          <Progress value={rate} className="h-2" />
        </CardContent>
      </Card>

      {/* 任务列表 */}
      <div className="space-y-2.5">
        {plans.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">加载中...</p>
        ) : planList.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              该日期暂无任务，点击下方「添加自定义任务」或「AI 制定下周计划」
            </CardContent>
          </Card>
        ) : (
          groups.length > 0 ? (
            groups.map((g) => (
              <div key={g.module} className="space-y-2">
                <div className="flex items-center gap-1.5 px-1 pt-1">
                  <span className="size-2.5 rounded-full bg-primary/70" />
                  <span className="text-xs font-semibold text-foreground">{g.module}</span>
                  <span className="text-[11px] text-muted-foreground">（{g.plans.length} 项）</span>
                </div>
                <motion.div initial="hidden" animate="show" className="space-y-2.5">
                  {g.plans.map((p) => (
                    <TaskCard
                      key={p.id}
                      plan={p}
                      onToggle={(id, v) => togglePlan.mutate({ id, isCompleted: v })}
                      onEdit={(plan) => setEditing(plan)}
                    />
                  ))}
                </motion.div>
              </div>
            ))
          ) : (
            <p className="px-1 text-[11px] text-muted-foreground">该状态下暂无任务，可点击「添加自定义任务」或「AI 制定下周计划」</p>
          )
        )}
      </div>

      {/* 添加任务 */}
      <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
        <Plus className="size-4" />
        添加自定义任务
      </Button>

      {/* 编辑弹窗 */}
      <PlanDialog
        open={!!editing || creating}
        plan={editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null)
            setCreating(false)
          }
        }}
        onSave={async (plan) => {
          await savePlan.mutateAsync(plan)
          toast.success('已保存')
          setEditing(null)
          setCreating(false)
        }}
        onDelete={async (id) => {
          await deletePlan.mutate(id)
          toast.success('已删除')
          setEditing(null)
        }}
        defaultMode={viewMode}
        defaultDate={viewDate}
        userId={userId}
      />

      {/* 次日续做：选择前一天未完成的任务延续到当天 */}
      <Dialog open={rolloverOpen} onOpenChange={(o) => !o && setRolloverOpen(false)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="size-5 text-primary" />
              延续昨日未完成的任务
            </DialogTitle>
            <DialogDescription className="text-sm">
              以下是 {dateAdd(viewDate, -1)} 未完成（{rolloverTasks.length} 项）的任务，勾选要延续到 {viewDate} 继续完成的部分。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
            {rolloverTasks.map((p) => {
              const meta = getModeMeta(p.mode)
              const checked = rolloverPicked.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    setRolloverPicked((prev) =>
                      checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                    )
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm',
                    checked ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  {checked ? (
                    <CheckSquare className="size-4 shrink-0 text-primary" />
                  ) : (
                    <Square className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn('size-2.5 shrink-0 rounded-full', meta.key === 'fish' ? 'bg-success' : meta.key === 'halfday' ? 'bg-warning' : 'bg-destructive')} />
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{p.module_name}</span>
                  <span className="flex-1 break-any text-foreground">{p.task_title}</span>
                </button>
              )
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRolloverOpen(false)} disabled={rolling}>
              跳过
            </Button>
            <Button onClick={handleRollover} disabled={rolling || rolloverPicked.length === 0}>
              {rolling ? '续做中...' : `续做到当天（${rolloverPicked.length}）`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认弹窗 */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              批量删除计划
            </DialogTitle>
            <DialogDescription className="text-sm">
              将删除从开始日期到结束日期之间（含首尾）的<b>所有计划</b>，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-1">
            <Input type="date" value={batchFrom} onChange={(e) => setBatchFrom(e.target.value)} className="text-sm" />
            <span className="text-xs text-muted-foreground shrink-0">至</span>
            <Input type="date" value={batchTo} onChange={(e) => setBatchTo(e.target.value)} className="text-sm" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setBatchOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete} disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiPlanDialog open={aiPlanOpen} onOpenChange={setAiPlanOpen} kind="plan" />
    </div>
  )
}

interface PlanDialogProps {
  open: boolean
  plan: DailyPlan | null
  onOpenChange: (open: boolean) => void
  onSave: (plan: DailyPlan) => void
  onDelete: (id: string) => void
  defaultMode: DailyPlan['mode']
  defaultDate: string
  userId: string
}

function PlanDialog({
  open,
  plan,
  onOpenChange,
  onSave,
  onDelete,
  defaultMode,
  defaultDate,
  userId,
}: PlanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" key={plan?.id ?? 'new'}>
        <PlanForm
          plan={plan}
          defaultMode={defaultMode}
          defaultDate={defaultDate}
          userId={userId}
          onSave={onSave}
          onDelete={onDelete}
        />
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({
  plan,
  defaultMode,
  defaultDate,
  userId,
  onSave,
  onDelete,
}: {
  plan: DailyPlan | null
  defaultMode: DailyPlan['mode']
  defaultDate: string
  userId: string
  onSave: (plan: DailyPlan) => void
  onDelete: (id: string) => void
}) {
  const [moduleName, setModuleName] = useState(plan?.module_name ?? MODULES[0])
  const [title, setTitle] = useState(plan?.task_title ?? '')
  const [desc, setDesc] = useState(plan?.task_description ?? '')
  const [targetCount, setTargetCount] = useState(plan?.target_count?.toString() ?? '')
  const [category, setCategory] = useState<TaskCategory>(plan?.task_category ?? 'normal')

  const isEdit = !!plan

  const handleSave = () => {
    if (!title.trim()) {
      toast.warning('请填写任务标题')
      return
    }
    onSave({
      id: plan?.id ?? '',
      user_id: userId,
      date: plan?.date ?? defaultDate,
      mode: plan?.mode ?? defaultMode,
      plan_type: plan?.plan_type ?? 'sub',
      module_name: moduleName,
      task_title: title.trim(),
      task_description: desc.trim(),
      target_count: targetCount ? Number(targetCount) : undefined,
      is_completed: plan?.is_completed ?? false,
      task_category: category,
      sort_order: plan?.sort_order ?? 99,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Pencil className="size-4 text-primary" />
          {isEdit ? '编辑任务' : '添加任务'}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>模块</Label>
          <Select value={moduleName} onValueChange={setModuleName}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>任务标题 *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：完成言语 15 题" />
        </div>
        <div className="space-y-1.5">
          <Label>任务说明</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="补充说明（可选）" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>目标题量</Label>
            <Input
              type="number"
              value={targetCount}
              onChange={(e) => setTargetCount(e.target.value)}
              placeholder="选填"
            />
          </div>
          <div className="space-y-1.5">
            <Label>任务类型</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="core">核心</SelectItem>
                <SelectItem value="normal">常规</SelectItem>
                <SelectItem value="extra">保温</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter className="gap-2">
        {isEdit && (
          <Button variant="destructive" onClick={() => onDelete(plan!.id)} className="mr-auto">
            删除
          </Button>
        )}
        <Button onClick={handleSave}>{isEdit ? '保存修改' : '添加'}</Button>
      </DialogFooter>
    </>
  )
}

// ============================================================
// 日期导航器组件
// ============================================================

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateAdd(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

function getWeekdayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
}

interface DateNavigatorProps {
  viewDate: string
  isToday: boolean
  isFuture: boolean
  isPast: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onDateInput: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function DateNavigator({
  viewDate,
  isToday,
  onPrev,
  onNext,
  onToday,
  onDateInput,
}: DateNavigatorProps) {
  const displayDate = viewDate.slice(5) // MM-DD
  const weekday = getWeekdayLabel(viewDate)

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="size-8" onClick={onPrev}>
        <ChevronLeft className="size-4" />
      </Button>

      <div className="relative flex items-center">
        <input
          type="date"
          value={viewDate}
          onChange={onDateInput}
          className="absolute inset-0 cursor-pointer opacity-0"
          title="选择日期"
        />
        <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1 text-sm">
          <Calendar className="size-3.5 text-primary" />
          <span className="font-medium">{displayDate}</span>
          <span className="text-xs text-muted-foreground">{weekday}</span>
        </div>
      </div>

      <Button variant="ghost" size="icon" className="size-8" onClick={onNext}>
        <ChevronRight className="size-4" />
      </Button>

      {!isToday && (
        <Button variant="outline" size="sm" className="ml-1 h-8 text-xs" onClick={onToday}>
          今天
        </Button>
      )}
    </div>
  )
}
