import { useState, useMemo } from 'react'
import { NotebookPen, Sparkles, ListChecks, Target, Bot, ChevronDown, ChevronUp, Calendar, Filter, CheckSquare, Square, Trash2, MoreHorizontal } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ReviewForm } from '@/components/ReviewForm'
import { AIReviewDialog } from '@/components/AIReviewDialog'
import { AiReviewChatDialog } from '@/components/AiReviewChatDialog'
import { useAppStore, todayStr } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useReviews } from '@/hooks/useData'
import { useQueryClient } from '@tanstack/react-query'
import { getAllPlans, getDayStatuses, getReviews, deleteReview } from '@/lib/api'
import type { Review, ReviewType } from '@/lib/types'

function next7Dates(): string[] {
  const out: string[] = []
  const base = new Date(todayStr() + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}

async function buildWeeklyContext(userId: string): Promise<string> {
  const [plans, statuses, reviews] = await Promise.all([
    getAllPlans(),
    getDayStatuses(userId),
    getReviews(userId, 'daily'),
  ])
  const start = next7Dates()[0]
  const recent = plans.filter((p) => p.date >= start).sort((a, b) => a.date.localeCompare(b.date))
  const byDate = new Map<string, { total: number; done: number }>()
  for (const p of recent) {
    const e = byDate.get(p.date) || { total: 0, done: 0 }
    e.total++
    if (p.is_completed) e.done++
    byDate.set(p.date, e)
  }
  const stMap = new Map(statuses.map((s) => [s.date, s.status]))
  const ctxLines: string[] = []
  for (const [date, e] of byDate) {
    ctxLines.push(`- ${date}：完成 ${e.done}/${e.total}，当日状态 ${stMap.get(date) ?? '未标记'}`)
  }
  const rvLines = reviews
    .filter((r) => r.date >= start)
    .slice(0, 7)
    .map((r) => `- ${r.date}：${(r.content || '').slice(0, 80)}`)
  if (rvLines.length) ctxLines.push('近 7 天复盘：\n' + rvLines.join('\n'))
  return ctxLines.join('\n') || '（暂无历史数据）'
}

export default function ReviewCenterPage() {
  const userId = useAppStore((s) => s.user?.uid ?? '')

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">复盘中心</h2>
          <p className="text-xs text-muted-foreground">每日反思 · 每周总结</p>
        </div>
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="daily">每日复盘</TabsTrigger>
          <TabsTrigger value="weekly">每周复盘</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="space-y-4">
          <ReviewPanel userId={userId} type="daily" />
        </TabsContent>
        <TabsContent value="weekly" className="space-y-4">
          <ReviewPanel userId={userId} type="weekly" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReviewPanel({ userId, type }: { userId: string; type: ReviewType }) {
  const reviews = useReviews(type)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPlanOpen, setAiPlanOpen] = useState(false)
  const [weeklyContext, setWeeklyContext] = useState('')

  const qc = useQueryClient()
  // 选择删除模式
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 日期筛选
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilter, setShowFilter] = useState(false)

  const filtered = useMemo(() => {
    const data = reviews.data ?? []
    if (!dateFrom && !dateTo) return data
    return data.filter((r) => {
      if (dateFrom && r.date < dateFrom) return false
      if (dateTo && r.date > dateTo) return false
      return true
    })
  }, [reviews.data, dateFrom, dateTo])

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((r) => r.id)))
  }
  const handleDeleteSelected = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      for (const id of ids) await deleteReview(id)
      await qc.invalidateQueries({ queryKey: ['reviews', userId, type] })
      setSelected(new Set())
      setSelectMode(false)
      toast.success(`已删除 ${ids.length} 条复盘`)
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return (
    <>
      {/* AI 复盘入口 + 复盘表单 */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {selectMode ? (
          <>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={toggleSelectAll}>
              <CheckSquare className="size-4" />
              {allSelected ? '取消全选' : '全选'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleDeleteSelected}
              disabled={selected.size === 0}
            >
              <Trash2 className="size-4" />
              删除选中（{selected.size}）
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelected(new Set()) }}>
              取消
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectMode(true)}>
              <CheckSquare className="size-4" />
              选择
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <MoreHorizontal className="size-4" />
                  更多
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {type === 'weekly' && (
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={async () => {
                      const ctx = await buildWeeklyContext(userId)
                      setWeeklyContext(ctx)
                      setAiPlanOpen(true)
                    }}
                  >
                    <Sparkles className="size-4" />
                    一键生成
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="gap-2" onClick={() => setAiOpen(true)}>
                  <Bot className="size-4" />
                  AI 复盘
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <ReviewForm userId={userId} type={type} />

      {/* 历史复盘 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <NotebookPen className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground">历史复盘</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilter(!showFilter)}
            className="gap-1 text-xs h-7"
          >
            <Filter className="size-3.5" />
            {showFilter ? '收起筛选' : '日期筛选'}
          </Button>
        </div>

        {/* 日期筛选栏 */}
        {showFilter && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-2.5">
            <Calendar className="size-4 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 text-xs"
              placeholder="开始日期"
            />
            <span className="text-xs text-muted-foreground shrink-0">至</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 text-xs"
              placeholder="结束日期"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs shrink-0"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                }}
              >
                清除
              </Button>
            )}
          </div>
        )}

        {reviews.isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">加载中...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {dateFrom || dateTo
                ? '该日期范围内暂无复盘'
                : `还没有${type === 'weekly' ? '每周' : '每日'}复盘`}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                selectMode={selectMode}
                selected={selected.has(r.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* AI 复盘弹窗 */}
      <AIReviewDialog open={aiOpen} onClose={() => setAiOpen(false)} type={type} />

      {/* 一键生成周复盘 + 周计划（对话式） */}
      <AiReviewChatDialog
        open={aiPlanOpen}
        onOpenChange={setAiPlanOpen}
        type="weekly"
        contextText={weeklyContext}
        title="周复盘对话生成"
      />
    </>
  )
}

/** 单条复盘卡片：默认折叠显示关键要点，点击展开完整内容；选择模式下点击卡片即选中 */
function ReviewCard({
  review,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  review: Review
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const keyPoints: string[] = useMemo(() => {
    if (!review.key_points) return []
    // 如果后端已经返回数组，直接使用
    if (Array.isArray(review.key_points)) return review.key_points
    // 尝试 JSON 解析
    try {
      const parsed = JSON.parse(review.key_points)
      if (Array.isArray(parsed)) return parsed
      return []
    } catch {
      // 可能是换行分隔的字符串
      if (typeof review.key_points === 'string') {
        return review.key_points
          .split('\n')
          .map((s: string) => s.trim())
          .filter(Boolean)
      }
      return []
    }
  }, [review.key_points])

  const hasContent = !!review.content?.trim()
  const hasKeyPoints = keyPoints.length > 0

  return (
    <Card
      className={cn(
        'transition-colors',
        selectMode ? 'cursor-pointer' : 'cursor-pointer hover:bg-muted/30',
        selectMode && selected && 'border-primary bg-primary/5'
      )}
    >
      <CardContent
        className="py-3 space-y-2"
        onClick={() => {
          if (selectMode) {
            onToggleSelect?.(review.id)
            return
          }
          if (hasContent) setExpanded(!expanded)
        }}
      >
        {/* 头部：日期 + 标签 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSelect?.(review.id)
                }}
                className="shrink-0 text-primary"
                aria-label="选择"
              >
                {selected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
              </button>
            )}
            <Badge variant="outline" className="gap-1">
              <Calendar className="size-3" />
              {review.date}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {hasKeyPoints && (
              <Badge variant="secondary" className="text-xs">
                {keyPoints.length} 个要点
              </Badge>
            )}
            {hasContent && !selectMode && (
              <Button variant="ghost" size="icon" className="size-6" asChild>
                <span>
                  {expanded ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* 默认显示：关键要点 */}
        {hasKeyPoints ? (
          <div className="rounded-lg bg-muted/40 p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <ListChecks className="size-3.5 text-primary" />
              关键要点
            </span>
            <ul className="mt-1.5 space-y-1">
              {keyPoints.map((kp, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground pl-4 relative before:absolute before:left-1 before:top-2 before:size-1.5 before:rounded-full before:bg-primary/60"
                >
                  {kp}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          !expanded && hasContent && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {review.content}
            </p>
          )
        )}

        {/* 展开后显示完整内容 */}
        {expanded && hasContent && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{review.content}</p>

            {review.summary && (
              <div className="rounded-lg bg-primary/5 p-2.5">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Sparkles className="size-3.5 text-primary" />
                  总结
                </span>
                <p className="mt-1 text-sm text-muted-foreground">{review.summary}</p>
              </div>
            )}

            {review.next_plan && (
              <div className="rounded-lg bg-muted/40 p-2.5">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Target className="size-3.5 text-primary" />
                  后续计划
                </span>
                <p className="mt-1 text-sm text-muted-foreground">{review.next_plan}</p>
              </div>
            )}
          </div>
        )}

        {/* 无内容提示 */}
        {!hasContent && !hasKeyPoints && (
          <p className="text-xs text-muted-foreground">暂无内容</p>
        )}
      </CardContent>
    </Card>
  )
}
