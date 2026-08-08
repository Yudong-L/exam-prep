import { useState } from 'react'
import { Plus, Trash2, CheckCheck, Lightbulb, ChevronDown, ChevronUp, CalendarClock, Bot, Sparkles, CheckSquare, Square, Dumbbell, Pencil, Download, SlidersHorizontal, Search, MoreHorizontal } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { MistakeDialog, type MistakeFormValues } from '@/components/MistakeDialog'
import { AiReviewChatDialog } from '@/components/AiReviewChatDialog'
import { AiMistakeCreateDialog } from '@/components/AiMistakeCreateDialog'
import { useAppStore } from '@/store/useAppStore'
import {
  useMistakes,
  useUpdateMistake,
  useDeleteMistake,
} from '@/hooks/useData'
import { addMistakesToQuizBank } from '@/lib/api'
import { MODULES, ERROR_REASONS } from '@/lib/constants'
import { downloadCSV } from '@/lib/export'
import { toast } from 'sonner'
import type { Mistake } from '@/lib/types'

function toFormValues(m: Mistake): Partial<MistakeFormValues> {
  return {
    id: m.id,
    module_type: m.module_type,
    question_content: m.stem || m.question_content,
    material: m.material,
    options: m.options,
    answer: m.answer,
    error_reasons: m.error_reasons,
    analysis: m.analysis ?? m.correct_solution,
    key_points: m.key_points,
    review_date: m.review_date,
    image_url: m.image_url,
  }
}

export default function MistakeBookPage() {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const [module, setModule] = useState<string>('all')
  const [reason, setReason] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editInitial, setEditInitial] = useState<Partial<MistakeFormValues> | undefined>(undefined)

  const mistakes = useMistakes(module === 'all' ? undefined : module)
  const updateMistake = useUpdateMistake()
  const deleteMistake = useDeleteMistake()

  // AI 制题
  const [aiCreateOpen, setAiCreateOpen] = useState(false)
  // AI 复盘（仅针对选中的错题）
  const [reviewContext, setReviewContext] = useState('')
  const [aiReviewOpen, setAiReviewOpen] = useState(false)

  // 批量选择
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  // 卡片展开（显示 正确答案 / 我的答案 / 解析 / 关键要点）
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // 筛选区是否展开（收纳式，默认收起）
  const [filterOpen, setFilterOpen] = useState(false)
  // 文字搜索
  const [search, setSearch] = useState('')

  const list = mistakes.data ?? []
  const q = search.trim().toLowerCase()
  const displayList = list.filter((m) => {
    if (reason !== 'all' && !(m.error_reasons || []).includes(reason)) return false
    if (q) {
      const hay = [
        m.stem || m.question_content,
        m.material,
        m.analysis || m.correct_solution,
        m.key_points,
        m.answer,
        m.module_type,
        ...(m.error_reasons || []),
        ...(m.options || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // 仅导出选中的错题为 CSV（#2 / #3）
  const handleExportSelected = () => {
    const chosen = list.filter((m) => selected.includes(m.id))
    if (chosen.length === 0) {
      toast.warning('请先选择要导出的错题')
      return
    }
    downloadCSV(
      '错题本_选中.csv',
      ['模块', '题干', '材料', '选项', '答案', '错因', '解析', '关键要点', '来源', '复盘日期', '已掌握'],
      chosen.map((m) => [
        m.module_type,
        m.stem || m.question_content,
        m.material || '',
        (m.options || []).join(' | '),
        m.answer || '',
        (m.error_reasons || []).join('；'),
        m.analysis || m.correct_solution || '',
        m.key_points || '',
        m.source,
        m.review_date || '',
        m.mastered ? '是' : '否',
      ])
    )
  }

  const handleDelete = async (id: string) => {
    await deleteMistake.mutateAsync(id)
    setSelected((s) => s.filter((x) => x !== id))
    toast.success('已删除')
  }

  const handleMastered = async (id: string, mastered: boolean) => {
    await updateMistake.mutateAsync({ id, patch: { mastered: !mastered } })
  }

  const handleReviewed = async (id: string, count: number) => {
    await updateMistake.mutateAsync({ id, patch: { reviewed_count: count + 1 } })
    toast.success('已标记复盘')
  }

  const toggleSelect = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = displayList.length > 0 && selected.length === displayList.length
  const toggleSelectAll = () => {
    if (allSelected) setSelected([])
    else setSelected(displayList.map((m) => m.id))
  }

  // 仅针对选中的错题发起 AI 复盘（#3：选择了才复盘）
  const handleReviewSelected = () => {
    const chosen = list.filter((m) => selected.includes(m.id))
    if (chosen.length === 0) {
      toast.warning('请先选择要复盘的错题')
      return
    }
    const ctx =
      `请针对以下选中的 ${chosen.length} 道错题进行复盘指导（只复盘这些，其余忽略）：\n` +
      chosen
        .map(
          (m, i) =>
            `${i + 1}. [${m.module_type}] ${m.stem || m.question_content}\n   错误原因：${(m.error_reasons || []).join('；')}\n   关键要点：${m.key_points || '（无）'}`
        )
        .join('\n')
    setReviewContext(ctx)
    setAiReviewOpen(true)
  }

  const handleAddToQuiz = async () => {
    const chosen = displayList.filter((m) => selected.includes(m.id))
    if (chosen.length === 0) {
      toast.warning('请先选择错题')
      return
    }
    try {
      const bank = await addMistakesToQuizBank(chosen as Mistake[])
      toast.success(`已加入练习题库「${bank?.name}」，去「刷题练习」即可练习`)
      setSelectMode(false)
      setSelected([])
    } catch (e: any) {
      toast.error(e.message || '加入失败')
    }
  }

  const handleDeleteSelected = async () => {
    if (selected.length === 0) {
      toast.warning('请先选择错题')
      return
    }
    const ids = [...selected]
    try {
      for (const id of ids) {
        await deleteMistake.mutateAsync(id)
      }
      toast.success(`已删除 ${ids.length} 道错题`)
      setSelected([])
      setSelectMode(false)
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">错题本</h2>
          <p className="text-xs text-muted-foreground">共 {displayList.length} 道 · 查漏补缺</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectMode ? (
            <>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={toggleSelectAll}>
                <CheckSquare className="size-4" />
                {allSelected ? '取消全选' : '全选'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelected([]) }}>
                取消
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => setSelectMode(true)}>
              <CheckSquare className="size-4" />
              选择
            </Button>
          )}
          <Button size="sm" className="ml-1" onClick={() => { setEditInitial(undefined); setDialogOpen(true) }}>
            <Plus className="size-4" />
            添加
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <MoreHorizontal className="size-4" />
                更多
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAiCreateOpen(true)} className="gap-2">
                <Bot className="size-4 text-primary" />
                AI 对话制题
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSelected} disabled={selected.length === 0} className="gap-2">
                <Download className="size-4" />
                导出选中
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 文字搜索 */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索题干、材料、解析、要点…"
          className="pl-8"
        />
      </div>

      {/* 筛选（收纳式：默认收起，点击展开） */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={!filterOpen} onClick={() => setFilterOpen((o) => !o)}>
          <SlidersHorizontal className="mr-1 inline size-3" />
          {filterOpen ? '收起筛选' : '筛选'}
        </FilterChip>
        {search.trim() !== '' && (
          <FilterChip active onClick={() => setSearch('')}>
            搜索：{search} ×
          </FilterChip>
        )}
        {module !== 'all' && (
          <FilterChip active onClick={() => setModule('all')}>
            {module} ×
          </FilterChip>
        )}
        {reason !== 'all' && (
          <FilterChip active onClick={() => setReason('all')}>
            {reason} ×
          </FilterChip>
        )}
      </div>

      {filterOpen && (
        <>
          {/* 模块筛选 */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={module === 'all'} onClick={() => setModule('all')}>
              全部
            </FilterChip>
            {MODULES.map((m) => (
              <FilterChip key={m} active={module === m} onClick={() => setModule(m)}>
                {m}
              </FilterChip>
            ))}
          </div>

          {/* 错因筛选 */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={reason === 'all'} onClick={() => setReason('all')}>
              全部错因
            </FilterChip>
            {ERROR_REASONS.map((r) => (
              <FilterChip key={r} active={reason === r} onClick={() => setReason(r)}>
                {r}
              </FilterChip>
            ))}
          </div>
        </>
      )}

      {/* 列表 */}
      {mistakes.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">加载中...</p>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            暂无错题，点击右上角「添加」
          </CardContent>
        </Card>
      ) : displayList.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            没有符合筛选条件的错题，换个筛选试试
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {displayList.map((m) => {
            const isOpen = expanded.has(m.id)
            return (
              <Card key={m.id} className={cn(m.mastered && 'opacity-70')}>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectMode && (
                        <button onClick={() => toggleSelect(m.id)} className="shrink-0 text-primary">
                          {selected.includes(m.id) ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                        </button>
                      )}
                      <Badge variant="secondary">{m.module_type}</Badge>
                      {m.mastered && <Badge className="bg-success text-success-foreground">已掌握</Badge>}
                      {m.source === 'ai' && (
                        <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">AI</Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => { setEditInitial(toFormValues(m)); setDialogOpen(true) }}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        aria-label="编辑"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="删除"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* 始终可见：材料（黑色）/ 题干 / 选项 / 错因 */}
                  <div className="space-y-1.5">
                    {m.material && (
                      <p className="break-any text-xs leading-relaxed text-foreground">{m.material}</p>
                    )}

                    <p className="break-any text-xs leading-relaxed text-foreground">{m.stem || m.question_content}</p>

                    {m.options && m.options.length > 0 && (
                      <ul className="space-y-0.5 text-xs text-foreground/90">
                        {m.options.map((opt, i) => (
                          <li key={i} className="break-any">
                            {String.fromCharCode(65 + i)}. {opt}
                          </li>
                        ))}
                      </ul>
                    )}

                    {m.image_url && (
                      <div className="flex justify-center">
                        <img src={m.image_url} alt="错题图片" className="max-h-36 rounded-lg border" />
                      </div>
                    )}

                    {m.error_reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.error_reasons.map((r) => (
                          <Badge key={r} variant="outline" className="text-destructive">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => toggleExpand(m.id)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    {isOpen ? '收起详情' : '展开详情'}
                  </button>

                  {/* 展开后显示：正确答案 / 我的答案 / 解析 / 关键要点 */}
                  {isOpen && (
                    <div className="mt-1 space-y-2 border-t border-dashed border-border pt-2">
                      {m.answer && (
                        <div className="text-xs leading-relaxed">
                          <span className="font-medium text-foreground">正确答案：</span>
                          <span className="break-any text-foreground/90">{m.answer}</span>
                        </div>
                      )}

                      {m.my_answer && (
                        <div className="text-xs leading-relaxed">
                          <span className="font-medium text-foreground">我的答案：</span>
                          <span
                            className={cn(
                              'break-any',
                              m.answer && m.my_answer !== m.answer
                                ? 'font-medium text-destructive'
                                : 'text-foreground/90'
                            )}
                          >
                            {m.my_answer}
                          </span>
                        </div>
                      )}

                      {(m.analysis || m.correct_solution) && (
                        <div className="rounded-lg bg-muted/50 p-2.5 text-xs leading-relaxed">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Lightbulb className="size-3.5 text-warning" />
                            解析
                          </span>
                          <p className="break-any mt-1 text-foreground/90">{m.analysis || m.correct_solution}</p>
                        </div>
                      )}

                      {m.key_points && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs leading-relaxed">
                          <span className="font-medium text-primary">关键要点</span>
                          <p className="break-any mt-0.5 text-foreground/90">{m.key_points}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5" />
                      {m.review_date ? `复盘日 ${m.review_date}` : `已复盘 ${m.reviewed_count} 次`}
                    </span>
                    {!selectMode && (
                      <div className="flex gap-2">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => handleReviewed(m.id, m.reviewed_count)}
                        >
                          标记复盘
                        </button>
                        <button
                          className={cn('hover:underline', m.mastered ? 'text-success' : 'text-muted-foreground')}
                          onClick={() => handleMastered(m.id, m.mastered)}
                        >
                          <CheckCheck className="mr-0.5 inline size-3.5" />
                          {m.mastered ? '已掌握' : '标记掌握'}
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* 批量操作底栏 */}
      {selectMode && (
        <div className="sticky bottom-3 flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-lg">
          <span className="text-xs text-muted-foreground">已选 {selected.length} 道</span>
          <Button size="sm" variant="destructive" className="ml-auto gap-1.5" onClick={handleDeleteSelected} disabled={selected.length === 0}>
            <Trash2 className="size-4" />
            删除
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleReviewSelected} disabled={selected.length === 0}>
            <Sparkles className="size-4 text-primary" />
            AI 复盘
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleAddToQuiz} disabled={selected.length === 0}>
            <Dumbbell className="size-4" />
            加入题库
          </Button>
        </div>
      )}

      <MistakeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        initial={editInitial}
        onSaved={() => setDialogOpen(false)}
      />

      {/* AI 制题 */}
      <AiMistakeCreateDialog open={aiCreateOpen} onOpenChange={setAiCreateOpen} />

      {/* AI 复盘对话（基于选中的错题） */}
      <AiReviewChatDialog
        open={aiReviewOpen}
        onOpenChange={setAiReviewOpen}
        type="mistake"
        contextText={reviewContext}
        title="错题 AI 复盘"
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-muted/40 text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  )
}
