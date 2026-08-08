import { useState, useRef, useEffect } from 'react'
import { Bot, Sparkles, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { aiMistakeChat, hasAiAccess } from '@/lib/ai-service'
import { AiPasswordDialog } from '@/components/AiPasswordDialog'
import { AiChatThread, type ChatMsg, type AiChatThreadHandle } from '@/components/AiChatThread'
import { useAddMistake } from '@/hooks/useData'
import { findDuplicateMistake } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { MODULES } from '@/lib/constants'

interface MistakeDraft {
  module_type: string
  material?: string
  question_content: string
  options?: string[]
  answer?: string
  my_answer?: string
  error_reasons: string[]
  analysis?: string
  key_points?: string
}

/** 从解析文本中提炼 1-2 条关键要点，保证「关键要点」必填 */
function deriveKeyPoints(analysis: string): string {
  const parts = (analysis || '')
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.slice(0, 2).join('；')
}

function parseJsonArray(text: string): any[] {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const s = cleaned.indexOf('[')
  const e = cleaned.lastIndexOf(']')
  if (s >= 0 && e > s) cleaned = cleaned.slice(s, e + 1)
  try {
    const arr = JSON.parse(cleaned)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function AiMistakeCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const addMistake = useAddMistake()
  const threadRef = useRef<AiChatThreadHandle>(null)
  const lastImageRef = useRef<string | undefined>(undefined)
  const genRef = useRef(false)

  const [drafts, setDrafts] = useState<MistakeDraft[]>([])
  const [genLoading, setGenLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (open) {
      setDrafts([])
      setGenLoading(false)
      genRef.current = false
      lastImageRef.current = undefined
    }
  }, [open])

  const sendFn = async (msgs: ChatMsg[], image?: string) =>
    aiMistakeChat(msgs, 'create', image).then((text) => ({ text }))

  // 生成错题时，AI 会把结构化结果作为回复返回（不直接显示指令，但显示结果）
  const handleGenerateReply = (text: string) => {
    if (!genRef.current) return
    genRef.current = false
    setGenLoading(false)
    const arr = parseJsonArray(text)
    if (arr.length === 0) {
      toast.error('未能解析出错题，请补充更多题目信息后重试')
      return
    }
    const mapped = arr
      .map((m: any) => {
        const qc = m.question_content || m.stem || m.题干 || m.题目 || ''
        const kpRaw = m.key_points
        const kp =
          Array.isArray(kpRaw)
            ? kpRaw.map(String).join('；')
            : typeof kpRaw === 'string'
              ? kpRaw
              : ''
        const analysis = m.analysis || m.解析 || ''
        const errorReasons = Array.isArray(m.error_reasons)
          ? m.error_reasons.map(String).map((s: string) => s.trim().slice(0, 10))
          : String(m.error_reasons || m.错因 || '')
              .split(/[；;]/)
              .map((s: string) => s.trim().slice(0, 10))
              .filter(Boolean)
        return {
          module_type: MODULES.includes(m.module_type) ? m.module_type : MODULES[0],
          material: m.material || m.材料 || '',
          question_content: qc,
          options: Array.isArray(m.options) ? m.options.map((o: any) => String(o)) : [],
          answer: m.answer || m.答案 || '',
          my_answer: m.my_answer || m.我的答案 || '',
          error_reasons: errorReasons.length ? errorReasons : ['思路错'],
          analysis,
          key_points: kp.trim() || deriveKeyPoints(analysis),
        }
      })
      .filter((d: MistakeDraft) => d.question_content.trim())
    if (mapped.length === 0) {
      toast.error('解析到的错题缺少题干，请补充题目描述后重试')
      return
    }
    setDrafts(mapped)
  }

  const handleGenError = (msg: string) => {
    if (genRef.current) {
      genRef.current = false
      setGenLoading(false)
    }
    if (msg.includes('密码')) setShowPassword(true)
  }

  const generate = () => {
    if (!hasAiAccess()) {
      setShowPassword(true)
      return
    }
    setGenLoading(true)
    genRef.current = true
    threadRef.current?.sendHidden(
      '请将我们刚才讨论的内容，整理成结构化的错题 JSON 数组。每个错题包含字段：module_type（模块名）、material（材料，可空）、question_content（题干，必填）、options（选项数组，可空）、answer（正确答案，可空）、my_answer（我的答案/做错时的作答，可空）、error_reasons（错误原因数组，必填，每条不超过10个字）、analysis（解析，可空）、key_points（关键要点，必填，1-3 条核心总结，若缺少请基于解析提炼）。只返回 JSON 数组。',
    )
  }

  const adopt = async () => {
    const valid = drafts.filter((d) => d.question_content.trim())
    if (valid.length === 0) {
      toast.warning('没有可保存的错题')
      return
    }
    let added = 0
    let skipped = 0
    let failed = 0
    try {
      for (const d of valid) {
        const stem = d.question_content.trim()
        const dup = await findDuplicateMistake(userId, stem, d.module_type)
        if (dup) {
          skipped++
          continue
        }
        try {
          await addMistake.mutateAsync({
            user_id: userId,
            module_type: d.module_type,
            stem,
            question_content: stem,
            material: d.material?.trim() || undefined,
            options: (d.options || []).map((o) => o.trim()).filter(Boolean),
            answer: d.answer?.trim() || undefined,
            my_answer: d.my_answer?.trim() || undefined,
            error_reasons: d.error_reasons,
            analysis: d.analysis?.trim() || undefined,
            correct_solution: d.analysis?.trim() || undefined,
            key_points: d.key_points?.trim() || undefined,
            source: 'ai',
            image_url: lastImageRef.current || undefined,
          })
          added++
        } catch {
          failed++
        }
      }
      if (added > 0) {
        toast.success(
          `已添加 ${added} 道错题${skipped ? `，${skipped} 道重复已跳过` : ''}`,
        )
        onOpenChange(false)
      } else if (skipped > 0) {
        toast.warning(`这 ${skipped} 道错题已存在于错题本（重复添加）`)
      } else if (failed > 0) {
        toast.error('保存失败，请重试')
      }
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            AI 对话制题
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          描述你做错的题（可一次说多道，或逐条沟通纠正），也可上传题目图片让 AI 识别；确认后一键加入错题本，关键要点会自动填入。
        </p>

        {/* 对话区（与 AI 批改/复盘共用同一套聊天组件） */}
        <AiChatThread
          ref={threadRef}
          sendFn={sendFn}
          placeholder="描述错题，或纠正 AI 的理解"
          accept="image/*"
          onSentImage={(img) => {
            lastImageRef.current = img
          }}
          onReply={handleGenerateReply}
          onError={handleGenError}
          heightClass="max-h-[32vh]"
        />

        {drafts.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              整理出的错题（可修改）
            </p>
            {drafts.map((d, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    错题 {i + 1}
                  </Badge>
                  <Input
                    value={d.module_type}
                    onChange={(e) =>
                      setDrafts((p) => p.map((x, k) => (k === i ? { ...x, module_type: e.target.value } : x)))
                    }
                    className="h-7 text-xs"
                    list="module-list"
                  />
                </div>
                <Textarea
                  value={d.material || ''}
                  onChange={(e) =>
                    setDrafts((p) => p.map((x, k) => (k === i ? { ...x, material: e.target.value } : x)))
                  }
                  className="min-h-10 text-xs"
                  placeholder="材料（可空）"
                />
                <Textarea
                  value={d.question_content}
                  onChange={(e) =>
                    setDrafts((p) => p.map((x, k) => (k === i ? { ...x, question_content: e.target.value } : x)))
                  }
                  className="min-h-12 text-xs"
                  placeholder="题干 *"
                />
                <Textarea
                  value={(d.options || []).join('\n')}
                  onChange={(e) =>
                    setDrafts((p) =>
                      p.map((x, k) =>
                        k === i
                          ? { ...x, options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }
                          : x,
                      ),
                    )
                  }
                  className="min-h-10 text-xs"
                  placeholder="选项（每行一个，可空）"
                />
                <Input
                  value={d.answer || ''}
                  onChange={(e) =>
                    setDrafts((p) => p.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))
                  }
                  className="h-7 text-xs"
                  placeholder="正确答案（可空）"
                />
                <Input
                  value={d.my_answer || ''}
                  onChange={(e) =>
                    setDrafts((p) => p.map((x, k) => (k === i ? { ...x, my_answer: e.target.value } : x)))
                  }
                  className="h-7 text-xs"
                  placeholder="我的答案（可空）"
                />
                <Input
                  value={d.error_reasons.join('；')}
                  onChange={(e) =>
                    setDrafts((p) =>
                      p.map((x, k) =>
                        k === i
                          ? { ...x, error_reasons: e.target.value.split('；').map((s) => s.trim()).filter(Boolean) }
                          : x,
                      ),
                    )
                  }
                  className="h-7 text-xs"
                  placeholder="错误原因（用 ；分隔）"
                />
                <Input
                  value={d.key_points || ''}
                  onChange={(e) =>
                    setDrafts((p) => p.map((x, k) => (k === i ? { ...x, key_points: e.target.value } : x)))
                  }
                  className="h-7 text-xs"
                  placeholder="关键要点（必填，用 ；分隔）"
                />
                <Textarea
                  value={d.analysis || ''}
                  onChange={(e) =>
                    setDrafts((p) => p.map((x, k) => (k === i ? { ...x, analysis: e.target.value } : x)))
                  }
                  className="min-h-10 text-xs"
                  placeholder="解析（可空）"
                />
              </div>
            ))}
            <datalist id="module-list">
              {MODULES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        )}

        <DialogFooter className="flex-col gap-2">
          {drafts.length === 0 ? (
            <Button
              onClick={generate}
              variant="outline"
              className="w-full"
              disabled={genLoading}
            >
              <Sparkles className="size-4" />
              {genLoading ? '生成中...' : '生成错题'}
            </Button>
          ) : (
            <Button onClick={adopt} className="w-full">
              <Plus className="size-4" />
              一键加入错题本（{drafts.length}）
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AiPasswordDialog
        open={showPassword}
        onClose={() => setShowPassword(false)}
        onVerified={() => {}}
      />
    </Dialog>
  )
}
