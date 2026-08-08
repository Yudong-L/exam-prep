import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MODULES } from '@/lib/constants'
import { parseExcelFile } from '@/lib/excel'
import { useCreateBank } from '@/hooks/useData'
import { toast } from 'sonner'
import type { Question } from '@/lib/types'

interface UploadBankDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  onCreated?: () => void
}

function findCol(headers: string[], keys: string[]): string | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s/g, '')
  return headers.find((h) => {
    const nh = norm(h)
    return keys.some((k) => nh.includes(norm(k)))
  })
}

/**
 * 上传题库弹窗：解析 Excel -> 映射为题目 -> 创建题库
 * 支持列：题目/题干, A B C D 或 选项, 答案, 解析, 难度, 模块
 */
export function UploadBankDialog({ open, onOpenChange, userId, onCreated }: UploadBankDialogProps) {
  const [name, setName] = useState('')
  const [moduleType, setModuleType] = useState<string>(MODULES[0])
  const [fileName, setFileName] = useState('')
  const [previewCount, setPreviewCount] = useState(0)
  const [parsed, setParsed] = useState<Question[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const createBank = useCreateBank()

  const handleFile = async (file: File) => {
    setFileName(file.name)
    try {
      const { headers, rows } = await parseExcelFile(file)
      const qCol = findCol(headers, ['题目', '题干', 'question'])
      const aCol = findCol(headers, ['选项a', 'a'])
      const bCol = findCol(headers, ['选项b', 'b'])
      const cCol = findCol(headers, ['选项c', 'c'])
      const dCol = findCol(headers, ['选项d', 'd'])
      const optCol = findCol(headers, ['选项', 'options'])
      const ansCol = findCol(headers, ['答案', '正确', 'correct'])
      const anaCol = findCol(headers, ['解析', 'analysis'])
      const diffCol = findCol(headers, ['难度', 'difficulty'])
      const modCol = findCol(headers, ['模块', 'module'])

      const questions: Question[] = []
      for (const row of rows) {
        const content = qCol ? String(row[qCol] ?? '').trim() : ''
        if (!content) continue
        let options: string[] = []
        if (aCol && bCol) {
          for (const col of [aCol, bCol, cCol, dCol]) {
            const v = col ? String(row[col] ?? '').trim() : ''
            if (v) options.push(v)
          }
        } else if (optCol) {
          const raw = String(row[optCol] ?? '')
          options = raw
            .split(/[|/、\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        }
        const correct = ansCol ? String(row[ansCol] ?? '').trim() : ''
        questions.push({
          id: '',
          bank_id: '',
          module_type: modCol ? String(row[modCol] ?? '').trim() || moduleType : moduleType,
          question_content: content,
          options,
          correct_answer: correct,
          analysis: anaCol ? String(row[anaCol] ?? '').trim() : '',
          difficulty: diffCol ? String(row[diffCol] ?? '').trim() : undefined,
          tags: [],
        })
      }
      setParsed(questions)
      setPreviewCount(questions.length)
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''))
      if (questions.length === 0) toast.warning('未解析到题目，请检查表头')
    } catch (e) {
      console.error(e)
      toast.error('文件解析失败')
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.warning('请填写题库名称')
      return
    }
    if (parsed.length === 0) {
      toast.warning('请先上传包含题目的文件')
      return
    }
    const bank = await createBank.mutateAsync({
      bank: {
        user_id: userId,
        name: name.trim(),
        description: undefined,
        module_type: moduleType,
        difficulty: undefined,
        total_count: parsed.length,
      },
      questions: parsed.map((q) => ({
        module_type: q.module_type,
        question_content: q.question_content,
        options: q.options,
        correct_answer: q.correct_answer,
        analysis: q.analysis,
        difficulty: q.difficulty,
        tags: q.tags,
      })),
    })
    if (bank) {
      toast.success(`题库「${bank.name}」已创建（${parsed.length} 题）`)
      setName('')
      setFileName('')
      setParsed([])
      setPreviewCount(0)
      onOpenChange(false)
      onCreated?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-primary" />
            上传题库
          </DialogTitle>
          <DialogDescription>
            支持 Excel / CSV，表头含「题目、A/B/C/D 或 选项、答案、解析」
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>题库名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：2024省考真题卷" />
          </div>

          <div className="space-y-1.5">
            <Label>默认模块</Label>
            <Select value={moduleType} onValueChange={setModuleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>题目文件</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Upload className="size-4" />
              {fileName || '点击选择 Excel / CSV 文件'}
            </button>
            {previewCount > 0 && (
              <p className="text-xs text-success">已解析 {previewCount} 道题目</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={createBank.isPending}>
            {createBank.isPending && <Loader2 className="size-4 animate-spin" />}
            创建题库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
