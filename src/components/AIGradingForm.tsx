import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Loader2, CheckCircle2, XCircle, BookMarked, ImagePlus, X as XIcon, MessageCircle } from 'lucide-react'
import { submitGrading, hasAiAccess, hasAiApiKey } from '@/lib/ai-service'
import { AiPasswordDialog } from '@/components/AiPasswordDialog'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { MODULES, MODULE_SPECIAL_FIELDS, MODULES_WITH_IMAGE } from '@/lib/constants'
import { fileToDataUrl } from '@/lib/image'
import { useSaveGrading, useAddMistake } from '@/hooks/useData'
import { findDuplicateMistake } from '@/lib/api'
import { AIChatDialog } from '@/components/AIChatDialog'
import type { GradingResult } from '@/lib/ai-service'

export interface GradingInput {
  module_type: string
  question_content: string
  points?: string
  arguments?: string
  text_structure?: string
  formula?: string
  prediction_direction?: string
  user_answer: string
  image_base64?: string
  reference_answer?: string
}

interface AIGradingFormProps {
  userId: string
  onGraded?: () => void
}
export function AIGradingForm({ userId, onGraded }: AIGradingFormProps) {
  const [form, setForm] = useState<GradingInput>({
    module_type: MODULES[0],
    question_content: '',
    user_answer: '',
  })
  const [result, setResult] = useState<GradingResult | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [imageData, setImageData] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const saveGrading = useSaveGrading()
  const addMistake = useAddMistake()

  const set = <K extends keyof GradingInput>(key: K, value: GradingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const currentModule = form.module_type
  const specialFields = MODULE_SPECIAL_FIELDS[currentModule] || []
  const showImageUpload = MODULES_WITH_IMAGE.includes(currentModule)

  const handleModuleChange = (mod: string) => {
    setForm((f) => ({
      module_type: mod,
      question_content: f.question_content,
      user_answer: f.user_answer,
      prediction_direction: f.prediction_direction,
      image_base64: undefined,
    }))
    setImageData(null)
    setImagePreview(null)
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      toast.warning('图片大小不能超过8MB')
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      setImagePreview(dataUrl)
      setImageData(dataUrl)
      set('image_base64', dataUrl)
    } catch {
      toast.error('图片读取失败，请重试')
    }
  }

  const canSubmit =
    (form.question_content.trim().length > 0 || !!imageData) && form.user_answer.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.warning('请填写题目内容与你的答案')
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
    await doSubmit()
  }

  const doSubmit = async () => {
    setSubmitting(true)
    setResult(null)
    try {
      const grading = await submitGrading(form)
      setResult(grading)

      await saveGrading.mutateAsync({
        user_id: userId,
        module_type: form.module_type,
        question_content: form.question_content,
        points: form.points,
        arguments: form.arguments,
        text_structure: form.text_structure,
        formula: form.formula,
        prediction_direction: form.prediction_direction,
        user_answer: form.user_answer,
        ai_result: grading.ai_result,
        ai_analysis: grading.ai_analysis,
        score: grading.score,
        is_correct: grading.is_correct,
        image_url: imagePreview || undefined,
        reference_answer: form.reference_answer || undefined,
      })
      onGraded?.()
      toast.success('AI 批改完成')
    } catch (err: any) {
      console.error(err)
      const msg = err?.response?.data?.message || err?.message || '请检查网络或稍后重试'
      toast.error('AI 批改失败', { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddToMistakes = async () => {
    if (!result) return
    const dup = await findDuplicateMistake(userId, form.question_content, form.module_type)
    if (dup) {
      toast.warning('该题已在错题本中（重复添加）')
      return
    }
    await addMistake.mutateAsync({
      user_id: userId,
      module_type: form.module_type,
      stem: form.question_content,
      question_content: form.question_content,
      error_reasons: [],
      correct_solution: result.ai_analysis,
      analysis: result.ai_analysis,
      source: 'ai',
      source_id: undefined,
      image_url: imagePreview || undefined,
    })
    toast.success('已加入错题本')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            题目录入
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>模块类型</Label>
            <Select value={form.module_type} onValueChange={handleModuleChange}>
              <SelectTrigger>
                <SelectValue placeholder="选择模块" />
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
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="题目图片" className="max-h-40 rounded-lg border" />
                  <button
                    onClick={() => { setImagePreview(null); setImageData(null); set('image_base64', undefined) }}
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
            <Label>题目内容 *</Label>
            <Textarea
              value={form.question_content}
              onChange={(e) => set('question_content', e.target.value)}
              placeholder="粘贴题干内容..."
              className="min-h-24"
            />
          </div>

          {specialFields.length > 0 && (
            <div className={specialFields.length > 1 ? 'grid grid-cols-2 gap-3' : ''}>
              {specialFields.map((sf) => (
                <div key={sf.key} className="space-y-1.5">
                  <Label>{sf.field}</Label>
                  <Textarea
                    value={(form as any)[sf.key] || ''}
                    onChange={(e) => set(sf.key as keyof GradingInput, e.target.value)}
                    placeholder={sf.placeholder}
                    className="min-h-16 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>预判方向</Label>
            <Input
              value={form.prediction_direction || ''}
              onChange={(e) => set('prediction_direction', e.target.value)}
              placeholder="例如：选B，理由..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>参考答案（可选）</Label>
            <Textarea
              value={form.reference_answer || ''}
              onChange={(e) => set('reference_answer', e.target.value)}
              placeholder="输入正确答案，AI会据此更准确批改..."
              className="min-h-16 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>我的答案 *</Label>
            <Textarea
              value={form.user_answer}
              onChange={(e) => set('user_answer', e.target.value)}
              placeholder="写下你的解答/选项"
              className="min-h-16"
            />
          </div>

          <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="w-full">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                AI 批改中...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                开始 AI 批改
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={result.is_correct ? 'border-success/40' : 'border-destructive/40'}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  {result.is_correct ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <XCircle className="size-5 text-destructive" />
                  )}
                  批改结果
                </span>
                <span className={result.is_correct ? 'text-sm font-bold text-success' : 'text-sm font-bold text-destructive'}>
                  {result.score} 分
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">判定</p>
                <p className="break-any text-sm">{result.ai_result}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">解析</p>
                <p className="break-any whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {result.ai_analysis}
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={handleAddToMistakes} disabled={addMistake.isPending}>
                <BookMarked className="size-4" />
                加入错题本
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowChat(!showChat)}>
                <MessageCircle className="size-4" />
                {showChat ? '收起对话' : '与AI老师讨论'}
              </Button>
              {showChat && (
                <AIChatDialog
                  history={[
                    { role: 'assistant', content: `【评分】${result.score}分\n【判定】${result.ai_result}\n【解析】${result.ai_analysis}` },
                  ]}
                  moduleType={form.module_type}
                  imageUrl={imagePreview || undefined}
                />
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <AiPasswordDialog
        open={showPassword}
        onClose={() => setShowPassword(false)}
        onVerified={() => doSubmit()}
      />
    </div>
  )
}
