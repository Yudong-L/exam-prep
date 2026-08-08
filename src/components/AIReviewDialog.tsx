import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Save, X, Sparkles, Target, ListChecks, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { aiReviewChat, hasAiAccess, hasAiApiKey } from '@/lib/ai-service'
import { AiPasswordDialog } from '@/components/AiPasswordDialog'
import { useAddReview } from '@/hooks/useData'
import { useAppStore } from '@/store/useAppStore'
import type { ReviewType } from '@/lib/types'

interface AIReviewDialogProps {
  open: boolean
  onClose: () => void
  type: ReviewType
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

interface ReviewResult {
  summary: string
  key_points: string[]
  analysis: string
  score: number
}

export function AIReviewDialog({ open, onClose, type }: AIReviewDialogProps) {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const date = useAppStore((s) => s.currentDate)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const addReview = useAddReview()

  useEffect(() => {
    if (open) {
      setInput('')
      setMessages([])
      setResult(null)
    }
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, result])

  const doSubmit = async () => {
    const text = input.trim()
    if (!text) {
      toast.warning('请描述你的学习情况')
      return
    }
    const nextMessages: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setInput('')
    setLoading(true)
    try {
      const data = await aiReviewChat(nextMessages)
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }])
      setResult({
        summary: data.summary,
        key_points: data.key_points,
        analysis: data.analysis,
        score: data.score,
      })
    } catch (e: any) {
      toast.error(e.message || 'AI 复盘服务暂时不可用')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (!input.trim()) {
      toast.warning('请描述你的学习情况')
      return
    }
    if (!hasAiApiKey()) {
      toast.error('请先在「设置 → AI 功能隐私保护」填写你的通义千问 API Key')
      return
    }
    if (!hasAiAccess()) {
      setShowPassword(true)
      return
    }
    doSubmit()
  }

  const handleSave = async () => {
    if (!result || messages.length === 0) return
    const description = messages.find((m) => m.role === 'user')?.content ?? ''
    setSaving(true)
    try {
      await addReview.mutateAsync({
        user_id: userId,
        type,
        date,
        content: description,
        key_points: result.key_points.join('\n'),
        summary: result.summary,
        next_plan: result.analysis,
      })
      toast.success('AI 复盘建议已保存')
      onClose()
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const isWeekly = type === 'weekly'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <span className="font-semibold text-sm">AI 复盘教练</span>
          <Badge variant="secondary" className="text-xs">
            {isWeekly ? '每周复盘' : '每日复盘'}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {isWeekly
              ? '向 AI 描述你本周的学习情况：完成了哪些任务、遇到了什么困难、状态如何...'
              : '向 AI 描述你今天的备考情况：学到了什么、哪个模块有突破、遇到了什么问题...'}
            <br />
            对话中可以随时纠正 AI 的理解偏差，确认无误后再保存。
          </p>
        )}

        {/* 对话气泡 */}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm'
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              AI 思考中...
            </div>
          </div>
        )}

        {/* 最新复盘建议卡片 */}
        {result && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Separator />
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-sm font-semibold">AI 复盘建议</span>
              <Badge variant="default" className="ml-auto text-xs">
                {result.score}/10 分
              </Badge>
            </div>

            <div className="rounded-lg bg-primary/5 p-3">
              <p className="text-sm font-medium">{result.summary}</p>
            </div>

            {result.key_points.length > 0 && (
              <div className="rounded-lg bg-muted/40 p-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ListChecks className="size-4 text-primary" />
                  关键要点
                </span>
                <ul className="mt-1.5 space-y-1">
                  {result.key_points.map((kp, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground pl-5 relative before:absolute before:left-1 before:top-2 before:size-1.5 before:rounded-full before:bg-primary/60"
                    >
                      {kp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg bg-muted/40 p-3">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Target className="size-4 text-primary" />
                详细分析与建议
              </span>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {result.analysis}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 底部输入区 */}
      <div className="border-t bg-card/95 px-4 py-3 space-y-2">
        {/* 保存 / 重置（有对话后才出现） */}
        {result && (
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
              variant="default"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  保存复盘
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setMessages([])
                setResult(null)
                setInput('')
              }}
              title="重新对话"
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={result ? '继续补充说明或纠正 AI 的理解...' : '描述你的学习情况，发送给 AI 教练'}
            className="min-h-12 max-h-32 flex-1 resize-none"
            disabled={loading}
          />
          <Button onClick={handleSubmit} disabled={loading || !input.trim()} size="icon" className="size-10 shrink-0">
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      <AiPasswordDialog
        open={showPassword}
        onClose={() => setShowPassword(false)}
        onVerified={() => doSubmit()}
      />
    </div>
  )
}
