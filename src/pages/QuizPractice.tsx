import { useState } from 'react'
import { Upload, BrainCircuit, ArrowLeft, Play, Shuffle, Trash2, Layers, Plus, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { UploadBankDialog } from '@/components/UploadBankDialog'
import { AddQuestionDialog } from '@/components/AddQuestionDialog'
import { QuizInterface } from '@/components/QuizInterface'
import { useAppStore } from '@/store/useAppStore'
import { useQuestionBanks, useQuestions, useDeleteBank } from '@/hooks/useData'
import { getQuestions } from '@/lib/api'
import { downloadJSON, downloadCSV } from '@/lib/export'
import { toast } from 'sonner'
import type { QuizMode, QuestionBank } from '@/lib/types'

export default function QuizPracticePage() {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [addQuestionOpen, setAddQuestionOpen] = useState(false)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [mode, setMode] = useState<QuizMode>('practice')

  const banks = useQuestionBanks()
  const questions = useQuestions(selectedBank)
  const deleteBank = useDeleteBank()

  const activeBank = banks.data?.find((b) => b.id === selectedBank) ?? null

  const exportBank = async (b: QuestionBank, format: 'csv' | 'json') => {
    try {
      const qs = await getQuestions(b.id)
      if (qs.length === 0) {
        toast.warning('该题库暂无题目')
        return
      }
      if (format === 'csv') {
        downloadCSV(
          `题库_${b.name}.csv`,
          ['模块', '材料', '题干', '选项', '答案', '解析', '关键要点', '难度'],
          qs.map((q) => [
            q.module_type || '',
            q.material || '',
            q.question_content,
            (q.options || []).join(' | '),
            q.correct_answer || '',
            q.analysis || '',
            q.key_points || '',
            q.difficulty || '',
          ])
        )
      } else {
        downloadJSON(`题库_${b.name}.json`, qs)
      }
    } catch {
      toast.error('导出失败')
    }
  }

  if (selectedBank && activeBank) {
    return (
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedBank(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="返回"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{activeBank.name}</h2>
            <p className="text-xs text-muted-foreground">
              {questions.data?.length ?? 0} 题 ·{' '}
              {mode === 'review' ? '随机练习' : '顺序练习'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddQuestionOpen(true)}>
            <Plus className="size-4" />
          </Button>
        </div>

        {questions.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">加载题目中...</p>
        ) : (
          <QuizInterface
            userId={userId}
            bankId={selectedBank}
            questions={questions.data ?? []}
            mode={mode}
          />
        )}

        <AddQuestionDialog
          open={addQuestionOpen}
          onOpenChange={setAddQuestionOpen}
          userId={userId}
          bankId={selectedBank}
          onAdded={() => questions.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">刷题练习</h2>
          <p className="text-xs text-muted-foreground">上传题库，专项突破</p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4" />
          上传题库
        </Button>
      </div>

      {banks.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">加载中...</p>
      ) : (banks.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <BrainCircuit className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有题库</p>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="size-4" />
              上传第一个题库
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {banks.data!.map((b) => (
            <Card key={b.id}>
              <CardContent className="space-y-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-primary" />
                      <p className="truncate font-medium">{b.name}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {b.module_type && <Badge variant="secondary">{b.module_type}</Badge>}
                      <span className="text-xs text-muted-foreground">{b.total_count} 题</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteBank.mutateAsync(b.id)
                      toast.success('已删除题库')
                    }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="删除题库"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        aria-label="导出题库"
                      >
                        <Download className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportBank(b, 'csv')}>
                        导出为 CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportBank(b, 'json')}>
                        导出为 JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setMode('practice')
                      setSelectedBank(b.id)
                    }}
                  >
                    <Play className="size-4" />
                    顺序刷题
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMode('review')
                      setSelectedBank(b.id)
                    }}
                  >
                    <Shuffle className="size-4" />
                    随机练习
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UploadBankDialog open={uploadOpen} onOpenChange={setUploadOpen} userId={userId} />
    </div>
  )
}
