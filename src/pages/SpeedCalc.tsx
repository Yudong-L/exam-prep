import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, Timer, Trophy, Zap, Eye, RotateCcw, Play, CheckCircle2, XCircle, ArrowLeft, TrendingUp, History, BookX } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { genArithmetic, genEstimate, genFindRound, type FindTable } from '@/lib/speedcalc'
import { useAddMistake } from '@/hooks/useData'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

type Mode = 'arithmetic' | 'estimate' | 'find'

type Item =
  | { t: 'arithmetic'; q: string; answer: number }
  | { t: 'estimate'; q: string; options: number[]; answer: number }
  | { t: 'find'; question: string; answer: number; ri: number; ci: number; table: FindTable }

interface Best {
  accuracy: number
  bestStreak: number
  avgTime: number
  played: number
}

interface HistoryEntry {
  date: string
  accuracy: number
  avgTime: number
}

interface BestWithHistory extends Best {
  history?: HistoryEntry[]
}

const BESTS_KEY = 'speed-calc-bests'

function blankBest(): BestWithHistory {
  return { accuracy: 0, bestStreak: 0, avgTime: 0, played: 0, history: [] }
}

function loadBests(): Record<Mode, BestWithHistory> {
  try {
    const raw = localStorage.getItem(BESTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // 兼容旧格式：没有 history 时补上
      ;(['arithmetic', 'estimate', 'find'] as Mode[]).forEach((m) => {
        if (parsed[m] && !Array.isArray(parsed[m].history)) parsed[m].history = []
      })
      return parsed
    }
  } catch {
    /* ignore */
  }
  return { arithmetic: blankBest(), estimate: blankBest(), find: blankBest() }
}

const MODE_META: Record<Mode, { label: string; desc: string; icon: typeof Calculator; color: string }> = {
  arithmetic: {
    label: '纯算数',
    desc: '加减乘除与百分比心算，每轮 10 题，比拼正确率与连击。',
    icon: Zap,
    color: 'text-warning',
  },
  estimate: {
    label: '资料估算',
    desc: '从四个近似选项中选出最接近的结果，训练快速估算能力。',
    icon: TrendingUp,
    color: 'text-info',
  },
  find: {
    label: '资料找数',
    desc: '在一张结构化表格中快速定位指定指标数值，训练扫读与定位能力。',
    icon: Eye,
    color: 'text-success',
  },
}

export default function SpeedCalcPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('arithmetic')
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle')
  const [items, setItems] = useState<Item[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<{ ok: boolean; answer: number } | null>(null)
  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [lastResult, setLastResult] = useState<{ result: Best; isRecord: boolean } | null>(null)
  const [bests, setBests] = useState<Record<Mode, BestWithHistory>>(loadBests())
  const [findPick, setFindPick] = useState<{ ri: number; ci: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const addMistake = useAddMistake()
  const [savingMistake, setSavingMistake] = useState(false)
  const stats = useRef({ correct: 0, attempted: 0, streak: 0, bestStreak: 0 })
  const current = items[idx]

  useEffect(() => {
    if (phase !== 'playing') return
    const t = setInterval(() => setElapsed(Math.round(((Date.now() - startTime) / 100) * 10) / 100), 200)
    return () => clearInterval(t)
  }, [phase, startTime])

  function startRound(m: Mode) {
    let list: Item[] = []
    if (m === 'arithmetic') {
      list = Array.from({ length: 10 }, () => {
        const a = genArithmetic()
        return { t: 'arithmetic', q: a.q, answer: a.answer }
      })
    } else if (m === 'estimate') {
      list = Array.from({ length: 10 }, () => {
        const e = genEstimate()
        return { t: 'estimate', q: e.q, options: e.options, answer: e.answer }
      })
    } else {
      const fr = genFindRound()
      list = fr.map((q) => ({ t: 'find', question: q.question, answer: q.answer, ri: q.ri, ci: q.ci, table: q.table }))
    }
    stats.current = { correct: 0, attempted: 0, streak: 0, bestStreak: 0 }
    setMode(m)
    setItems(list)
    setIdx(0)
    setInput('')
    setStreak(0)
    setFeedback(null)
    setFindPick(null)
    setStartTime(Date.now())
    setElapsed(0)
    setLastResult(null)
    setPhase('playing')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function advance(isOk: boolean, answer: number) {
    if (feedback) return
    if (isOk) {
      stats.current.correct++
      stats.current.streak++
      stats.current.bestStreak = Math.max(stats.current.bestStreak, stats.current.streak)
    } else {
      stats.current.streak = 0
    }
    stats.current.attempted++
    setFeedback({ ok: isOk, answer })
    setStreak(stats.current.streak)
    setTimeout(() => {
      setFeedback(null)
      setFindPick(null)
      setInput('')
      if (idx + 1 >= items.length) finish()
      else {
        setIdx((i) => i + 1)
        setTimeout(() => inputRef.current?.focus(), 30)
      }
    }, isOk ? 350 : 900)
  }

  function submitArithmetic() {
    if (feedback || !current || current.t !== 'arithmetic') return
    const v = parseInt(input, 10)
    if (Number.isNaN(v)) return
    advance(v === current.answer, current.answer)
  }

  function chooseEstimate(opt: number) {
    if (feedback || !current || current.t !== 'estimate') return
    advance(opt === current.answer, current.answer)
  }

  function chooseFind(ri: number, ci: number) {
    if (feedback || !current || current.t !== 'find') return
    setFindPick({ ri, ci })
    advance(ri === current.ri && ci === current.ci, current.answer)
  }

  function finish() {
    const total = items.length
    const acc = Math.round((stats.current.correct / total) * 100)
    const avg = Math.round((Date.now() - startTime) / total / 100) / 10
    const prev = bests[mode]
    const isRecord = acc > prev.accuracy || stats.current.bestStreak > prev.bestStreak
    const result: BestWithHistory = { accuracy: acc, bestStreak: stats.current.bestStreak, avgTime: avg, played: prev.played + 1, history: [] }
    const nb = { ...bests }
    const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
    nb[mode] = {
      accuracy: Math.max(prev.accuracy, acc),
      bestStreak: Math.max(prev.bestStreak, stats.current.bestStreak),
      avgTime: prev.avgTime ? Math.min(prev.avgTime, avg) : avg,
      played: prev.played + 1,
      history: [{ date: today, accuracy: acc, avgTime: avg }, ...(prev.history ?? [])].slice(0, 10),
    }
    setBests(nb)
    try {
      localStorage.setItem(BESTS_KEY, JSON.stringify(nb))
    } catch {
      /* ignore */
    }
    setLastResult({ result, isRecord })
    setPhase('done')
  }

  function quit() {
    setPhase('idle')
    setItems([])
  }

  // 把本轮速算错题（针对 find 模式没有"错"的概念，这里记录一次训练小结到错题本）
  async function saveAsMistake() {
    if (!lastResult) return
    setSavingMistake(true)
    try {
      await addMistake.mutateAsync({
        user_id: userId,
        module_type: mode === 'estimate' ? '资料分析' : mode === 'find' ? '资料分析' : '数量关系',
        stem: `速算练习（${MODE_META[mode].label}）训练小结`,
        question_content: `速算练习（${MODE_META[mode].label}）`,
        material: `本轮正确率 ${lastResult.result.accuracy}%，平均用时 ${lastResult.result.avgTime}s，最佳连击 ${lastResult.result.bestStreak}。`,
        error_reasons: ['速算提速'],
        analysis: '坚持限时训练，逐步压缩读题与计算时间。',
        key_points: '限时训练 · 先看选项估算 · 找数先定位行与列。',
        source: 'quiz',
      })
      toast.success('已记录到错题本')
    } catch (e: any) {
      toast.error(e?.message || '保存失败')
    } finally {
      setSavingMistake(false)
    }
  }

  if (phase === 'idle') {
    const best = bests[mode]
    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calculator className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold">速算练习</h2>
              <p className="text-xs text-muted-foreground">提速训练 · 三公考</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => navigate('/')}>
            <ArrowLeft className="size-4" />
            首页
          </Button>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="arithmetic">纯算数</TabsTrigger>
            <TabsTrigger value="estimate">资料估算</TabsTrigger>
            <TabsTrigger value="find">资料找数</TabsTrigger>
          </TabsList>
          {(['arithmetic', 'estimate', 'find'] as Mode[]).map((m) => {
            const mm = MODE_META[m]
            const MIcon = mm.icon
            return (
              <TabsContent key={m} value={m}>
                <Card>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <MIcon className={`size-4 ${mm.color}`} />
                      {mm.label}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{mm.desc}</p>
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
                      <BestStat label="最佳正确率" value={best.accuracy ? `${best.accuracy}%` : '—'} />
                      <BestStat label="最佳连击" value={best.bestStreak ? `${best.bestStreak}` : '—'} />
                      <BestStat label="最快均时" value={best.avgTime ? `${best.avgTime}s` : '—'} />
                    </div>
                    {best.history && best.history.length > 0 && (
                      <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <History className="size-3.5" />
                          最近记录（{best.history.length}）
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {best.history.map((h, i) => (
                            <span
                              key={i}
                              className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              title={h.date}
                            >
                              {h.date.slice(5)} {h.accuracy}% · {h.avgTime}s
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button className="w-full gap-2" onClick={() => startRound(m)}>
                      <Play className="size-4" />
                      开始练习
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    )
  }

  if (phase === 'done' && lastResult) {
    const r = lastResult.result
    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">练习完成</h2>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => navigate('/')}>
            <ArrowLeft className="size-4" />
            首页
          </Button>
        </div>

        {lastResult.isRecord && (
          <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success">
            <Trophy className="size-4" />
            刷新了本模式最佳成绩！
          </div>
        )}

        <Card>
          <CardContent className="grid grid-cols-2 gap-3 py-4">
            <ResultStat icon={CheckCircle2} label="正确率" value={`${r.accuracy}%`} accent="text-success" />
            <ResultStat icon={Timer} label="平均用时" value={`${r.avgTime}s`} accent="text-primary" />
            <ResultStat icon={Zap} label="最佳连击" value={`${r.bestStreak}`} accent="text-warning" />
            <ResultStat icon={Calculator} label="本轮题数" value={`${items.length}`} accent="text-info" />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={() => startRound(mode)}>
            <RotateCcw className="size-4" />
            再来一局
          </Button>
          <Button variant="outline" className="flex-1" onClick={quit}>
            返回
          </Button>
        </div>

        <Button variant="ghost" className="w-full gap-2 text-xs text-muted-foreground" onClick={saveAsMistake} disabled={savingMistake}>
          <BookX className="size-4" />
          {savingMistake ? '记录中...' : '记录本轮训练到错题本'}
        </Button>
      </div>
    )
  }

  // playing
  const meta = MODE_META[mode]
  const Icon = meta.icon
  const total = items.length
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`size-5 ${meta.color}`} />
          <span className="font-bold">{meta.label}</span>
          <span className="text-xs text-muted-foreground">
            第 {idx + 1}/{total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="size-3.5" />
            {elapsed}s
          </span>
          <span className="text-xs font-medium text-warning">连击 {streak}</span>
          <Button variant="ghost" size="sm" className="text-xs" onClick={quit}>
            放弃
          </Button>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${(idx / total) * 100}%` }} />
      </div>

      {feedback && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg p-3 text-sm',
            feedback.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          )}
        >
          {feedback.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {feedback.ok ? '答对啦！' : `正确答案：${feedback.answer}`}
        </div>
      )}

      {current && current.t === 'arithmetic' && (
        <Card>
          <CardContent className="space-y-4 py-6 text-center">
            <p className="text-3xl font-bold tracking-wide">{current.q}</p>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitArithmetic()}
                placeholder="输入答案"
                className="text-center text-lg"
              />
              <Button onClick={submitArithmetic} className="shrink-0">
                提交
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {current && current.t === 'estimate' && (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-base font-medium">{current.q}</p>
            <div className="grid grid-cols-2 gap-2">
              {current.options.map((opt, i) => (
                <Button key={i} variant="outline" className="h-12 text-base" onClick={() => chooseEstimate(opt)}>
                  {opt.toLocaleString('zh-CN')}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {current && current.t === 'find' && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-medium">{current.question}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {current.table.headers.map((h, i) => (
                      <th key={i} className="border border-border bg-muted/50 px-2 py-1.5 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.table.rows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="border border-border px-2 py-1.5 text-muted-foreground">{row.label}</td>
                      {row.values.map((val, ci) => {
                        const isAnswer = feedback && ri === current.ri && ci === current.ci
                        const isPicked = findPick && findPick.ri === ri && findPick.ci === ci
                        return (
                          <td key={ci} className="border border-border p-0">
                            <button
                              disabled={!!feedback}
                              onClick={() => chooseFind(ri, ci)}
                              className={cn(
                                'w-full px-2 py-1.5 text-center transition-colors',
                                isAnswer && feedback?.ok && 'bg-success text-success-foreground',
                                isPicked && !feedback?.ok && 'bg-destructive text-destructive-foreground',
                                !feedback && 'hover:bg-accent'
                              )}
                            >
                              {val.toLocaleString('zh-CN')}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BestStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

function ResultStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Calculator
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${accent}`} />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  )
}
