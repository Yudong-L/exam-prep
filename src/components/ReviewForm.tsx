import { useState } from 'react'
import { Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAddReview } from '@/hooks/useData'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'
import type { ReviewType } from '@/lib/types'

interface ReviewFormProps {
  userId: string
  type: ReviewType
  onSaved?: () => void
}

/**
 * 复盘表单：支持每日 / 每周复盘，多字段结构化输入 + 历史要点
 */
export function ReviewForm({ userId, type, onSaved }: ReviewFormProps) {
  const date = useAppStore((s) => s.currentDate)
  const [content, setContent] = useState('')
  const [keyPoints, setKeyPoints] = useState('')
  const [summary, setSummary] = useState('')
  const [nextPlan, setNextPlan] = useState('')

  const addReview = useAddReview()

  const isWeekly = type === 'weekly'

  const handleSave = async () => {
    if (!content.trim()) {
      toast.warning('请先写下复盘内容')
      return
    }
    const saved = await addReview.mutateAsync({
      user_id: userId,
      type,
      date,
      content: content.trim(),
      key_points: keyPoints.trim() || undefined,
      summary: summary.trim() || undefined,
      next_plan: nextPlan.trim() || undefined,
    })
    if (saved) {
      toast.success(isWeekly ? '本周复盘已保存' : '今日复盘已保存')
      setContent('')
      setKeyPoints('')
      setSummary('')
      setNextPlan('')
      onSaved?.()
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {isWeekly ? '本周复盘' : '今日复盘'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>复盘内容 *（心得 / 收获 / 问题）</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              isWeekly
                ? '总结本周学习情况：完成了什么、卡点在哪、状态如何...'
                : '今天学到了什么、哪个模块有突破、遇到了什么问题...'
            }
            className="min-h-28"
          />
        </div>

        <div className="space-y-1.5">
          <Label>关键要点（换行分隔）</Label>
          <Textarea
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            placeholder={'一行一个要点\n例如：\n图形推理对称规律已掌握\n资料分析找数仍偏慢'}
            className="min-h-16"
          />
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label>一句话总结</Label>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="用一句话概括这次复盘"
            className="min-h-12"
          />
        </div>

        <div className="space-y-1.5">
          <Label>{isWeekly ? '下周计划' : '明日计划'}</Label>
          <Textarea
            value={nextPlan}
            onChange={(e) => setNextPlan(e.target.value)}
            placeholder={isWeekly ? '下周重点突破方向...' : '明天要优先完成的任务...'}
            className="min-h-12"
          />
        </div>

        <Button onClick={handleSave} disabled={addReview.isPending} className="w-full">
          <Save className="size-4" />
          保存复盘
        </Button>
      </CardContent>
    </Card>
  )
}
