import { useState, useEffect, useRef } from 'react'
import { Bot, Sparkles, Check } from 'lucide-react'
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
import { aiReviewChat, aiCoachChat, hasAiAccess, hasAiApiKey } from '@/lib/ai-service'
import { AiPasswordDialog } from '@/components/AiPasswordDialog'
import { AiChatThread, type AiChatThreadHandle } from '@/components/AiChatThread'
import { upsertDayStatus } from '@/lib/api'
import { useAddReview } from '@/hooks/useData'
import { useAppStore, todayStr } from '@/store/useAppStore'
import { getModeMeta } from '@/lib/constants'
import type { StudyMode } from '@/lib/types'

const STATUS_SEQ: StudyMode[] = ['fish', 'halfday', 'overtime']

/** 从模型返回文本中稳健提取 JSON 对象（兼容 markdown 代码块与前后多余文字） */
function extractJsonObject(text: string): any {
  let s = text.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = s.search(/[[{]/)
  if (start < 0) return null
  const open = s[start]
  const close = open === '[' ? ']' : '}'
  const end = s.lastIndexOf(close)
  if (end <= start) return null
  const candidate = s.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

interface PlanDay {
  date: string
  status: StudyMode
  tasks: string[]
}

interface AiReviewChatDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  type: 'weekly' | 'mistake'
  contextText: string
  title: string
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

export function AiReviewChatDialog({
  open,
  onOpenChange,
  type,
  contextText,
  title,
}: AiReviewChatDialogProps) {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const addReview = useAddReview()
  const threadRef = useRef<AiChatThreadHandle>(null)

  const [result, setResult] = useState<{
    summary: string
    key_points: string[]
    analysis: string
    score: number
  } | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // 计划相关
  const [planDays, setPlanDays] = useState<PlanDay[]>([])
  const [planNote, setPlanNote] = useState('')
  const [planLoading, setPlanLoading] = useState(false)
  const [planGenerated, setPlanGenerated] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (open) {
      setResult(null)
      setSaved(false)
      setPlanDays([])
      setPlanNote('')
      setPlanGenerated(false)
      startedRef.current = false
    }
  }, [open])

  const sendFn = async (
    msgs: { role: 'user' | 'assistant'; content: string }[],
    image?: string,
  ) => {
    const res = await aiReviewChat(msgs, image)
    return { text: res.reply, meta: res }
  }

  const handleMeta = (meta: unknown) => {
    const r = meta as {
      summary: string
      key_points: string[]
      analysis: string
      score: number
    }
    setResult({
      summary: r.summary,
      key_points: r.key_points,
      analysis: r.analysis,
      score: r.score,
    })
  }

  // 打开时自动发起首轮对话
  useEffect(() => {
    if (!open) return
    if (startedRef.current) return
    if (!hasAiApiKey()) {
      toast.error('请先在「设置 → AI 功能隐私保护」填写你的通义千问 API Key')
      return
    }
    if (!hasAiAccess()) {
      setShowPassword(true)
      return
    }
    startedRef.current = true
    threadRef.current?.send(
      `${contextText}\n\n请基于以上内容，给我一份复盘建议，包含：一句话总结、3 个关键要点、详细复盘分析、以及 1-10 的综合评分。`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const saveReview = async (): Promise<boolean> => {
    if (!result) return false
    try {
      setSaving(true)
      await addReview.mutateAsync({
        user_id: userId,
        type: type === 'weekly' ? 'weekly' : 'daily',
        date: todayStr(),
        content: result.analysis,
        key_points: result.key_points.join('\n'),
        summary: result.summary,
        next_plan: planNote,
      })
      setSaved(true)
      return true
    } catch (e: any) {
      toast.error(e.message || '保存失败')
      return false
    } finally {
      setSaving(false)
    }
  }

  const generatePlan = async () => {
    if (!hasAiAccess()) {
      setShowPassword(true)
      return
    }
    setPlanLoading(true)
    try {
      const ctx = result
        ? `基于以下复盘结论制定未来 7 天计划：\n总结：${result.summary}\n要点：${result.key_points.join('；')}\n分析：${result.analysis}`
        : contextText
      const dates = next7Dates()
      const prompt = `请为我制定未来 7 天（${dates.join('、')}）的计划。每一天都必须给出三种状态的任务：fish=摸鱼/全天有空，halfday=半天有空，overtime=没空。
请按 JSON 返回，days 数组中每一天要包含 3 条记录（status 分别为 fish、halfday、overtime，日期相同）：
{"days":[{"date":"YYYY-MM-DD","status":"fish","tasks":["任务1","任务2"]},{"date":"YYYY-MM-DD","status":"halfday","tasks":["任务"]},{"date":"YYYY-MM-DD","status":"overtime","tasks":["任务"]}, ... ],"note":"总体建议"}。
只返回 JSON，不要加其他文字。\n\n${ctx}`
      const reply = await aiCoachChat([{ role: 'user', content: prompt }])
      const parsed = extractJsonObject(reply)
      if (!parsed || !Array.isArray(parsed.days)) {
        toast.error('计划生成失败，请重试')
        return
      }
      const pd: PlanDay[] = parsed.days.map((d: any) => ({
        date: d.date,
        status: STATUS_SEQ.includes(d.status) ? d.status : 'halfday',
        tasks: Array.isArray(d.tasks) ? d.tasks : [],
      }))
      setPlanDays(pd)
      setPlanNote(parsed.note || '')
      setPlanGenerated(true)
    } catch (e: any) {
      toast.error(e.message || '计划生成失败')
    } finally {
      setPlanLoading(false)
    }
  }

  const applyPlan = async () => {
    const statusSet = new Set<string>()
    for (const d of planDays) {
      if (!statusSet.has(d.date)) {
        statusSet.add(d.date)
        await upsertDayStatus({ user_id: userId, date: d.date, status: 'halfday' })
      }
      let order = 0
      for (const t of d.tasks) {
        if (!t.trim()) continue
        await import('@/lib/api').then((m) =>
          m.upsertDailyPlan({
            id: '',
            user_id: userId,
            date: d.date,
            mode: d.status,
            plan_type: 'sub',
            module_name: '自主安排',
            task_title: t.trim(),
            is_completed: false,
            task_category: 'normal',
            sort_order: order++,
            is_ai: true,
          }),
        )
      }
    }
  }

  const adoptPlan = async () => {
    if (!saved) {
      const ok = await saveReview()
      if (!ok) return
    }
    try {
      await applyPlan()
      toast.success('复盘已保存，下周计划已生成')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || '采纳失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* 对话区（与 AI 批改/制作错题共用同一套聊天组件） */}
        <AiChatThread
          ref={threadRef}
          sendFn={sendFn}
          onMeta={handleMeta}
          onError={(msg) => {
            if (msg.includes('密码')) setShowPassword(true)
          }}
          placeholder="补充或纠正 AI 的理解，例如：逻辑判断那块其实已经掌握了"
          accept="image/*"
          heightClass="max-h-[34vh]"
        />

        {/* 复盘结果（可纠正） */}
        {result && (
          <div className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">复盘结果（可修改）</span>
              <Badge variant="outline">评分 {result.score}/10</Badge>
            </div>
            <Textarea
              value={result.summary}
              onChange={(e) => setResult((r) => (r ? { ...r, summary: e.target.value } : r))}
              className="min-h-10 text-sm"
              placeholder="一句话总结"
            />
            <Textarea
              value={result.key_points.join('\n')}
              onChange={(e) =>
                setResult((r) =>
                  r ? { ...r, key_points: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } : r,
                )
              }
              className="min-h-20 text-sm"
              placeholder="关键要点（每行一条）"
            />
            <Textarea
              value={result.analysis}
              onChange={(e) => setResult((r) => (r ? { ...r, analysis: e.target.value } : r))}
              className="min-h-24 text-sm"
              placeholder="详细复盘分析"
            />
          </div>
        )}

        {/* 计划区 */}
        {planGenerated && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              未来一周计划（每天含三种状态）
            </p>
            {(() => {
              const groups = new Map<string, { plan: PlanDay; index: number }[]>()
              planDays.forEach((p, index) => {
                const arr = groups.get(p.date) ?? []
                arr.push({ plan: p, index })
                groups.set(p.date, arr)
              })
              return [...groups.entries()].map(([date, items]) => (
                <div key={date} className="rounded-lg border border-border p-2.5">
                  <p className="mb-1.5 text-sm font-medium">{date.slice(5)}</p>
                  {items.map(({ plan, index }) => {
                    const meta = getModeMeta(plan.status)
                    return (
                      <div key={plan.status} className="mb-2 border-l-2 pl-2" style={{ borderColor: 'currentColor' }}>
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className={
                              'size-2.5 rounded-full ' +
                              (plan.status === 'fish' ? 'bg-success' : plan.status === 'halfday' ? 'bg-warning' : 'bg-destructive')
                            }
                          />
                          <Badge variant="outline" className={meta.accent}>
                            {meta.short}
                          </Badge>
                        </div>
                        {plan.tasks.map((t, ti) => (
                          <input
                            key={ti}
                            value={t}
                            onChange={(e) =>
                              setPlanDays((prev) =>
                                prev.map((p, j) =>
                                  j === index
                                    ? { ...p, tasks: p.tasks.map((x, k) => (k === ti ? e.target.value : x)) }
                                    : p,
                                ),
                              )
                            }
                            className="mb-1 w-full rounded border border-border px-2 py-1 text-xs"
                            placeholder="任务内容"
                          />
                        ))}
                        <button
                          onClick={() =>
                            setPlanDays((prev) =>
                              prev.map((p, j) =>
                                j === index ? { ...p, tasks: [...p.tasks, ''] } : p,
                              ),
                            )
                          }
                          className="text-[11px] text-primary hover:underline"
                        >
                          + 添加一行
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
            {planNote && <p className="text-xs text-muted-foreground">建议：{planNote}</p>}
          </div>
        )}

        <DialogFooter className="flex-col gap-2">
          {result && !planGenerated && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={saveReview} variant="outline" disabled={saving || saved}>
                <Check className="size-4" />
                {saved ? '已保存' : '保存复盘'}
              </Button>
              <Button onClick={generatePlan} variant="outline" disabled={planLoading}>
                <Sparkles className="size-4" />
                {planLoading ? '生成中...' : '生成下周计划'}
              </Button>
            </div>
          )}
          {planGenerated && (
            <Button onClick={adoptPlan} className="w-full">
              <Check className="size-4" />
              采纳计划
            </Button>
          )}
          {saved && (
            <p className="text-center text-xs text-success">复盘已保存</p>
          )}
        </DialogFooter>
      </DialogContent>

      <AiPasswordDialog
        open={showPassword}
        onClose={() => setShowPassword(false)}
        onVerified={() => {
          if (!startedRef.current) {
            startedRef.current = true
            threadRef.current?.send(
              `${contextText}\n\n请基于以上内容，给我一份复盘建议，包含：一句话总结、3 个关键要点、详细复盘分析、以及 1-10 的综合评分。`,
            )
          }
        }}
      />
    </Dialog>
  )
}
