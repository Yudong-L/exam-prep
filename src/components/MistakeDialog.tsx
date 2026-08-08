import { useRef, useState, useEffect } from 'react'
import { Plus, Pencil, ImagePlus, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MODULES, ERROR_REASONS, MODULES_WITH_IMAGE } from '@/lib/constants'
import { useAddMistake, useUpdateMistake } from '@/hooks/useData'
import { findDuplicateMistake } from '@/lib/api'
import { toast } from 'sonner'
import type { Mistake } from '@/lib/types'

export interface MistakeFormValues {
  id?: string
  module_type: string
  question_content: string
  error_reasons: string[]
  correct_solution: string
  review_date?: string
  image_url?: string
  material?: string
  stem?: string
  options?: string[]
  answer?: string
  my_answer?: string
  analysis?: string
  key_points?: string
}

interface MistakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  initial?: Partial<MistakeFormValues>
  onSaved?: (m: Mistake) => void
}

export function MistakeDialog({ open, onOpenChange, userId, initial, onSaved }: MistakeDialogProps) {
  const [moduleType, setModuleType] = useState<string>(MODULES[0])
  const [material, setMaterial] = useState('')
  const [content, setContent] = useState('')
  const [options, setOptions] = useState<string[]>([''])
  const [answer, setAnswer] = useState('')
  const [myAnswer, setMyAnswer] = useState('')
  const [reasons, setReasons] = useState<string[]>([])
  const [solution, setSolution] = useState('')
  const [keyPoints, setKeyPoints] = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addMistake = useAddMistake()
  const updateMistake = useUpdateMistake()
  const showImageUpload = MODULES_WITH_IMAGE.includes(moduleType)

  // 打开时根据 initial 重置表单（新增 / 编辑共用）
  useEffect(() => {
    if (!open) return
    setModuleType(initial?.module_type ?? MODULES[0])
    setMaterial(initial?.material ?? '')
    setContent(initial?.question_content ?? initial?.stem ?? '')
    setOptions(initial?.options && initial.options.length > 0 ? initial.options : [''])
    setAnswer(initial?.answer ?? '')
    setMyAnswer(initial?.my_answer ?? '')
    setReasons(initial?.error_reasons ?? [])
    setSolution(initial?.correct_solution ?? initial?.analysis ?? '')
    setKeyPoints(initial?.key_points ?? '')
    setReviewDate(initial?.review_date ?? '')
    setCustomReason('')
    setImagePreview(initial?.image_url || null)
  }, [open, initial])

  const setOpt = (i: number, val: string) => {
    const next = [...options]
    next[i] = val
    setOptions(next)
  }

  const toggleReason = (r: string) =>
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))

  const addCustomReason = () => {
    const val = customReason.trim()
    if (!val) return
    if (!reasons.includes(val)) {
      setReasons((prev) => [...prev, val])
    }
    setCustomReason('')
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.warning('图片大小不能超过4MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!content.trim()) {
      toast.warning('请填写题干')
      return
    }
    const opts = options.map((o) => o.trim()).filter(Boolean)
    const payload = {
      user_id: userId,
      module_type: moduleType,
      stem: content.trim(),
      question_content: content.trim(),
      material: material.trim() || undefined,
      options: opts,
      answer: answer.trim() || undefined,
      my_answer: myAnswer.trim() || undefined,
      error_reasons: reasons,
      analysis: solution.trim() || undefined,
      correct_solution: solution.trim() || undefined,
      key_points: keyPoints.trim() || undefined,
      review_date: reviewDate || undefined,
      source: 'manual' as const,
      image_url: imagePreview || undefined,
    }
    try {
      if (!initial?.id) {
        const dup = await findDuplicateMistake(userId, content.trim(), moduleType)
        if (dup) {
          toast.warning('该错题已在错题本中（重复添加）')
          return
        }
      }
      if (initial?.id) {
        const ok = await updateMistake.mutateAsync({ id: initial.id, patch: payload })
        if (ok) {
          toast.success('已保存修改')
          onSaved?.(initial as unknown as Mistake)
          onOpenChange(false)
        }
      } else {
        const saved = await addMistake.mutateAsync(payload)
        if (saved) {
          toast.success('错题已添加')
          onSaved?.(saved)
          onOpenChange(false)
        }
      }
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {initial?.id ? <Pencil className="size-4 text-primary" /> : <Plus className="size-4 text-primary" />}
            {initial?.id ? '编辑错题' : '添加错题'}
          </DialogTitle>
          <DialogDescription>记录错题、错因与关键要点，便于后续复盘</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>模块</Label>
            <Select value={moduleType} onValueChange={setModuleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showImageUpload && (
            <div className="space-y-1.5">
              <Label>题目图片（可选）</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="题目图片" className="max-h-40 rounded-lg border" />
                  <button
                    onClick={() => setImagePreview(null)}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  <ImagePlus className="size-4" />
                  点击上传题目图片
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>材料（可选）</Label>
            <Textarea
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="题目背景材料，可留空"
              className="min-h-12"
            />
          </div>

          <div className="space-y-1.5">
            <Label>题干 *</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="题目、题面描述"
              className="min-h-20"
            />
          </div>

          <div className="space-y-1.5">
            <Label>选项（可选，可空）</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOpt(i, e.target.value)}
                  placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                  className="flex-1"
                />
                {options.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOptions(options.filter((_, k) => k !== i))}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="删除选项"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions([...options, ''])}
              className="text-[11px] text-primary hover:underline"
            >
              + 添加选项
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>正确答案</Label>
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="如：B"
            />
          </div>

          <div className="space-y-1.5">
            <Label>我的答案</Label>
            <Input
              value={myAnswer}
              onChange={(e) => setMyAnswer(e.target.value)}
              placeholder="我做错时的作答（可空）"
            />
          </div>

          <div className="space-y-1.5">
            <Label>错因标记（可多选 + 自定义）</Label>
            <div className="flex flex-wrap gap-2">
              {ERROR_REASONS.map((r) => {
                const active = reasons.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleReason(r)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {r}
                  </button>
                )
              })}
              {reasons
                .filter((r) => !(ERROR_REASONS as readonly string[]).includes(r))
                .map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReasons((prev) => prev.filter((x) => x !== r))}
                    className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  >
                    {r} ✕
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="自定义错因..."
                className="text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addCustomReason()}
              />
              <Button type="button" size="sm" variant="outline" onClick={addCustomReason}>
                添加
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>关键要点</Label>
            <Textarea
              value={keyPoints}
              onChange={(e) => setKeyPoints(e.target.value)}
              placeholder="用 1-3 条总结这道题的核心要点 / 避坑提醒"
              className="min-h-16"
            />
          </div>

          <div className="space-y-1.5">
            <Label>解析（可选）</Label>
            <Textarea
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="记录正确的解题思路、解析与知识点"
              className="min-h-20"
            />
          </div>

          <div className="space-y-1.5">
            <Label>复盘日期</Label>
            <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={addMistake.isPending || updateMistake.isPending}>
            {initial?.id ? '保存修改' : '保存错题'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
