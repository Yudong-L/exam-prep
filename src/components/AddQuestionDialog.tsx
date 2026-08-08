import { useRef, useState } from 'react'
import { Plus, ImagePlus, X as XIcon } from 'lucide-react'
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
import { MODULES, MODULES_WITH_IMAGE } from '@/lib/constants'
import { toast } from 'sonner'
import { addQuestion } from '@/lib/api'

interface AddQuestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  bankId: string
  onAdded?: () => void
}

export function AddQuestionDialog({ open, onOpenChange, bankId, onAdded }: AddQuestionDialogProps) {
  const [moduleType, setModuleType] = useState<string>(MODULES[0])
  const [material, setMaterial] = useState('')
  const [content, setContent] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const showImage = MODULES_WITH_IMAGE.includes(moduleType)

  const setOpt = (i: number, val: string) => {
    const next = [...options]
    next[i] = val
    setOptions(next)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { toast.warning('图片大小不能超过4MB'); return }
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!content.trim() && !imagePreview) { toast.warning('请填写题目内容或上传图片'); return }
    setSaving(true)
    try {
      const saved = await addQuestion({
        bank_id: bankId,
        module_type: moduleType,
        material: material.trim() || undefined,
        question_content: content.trim(),
        options: options.filter(Boolean),
        correct_answer: correctAnswer.trim(),
        analysis: analysis.trim(),
        image_url: imagePreview || undefined,
      })
      if (saved) {
        toast.success('题目已添加')
        setContent('')
        setOptions(['', '', '', ''])
        setCorrectAnswer('')
        setAnalysis('')
        setMaterial('')
        setImagePreview(null)
        onOpenChange(false)
        onAdded?.()
      }
    } catch (e) {
      toast.error('添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4 text-primary" />
            添加题目
          </DialogTitle>
          <DialogDescription>手动添加一道题目到当前题库</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>模块</Label>
            <Select value={moduleType} onValueChange={setModuleType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showImage && (
            <div className="space-y-1.5">
              <Label>题目图片（可选）</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="题目图片" className="max-h-40 rounded-lg border" />
                  <button onClick={() => setImagePreview(null)} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white">
                    <XIcon className="size-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
                  <ImagePlus className="size-4" />点击上传题目图片
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>材料（可选）</Label>
            <Textarea value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="题目背景材料，可留空" className="min-h-12" />
          </div>

          <div className="space-y-1.5">
            <Label>题目内容 *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="题干内容" className="min-h-20" />
          </div>

          <div className="space-y-1.5">
            <Label>选项（A/B/C/D）</Label>
            {options.map((opt, i) => (
              <Input
                key={i}
                value={opt}
                onChange={(e) => setOpt(i, e.target.value)}
                placeholder={`选项 ${String.fromCharCode(65 + i)}`}
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>正确答案</Label>
            <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="如：B" />
          </div>

          <div className="space-y-1.5">
            <Label>解析</Label>
            <Textarea value={analysis} onChange={(e) => setAnalysis(e.target.value)} placeholder="解题思路和知识点" className="min-h-16" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>添加题目</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
