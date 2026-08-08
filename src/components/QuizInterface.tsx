import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X, ChevronRight, RotateCcw, Trophy, BookMarked } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useCreateQuizSession, useAddMistake } from '@/hooks/useData'
import { findDuplicateMistake } from '@/lib/api'
import { toast } from 'sonner'
import type { Question, QuizMode } from '@/lib/types'

interface QuizInterfaceProps {
  userId: string
  bankId: string
  questions: Question[]
  mode: QuizMode
  onFinish?: () => void
}

const letter = (i: number) => String.fromCharCode(65 + i)

/**
 * 刷题界面：选择题形式，逐题作答，实时反馈 + 正确率统计
 */
export function QuizInterface({ userId, bankId, questions, mode, onFinish }: QuizInterfaceProps) {
  const ordered = useMemo(
    () => (mode === 'review' ? shuffle([...questions]) : questions),
    [questions, mode]
  )

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [start] = useState(Date.now())
  const [done, setDone] = useState(false)

  const createSession = useCreateQuizSession()
  const addMistake = useAddMistake()

  const total = ordered.length
  const current = ordered[index]
  const isLast = index >= total - 1

  const confirm = () => {
    if (selected == null) {
      toast.warning('请选择一个答案')
      return
    }
    const isOk = String(selected).toUpperCase() === String(current.correct_answer).toUpperCase()
    setAnswered(true)
    if (isOk) setCorrect((c) => c + 1)
    else setWrong((w) => w + 1)
  }

  const addToMistakes = async () => {
    const dup = await findDuplicateMistake(
      userId,
      current.question_content,
      current.module_type || '综合'
    )
    if (dup) {
      toast.warning('该题已在错题本中（重复添加）')
      return
    }
    await addMistake.mutateAsync({
      user_id: userId,
      module_type: current.module_type || '综合',
      stem: current.question_content,
      question_content: current.question_content,
      material: current.material || undefined,
      options: current.options ?? [],
      answer: current.correct_answer || undefined,
      error_reasons: ['思路错'],
      analysis: current.analysis || undefined,
      correct_solution: current.analysis || undefined,
      key_points: current.key_points || undefined,
      source: 'quiz',
      source_id: current.id,
      image_url: current.image_url || undefined,
    })
    toast.success('已加入错题本')
  }

  const next = () => {
    if (isLast) {
      finish()
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setAnswered(false)
  }

  const finish = async () => {
    const duration = Math.round((Date.now() - start) / 1000)
    await createSession.mutateAsync({
      user_id: userId,
      bank_id: bankId,
      mode,
      total_count: total,
      correct_count: correct,
      wrong_count: wrong,
      duration,
    })
    setDone(true)
    onFinish?.()
  }

  const restart = () => {
    setIndex(0)
    setSelected(null)
    setAnswered(false)
    setCorrect(0)
    setWrong(0)
    setDone(false)
  }

  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          该题库暂无题目，请先上传题目。
        </CardContent>
      </Card>
    )
  }

  if (done) {
    const rate = total ? Math.round((correct / total) * 100) : 0
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="text-center">
          <CardContent className="space-y-3 py-8">
            <Trophy className="mx-auto size-12 text-primary" />
            <h3 className="text-lg font-bold">刷题完成！</h3>
            <div className="flex justify-center gap-6 text-sm">
              <span>总题数 <b>{total}</b></span>
              <span className="text-success">正确 <b>{correct}</b></span>
              <span className="text-destructive">错误 <b>{wrong}</b></span>
            </div>
            <p className="text-2xl font-bold text-primary">正确率 {rate}%</p>
            <Button onClick={restart} variant="outline" className="w-full">
              <RotateCcw className="size-4" />
              再来一组
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  const optionList = current.options ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Badge variant="secondary">{current.module_type ?? '练习'}</Badge>
        <span>
          {index + 1} / {total}
        </span>
      </div>
      <Progress value={((index + (answered ? 1 : 0)) / total) * 100} className="h-1.5" />

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardContent className="space-y-4 py-4">
              {current.image_url && (
                <div className="flex justify-center">
                  <img src={current.image_url} alt="题目图片" className="max-h-48 rounded-lg border" />
                </div>
              )}
              {current.material && (
                <div className="rounded-lg bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
                  {current.material}
                </div>
              )}
              <p className="break-any text-sm font-medium leading-relaxed">{current.question_content}</p>

              {optionList.length > 0 ? (
                <div className="space-y-2">
                  {optionList.map((opt, i) => {
                    const L = letter(i)
                    const isSel = selected === L
                    const isCorrectOpt = String(L).toUpperCase() === String(current.correct_answer).toUpperCase()
                    const showState = answered && (isSel || isCorrectOpt)
                    return (
                      <button
                        key={i}
                        disabled={answered}
                        onClick={() => setSelected(L)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-200',
                          !answered && isSel && 'border-primary bg-primary/5',
                          showState && isCorrectOpt && 'border-success bg-success/10 text-success',
                          showState && isSel && !isCorrectOpt && 'border-destructive bg-destructive/10 text-destructive',
                          !showState && 'hover:bg-accent'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold',
                            isSel && 'border-primary bg-primary text-primary-foreground'
                          )}
                        >
                          {L}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {showState && isCorrectOpt && <Check className="size-4 text-success" />}
                        {showState && isSel && !isCorrectOpt && <X className="size-4 text-destructive" />}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    disabled={answered}
                    value={selected ?? ''}
                    onChange={(e) => setSelected(e.target.value)}
                    placeholder="输入你的答案"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}

              {answered && current.analysis && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                  <b className="text-foreground">解析：</b>
                  {current.analysis}
                </div>
              )}

              {answered && String(selected).toUpperCase() !== String(current.correct_answer).toUpperCase() && (
                <Button variant="outline" size="sm" className="w-full" onClick={addToMistakes} disabled={addMistake.isPending}>
                  <BookMarked className="size-4" />
                  加入错题本
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <Button onClick={answered ? next : confirm} className="w-full">
        {answered ? (
          <>
            {isLast ? '完成' : '下一题'}
            <ChevronRight className="size-4" />
          </>
        ) : (
          '确认答案'
        )}
      </Button>
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
