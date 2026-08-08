import { useState, useEffect, useRef } from 'react'
import { Bot, Sparkles, Loader2, Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { aiCoachChat, hasAiAccess, hasAiApiKey } from '@/lib/ai-service'
import { AiPasswordDialog } from '@/components/AiPasswordDialog'
import {
  getAllPlans,
  getDayStatuses,
  getReviews,
  upsertDayStatus,
} from '@/lib/api'
import { useAddReview } from '@/hooks/useData'
import { useAppStore, todayStr } from '@/store/useAppStore'
import { getModeMeta } from '@/lib/constants'
import type { StudyMode } from '@/lib/types'

type Kind = 'plan' | 'review'
const STATUS_SEQ: StudyMode[] = ['fish', 'halfday', 'overtime']

interface PlanTask {
  module: string
  title: string
  status: StudyMode
}

interface PlanDay {
  date: string
  tasks: PlanTask[]
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function next7Dates(): string[] {
  const out: string[] = []
  const base = new Date(todayStr() + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    out.push(fmtDate(d))
  }
  return out
}

interface AiPlanDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: Kind
}

export function AiPlanDialog({ open, onOpenChange, kind }: AiPlanDialogProps) {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const addReview = useAddReview()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)

  // review 字段
  const [rvSummary, setRvSummary] = useState('')
  const [rvKeyPoints, setRvKeyPoints] = useState('')
  const [rvAnalysis, setRvAnalysis] = useState('')

  // plan 字段
  const [planDays, setPlanDays] = useState<PlanDay[]>([])
  const [planNote, setPlanNote] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (open) {
      setLoading(false)
      setError('')
      setGenerated(false)
      setRvSummary('')
      setRvKeyPoints('')
      setRvAnalysis('')
      setPlanDays([])
      setPlanNote('')
      startedRef.current = false
    }
  }, [open])

  const buildContext = async (): Promise<string> => {
    const [plans, statuses, reviews] = await Promise.all([
      getAllPlans(),
      getDayStatuses(userId),
      kind === 'review' ? getReviews(userId, 'daily') : Promise.resolve([]),
    ])
    const days = next7Dates()
    const start = days[0]
    const ctxLines: string[] = []
    // 过去两周计划完成情况
    const recent = plans
      .filter((p) => p.date >= start)
      .sort((a, b) => a.date.localeCompare(b.date))
    const byDate = new Map<string, { total: number; done: number }>()
    for (const p of recent) {
      const e = byDate.get(p.date) || { total: 0, done: 0 }
      e.total++
      if (p.is_completed) e.done++
      byDate.set(p.date, e)
    }
    const stMap = new Map(statuses.map((s) => [s.date, s.status]))
    for (const [date, e] of byDate) {
      ctxLines.push(`- ${date}：完成 ${e.done}/${e.total}，当日状态 ${stMap.get(date) ?? '未标记'}`)
    }
    if (kind === 'review') {
      const rvLines = reviews
        .filter((r) => r.date >= start)
        .slice(0, 7)
        .map((r) => `- ${r.date}：${(r.content || '').slice(0, 80)}`)
      if (rvLines.length) ctxLines.push('近 7 天复盘：\n' + rvLines.join('\n'))
    }
    return ctxLines.join('\n') || '（暂无历史数据）'
  }

  const generate = async () => {
    if (!hasAiApiKey()) {
      toast.error('请先在「设置 → AI 功能隐私保护」填写你的通义千问 API Key')
      return
    }
    if (!hasAiAccess()) {
      setShowPassword(true)
      return
    }
    setLoading(true)
    setError('')
    try {
      const ctx = await buildContext()
      const dates = next7Dates()
      const dateList = dates.join('、')
      const prompt =
        kind === 'plan'
          ? `以下是我的历史计划完成情况：\n${ctx}\n\n请为我制定未来 7 天（${dateList}）的计划。请按「模块」分类（模块如：言语理解、数量关系、判断推理、资料分析、常识判断、申论等）。每一天用一条记录表示，tasks 为任务数组，每个任务含 module（模块名）、task（具体任务）、status（该任务所属状态：fish=摸鱼/全天有空，halfday=半天有空，overtime=没空）。请确保每一天都覆盖三种状态（fish、halfday、overtime）的任务。按 JSON 返回：{"days":[{"date":"YYYY-MM-DD","tasks":[{"module":"资料分析","task":"完成 15 题","status":"fish"},{"module":"言语理解","task":"篇章阅读 2 篇","status":"halfday"},{"module":"常识判断","task":"背诵知识点","status":"overtime"}]}, ... ],"note":"总体建议"}。只返回 JSON。`
          : `以下是我的历史复盘与计划完成情况：\n${ctx}\n\n请生成周复盘与下周计划（${dateList}）。请按「模块」分类（模块如：言语理解、数量关系、判断推理、资料分析、常识判断、申论等）。每一天用一条记录表示，tasks 为任务数组，每个任务含 module（模块名）、task（具体任务）、status（该任务所属状态：fish=摸鱼/全天有空，halfday=半天有空，overtime=没空）。请确保每一天都覆盖三种状态。按 JSON 返回：{"review":{"summary":"一句话总结","key_points":["要点"],"analysis":"详细复盘分析"},"plan":{"days":[{"date":"YYYY-MM-DD","tasks":[{"module":"资料分析","task":"完成 15 题","status":"fish"},{"module":"言语理解","task":"阅读 2 篇","status":"halfday"}]}, ... ],"note":"下周建议"}}。只返回 JSON。`

      const reply = await aiCoachChat([{ role: 'user', content: prompt }])
      const cleaned = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const parsed = JSON.parse(cleaned)

      if (kind === 'review' && parsed.review) {
        setRvSummary(parsed.review.summary || '')
        setRvKeyPoints((parsed.review.key_points || []).join('\n'))
        setRvAnalysis(parsed.review.analysis || '')
      }
      const pd: PlanDay[] = (parsed.days || parsed.plan?.days || []).map((d: any) => ({
        date: d.date,
        tasks: (Array.isArray(d.tasks) ? d.tasks : []).map((t: any) => {
          if (typeof t === 'string') return { module: '自主安排', title: t, status: 'halfday' as StudyMode }
          return {
            module: t.module || '自主安排',
            title: t.task || t.title || '',
            status: STATUS_SEQ.includes(t.status) ? (t.status as StudyMode) : ('halfday' as StudyMode),
          }
        }),
      }))
      setPlanDays(pd)
      setPlanNote(parsed.note || parsed.plan?.note || '')
      setGenerated(true)
    } catch (e: any) {
      setError(e.message || 'AI 生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 打开后自动触发一次生成
  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const applyPlan = async () => {
    const statusSet = new Set<string>()
    for (const d of planDays) {
      // 按状态分组，再写入每日计划
      const byStatus = new Map<StudyMode, PlanTask[]>()
      for (const t of d.tasks) {
        if (!t.title.trim()) continue
        const arr = byStatus.get(t.status) ?? []
        arr.push(t)
        byStatus.set(t.status, arr)
      }
      if (byStatus.size > 0 && !statusSet.has(d.date)) {
        statusSet.add(d.date)
        await upsertDayStatus({ user_id: userId, date: d.date, status: byStatus.keys().next().value as StudyMode })
      }
      let order = 0
      for (const [status, tasks] of byStatus) {
        for (const t of tasks) {
          await import('@/lib/api').then((m) =>
            m.upsertDailyPlan({
              id: '',
              user_id: userId,
              date: d.date,
              mode: status,
              plan_type: 'sub',
              module_name: t.module || '自主安排',
              task_title: t.title.trim(),
              is_completed: false,
              task_category: 'normal',
              sort_order: order++,
              is_ai: true,
            })
          )
        }
      }
    }
  }

  const handleAdopt = async () => {
    try {
      if (kind === 'review') {
        await addReview.mutateAsync({
          user_id: userId,
          type: 'weekly',
          date: todayStr(),
          content: rvAnalysis,
          key_points: rvKeyPoints,
          summary: rvSummary,
          next_plan: planNote,
        })
      }
      await applyPlan()
      toast.success(kind === 'review' ? '周复盘已保存，下周计划已生成' : '未来一周计划已生成')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || '采纳失败')
    }
  }

  const title = kind === 'review' ? '一键生成周复盘 + 周计划' : 'AI 制定未来一周计划'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            AI 正在分析你的历史数据...
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={generate} size="sm" variant="outline" className="gap-1.5">
              <RotateCcw className="size-3.5" />
              重试
            </Button>
          </div>
        )}

        {!loading && generated && (
          <div className="space-y-4">
            {kind === 'review' && (
              <div className="space-y-2">
                <Labeled label="一句话总结">
                  <Textarea value={rvSummary} onChange={(e) => setRvSummary(e.target.value)} className="min-h-12 text-sm" />
                </Labeled>
                <Labeled label="关键要点（每行一条）">
                  <Textarea value={rvKeyPoints} onChange={(e) => setRvKeyPoints(e.target.value)} className="min-h-20 text-sm" />
                </Labeled>
                <Labeled label="详细复盘">
                  <Textarea value={rvAnalysis} onChange={(e) => setRvAnalysis(e.target.value)} className="min-h-24 text-sm" />
                </Labeled>
              </div>
            )}

            {/* 周计划（按模块分类） */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Sparkles className="size-4 text-primary" />
                未来一周计划（按模块分类）
              </p>
              {planDays.map((day, dayIndex) => {
                // 同一天按模块分组
                const moduleGroups = new Map<string, { t: PlanTask; ti: number }[]>()
                day.tasks.forEach((t, ti) => {
                  const arr = moduleGroups.get(t.module) ?? []
                  arr.push({ t, ti })
                  moduleGroups.set(t.module, arr)
                })
                return (
                  <div key={day.date} className="rounded-lg border border-border p-2.5">
                    <p className="mb-1.5 text-sm font-medium">{day.date.slice(5)}</p>
                    {[...moduleGroups.entries()].map(([module, items]) => (
                      <div key={module} className="mb-2 border-l-2 pl-2" style={{ borderColor: 'currentColor' }}>
                        <div className="mb-1">
                          <Badge variant="secondary" className="text-[10px]">{module}</Badge>
                        </div>
                        {items.map(({ t, ti }) => {
                          const meta = getModeMeta(t.status)
                          return (
                            <div key={ti} className="mb-1.5 flex items-center gap-1.5">
                              <span className={`size-2.5 shrink-0 rounded-full ${t.status === 'fish' ? 'bg-success' : t.status === 'halfday' ? 'bg-warning' : 'bg-destructive'}`} />
                              <Badge variant="outline" className={`shrink-0 text-[10px] ${meta.accent}`}>{meta.short}</Badge>
                              <input
                                value={t.title}
                                onChange={(e) =>
                                  setPlanDays((prev) =>
                                    prev.map((p, j) =>
                                      j === dayIndex
                                        ? { ...p, tasks: p.tasks.map((x, k) => (k === ti ? { ...x, title: e.target.value } : x)) }
                                        : p
                                    )
                                  )
                                }
                                className="w-full rounded border border-border px-2 py-1 text-xs"
                                placeholder="任务内容"
                              />
                            </div>
                          )
                        })}
                        <button
                          onClick={() =>
                            setPlanDays((prev) =>
                              prev.map((p, j) =>
                                j === dayIndex ? { ...p, tasks: [...p.tasks, { module, title: '', status: 'halfday' }] } : p
                              )
                            )
                          }
                          className="text-[11px] text-primary hover:underline"
                        >
                          + 添加一行
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
              {planNote && (
                <p className="text-xs text-muted-foreground">建议：{planNote}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {generated && (
            <Button onClick={handleAdopt} className="w-full" variant="default">
              <Check className="size-4" />
              一键采纳
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AiPasswordDialog
        open={showPassword}
        onClose={() => setShowPassword(false)}
        onVerified={() => generate()}
      />
    </Dialog>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
