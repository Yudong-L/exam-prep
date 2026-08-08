import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, CheckCircle2, XCircle, ChevronRight, ChevronDown, Trash2, MessageCircle, BookX, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AIGradingForm } from '@/components/AIGradingForm'
import { AIChatDialog } from '@/components/AIChatDialog'
import { useAppStore } from '@/store/useAppStore'
import { useGradingHistory, useAddMistake } from '@/hooks/useData'
import { deleteGradingRecord, findDuplicateMistake } from '@/lib/api'
import { toast } from 'sonner'
import type { AiGradingRecord } from '@/lib/types'

export default function AIGradingPage() {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const history = useGradingHistory()
  const addMistake = useAddMistake()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    try {
      await deleteGradingRecord(id)
      history.refetch()
      toast.success('已删除')
    } catch { toast.error('删除失败') }
  }

  const handleAddToMistake = async (r: AiGradingRecord) => {
    const dup = await findDuplicateMistake(userId, r.question_content, r.module_type)
    if (dup) {
      toast.warning('该题已在错题本中（重复添加）')
      return
    }
    await addMistake.mutateAsync({
      user_id: userId,
      module_type: r.module_type,
      stem: r.question_content,
      question_content: r.question_content,
      error_reasons: [],
      correct_solution: r.ai_analysis,
      analysis: r.ai_analysis,
      source: 'ai',
      source_id: undefined,
      image_url: r.image_url || undefined,
    })
    toast.success('已加入错题本')
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h2 className="text-xl font-bold">AI 智能批改</h2>
        <p className="text-xs text-muted-foreground">结构化输入，通义千问 AI 批改</p>
      </div>

      <AIGradingForm userId={userId} onGraded={() => history.refetch()} />

      {/* 历史记录 */}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <History className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-muted-foreground">批改历史</p>
        </div>
        {history.isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">加载中...</p>
        ) : (history.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              还没有批改记录
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.data!.map((r) => (
              <GradingHistoryCard
                key={r.id}
                record={r}
                expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onDelete={() => handleDelete(r.id)}
                onAddToMistake={() => handleAddToMistake(r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GradingHistoryCard({
  record: r,
  expanded,
  onToggle,
  onDelete,
  onAddToMistake,
}: {
  record: AiGradingRecord
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onAddToMistake: () => void
}) {
  const [showChat, setShowChat] = useState(false)
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (adding) return
    setAdding(true)
    try {
      await onAddToMistake()
    } finally {
      setAdding(false)
    }
  }

  const chatHistory = [
    {
      role: 'assistant' as const,
      content: `【评分】${r.score || '—'}分\n【判定】${r.ai_result || ''}\n【解析】${r.ai_analysis || ''}`,
    },
  ]

  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:bg-accent/30"
      onClick={onToggle}
    >
      <CardContent className="py-3">
        <div className="flex items-center gap-3">
          {r.is_correct ? (
            <CheckCircle2 className="size-5 shrink-0 text-success" />
          ) : (
            <XCircle className="size-5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{r.module_type}</Badge>
              <span className="text-xs text-muted-foreground">
                {r.created_at?.slice(0, 10)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm">{r.question_content}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={r.is_correct ? 'text-sm font-bold text-success' : 'text-sm font-bold text-destructive'}>
              {r.score}分
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* 展开详情 */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                {r.image_url && (
                  <div className="flex justify-center">
                    <img src={r.image_url} alt="题目图片" className="max-h-48 rounded-lg border" />
                  </div>
                )}
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">题干</p>
                  <p className="text-sm">{r.question_content}</p>
                  {r.points && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">论点：</span>{r.points}
                    </p>
                  )}
                  {r.arguments && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">论据：</span>{r.arguments}
                    </p>
                  )}
                  {r.text_structure && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">结构/特征：</span>{r.text_structure}
                    </p>
                  )}
                  {r.formula && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">公式：</span>{r.formula}
                    </p>
                  )}
                  {r.prediction_direction && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">预判：</span>{r.prediction_direction}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">我的答案</p>
                  <p className="text-sm">{r.user_answer}</p>
                </div>
                {r.reference_answer && (
                  <div className="rounded-lg bg-success/5 p-2.5">
                    <p className="mb-1 text-xs font-medium text-success">参考答案</p>
                    <p className="text-sm">{r.reference_answer}</p>
                  </div>
                )}
                <div className="rounded-lg bg-primary/5 p-2.5">
                  <p className="mb-1 text-xs font-medium text-primary">AI 判定</p>
                  <p className="text-sm font-medium">{r.ai_result}</p>
                </div>
                <div className="rounded-lg bg-primary/5 p-2.5">
                  <p className="mb-1 text-xs font-medium text-primary">AI 解析</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.ai_analysis}</p>
                </div>

                {/* 操作区：加入错题本 + 与 AI 讨论 */}
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={(e) => { e.stopPropagation(); handleAdd() }}
                    disabled={adding}
                  >
                    {adding ? <Loader2 className="size-3.5 animate-spin" /> : <BookX className="size-3.5" />}
                    加入错题本
                  </Button>
                  {!showChat ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={(e) => { e.stopPropagation(); setShowChat(true) }}
                    >
                      <MessageCircle className="size-3.5" />
                      与 AI 老师讨论此题
                    </Button>
                  ) : (
                    <AIChatDialog
                      history={chatHistory}
                      moduleType={r.module_type}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
