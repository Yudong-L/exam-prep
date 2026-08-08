import { useEffect, useMemo, useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Table2, Upload, Trash2, X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useAppStore, todayStr } from '@/store/useAppStore'
import {
  getDayStatuses,
  upsertDayStatus,
  getAllPlans,
  upsertDailyPlan,
  deletePlansByDateRange,
} from '@/lib/api'
import { getModeMeta, MODULES, MODES, parseMode } from '@/lib/constants'
import { downloadJSON, downloadCSV } from '@/lib/export'
import { toast } from 'sonner'
import type { DailyPlan, DayStatus, StudyMode } from '@/lib/types'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function statusClass(status?: StudyMode): string {
  if (!status) return 'bg-muted'
  if (status === 'fish') return 'bg-success'
  if (status === 'halfday') return 'bg-warning'
  return 'bg-destructive'
}

function weekdayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return WEEK_LABELS[d.getDay()]
}

function normalizeDate(raw: any): string {
  if (!raw && raw !== 0) return ''
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`
  }
  if (typeof raw === 'number') {
    // Excel 日期序列号
    const d = new Date((raw - 25569) * 86400 * 1000)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return String(raw)
  }
  const s = String(raw).trim()
  // 支持 2026/8/6 或 2026-08-06
  const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return ''
}

function pickModule(raw: string): string {
  const s = (raw || '').trim()
  const hit = MODULES.find((m) => s.includes(m))
  return hit || s || MODULES[0]
}

export default function MonthlyPlanPage() {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const today = todayStr()

  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7))) // 1-12
  const [statuses, setStatuses] = useState<Record<string, StudyMode>>({})
  const [tasks, setTasks] = useState<DailyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // 当日详情
  const [detailDate, setDetailDate] = useState<string | null>(null)

  // Excel 上传
  const [uploadStatus, setUploadStatus] = useState<StudyMode>('halfday')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getDayStatuses(userId), getAllPlans()])
      .then(([ds, ps]) => {
        if (!active) return
        const map: Record<string, StudyMode> = {}
        for (const d of ds as DayStatus[]) map[d.date] = d.status
        setStatuses(map)
        setTasks(ps)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => {
      active = false
    }
  }, [userId, reloadKey])

  const reload = () => setReloadKey((k) => k + 1)

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  const goPrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else setMonth((m) => m - 1)
  }
  const goNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else setMonth((m) => m + 1)
  }

  const handleTapDay = (date: string) => {
    setDetailDate(date)
  }

  const handleExcelUpload = async (file: File) => {
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, codepage: 65001 })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, any>[]
      // 列名识别（中文/英文）
      const colMap: Record<string, string> = {}
      if (rows.length) {
        const keys = Object.keys(rows[0])
        const find = (...names: string[]) => keys.find((k) => names.some((n) => k.includes(n))) || ''
        colMap.date = find('日期', 'date', '时间')
        colMap.module = find('模块', 'module', '科目')
        colMap.task = find('任务', 'task', '内容', '题目')
        colMap.status = find('状态', '模式', '摸鱼', '半天', '没空', 'mode')
      }
      let count = 0
      let planOrder = 0
      for (const r of rows) {
        const date = normalizeDate(r[colMap.date] ?? r[Object.keys(r)[0]])
        const moduleRaw = String(r[colMap.module] ?? r[Object.keys(r)[1]] ?? '').trim()
        const task = String(r[colMap.task] ?? r[Object.keys(r)[2]] ?? '').trim()
        if (!date || !task) continue
        // 每行可带「状态」列指定摸鱼/半天/没空；缺省时用上方全局状态
        const status = colMap.status && r[colMap.status] ? parseMode(String(r[colMap.status])) : uploadStatus
        await upsertDayStatus({ user_id: userId, date, status })
        await upsertDailyPlan({
          id: '',
          user_id: userId,
          date,
          mode: status,
          plan_type: 'sub',
          module_name: pickModule(moduleRaw),
          task_title: task,
          is_completed: false,
          task_category: 'normal',
          sort_order: planOrder++,
        })
        count++
      }
      if (count === 0) {
        toast.warning('未解析到有效数据，请确认模板为「日期/模块/任务」')
      } else {
        toast.success(`已导入 ${count} 条计划（状态：${getModeMeta(uploadStatus).short}）`)
        reload()
      }
    } catch (e: any) {
      toast.error('解析失败：' + (e.message || '文件格式不正确'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 当月任务表格：只显示「当天实际状态」对应的计划
  // （例如 5 号标记为「没空」，就只显示 5 号 overtime 状态的计划）
  const monthTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.date.startsWith(monthPrefix))
        .filter((t) => statuses[t.date] && t.mode === statuses[t.date])
        .sort((a, b) => a.date.localeCompare(b.date)),
    [tasks, monthPrefix, statuses]
  )

  // 日历网格
  const calendar = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const startWeekday = first.getDay() // 0=日
    const daysInMonth = new Date(year, month, 0).getDate()
    const cells: ({ date: string; day: number } | null)[] = []
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${monthPrefix}-${String(d).padStart(2, '0')}`, day: d })
    }
    return cells
  }, [year, month, monthPrefix])

  const monthTaskCount = monthTasks.length

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 页面标题 + 上传 / 月份导航 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">月计划</h2>
          <p className="text-xs text-muted-foreground">标记每日状态 · 查看当月任务</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-3.5" />
            {uploading ? '导入中...' : '上传 Excel'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleExcelUpload(f)
            }}
          />
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 px-1">
            <button onClick={goPrevMonth} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-[64px] text-center text-xs font-semibold">{year}年{month}月</span>
            <button onClick={goNextMonth} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 导入设置 + 图例（合并为一张卡片，减少顶部空间占用） */}
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">导入默认状态</span>
            {(['fish', 'halfday', 'overtime'] as StudyMode[]).map((s) => {
              const meta = getModeMeta(s)
              return (
                <button
                  key={s}
                  onClick={() => setUploadStatus(s)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                    uploadStatus === s ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                  )}
                >
                  <span className={cn('size-2 rounded-full', statusClass(s))} />
                  {meta.short}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {(['fish', 'halfday', 'overtime'] as StudyMode[]).map((s) => {
              const meta = getModeMeta(s)
              return (
                <span key={s} className="flex items-center gap-1">
                  <span className={cn('size-2 rounded-full', statusClass(s))} />
                  {meta.short}
                </span>
              )
            })}
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-muted" />
              未标记
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          模板：日期 / 模块 / 任务 / 状态（可选，填「摸鱼/半天/没空」则按行分状态）
        </p>
      </div>

      {/* 月历 */}
      <Card>
        <CardContent className="py-3">
          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {WEEK_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.map((cell, idx) => {
              if (!cell) return <div key={idx} />
              const isToday = cell.date === today
              const st = statuses[cell.date]
              const dayTaskCount = monthTasks.filter((t) => t.date === cell.date).length
              return (
                <button
                  key={cell.date}
                  onClick={() => handleTapDay(cell.date)}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors',
                    isToday ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:bg-accent'
                  )}
                >
                  <span className={cn('font-medium', isToday && 'text-primary')}>{cell.day}</span>
                  <span className={cn('mt-0.5 size-2 rounded-full', statusClass(st))} />
                  {dayTaskCount > 0 && (
                    <span className="absolute right-1 top-1 text-[9px] text-muted-foreground">{dayTaskCount}</span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 当月任务表：日期 / 模块 / 任务 */}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Table2 className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-muted-foreground">
            当月任务（{monthTaskCount} 项）
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="ml-auto gap-1.5 text-xs" disabled={monthTasks.length === 0}>
                <Download className="size-3.5" />
                导出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  downloadCSV(
                    `月计划_${monthPrefix}.csv`,
                    ['日期', '星期', '状态', '模块', '任务', '是否完成'],
                    monthTasks.map((t) => [
                      t.date,
                      weekdayOf(t.date),
                      statuses[t.date] ? getModeMeta(statuses[t.date]).short : '未标记',
                      t.module_name,
                      t.task_title,
                      t.is_completed ? '是' : '否',
                    ])
                  )
                }
              >
                导出为 CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadJSON(`月计划_${monthPrefix}.json`, monthTasks)}>
                导出为 JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">加载中...</p>
        ) : monthTasks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              本月还没有任务，去「每日计划」添加吧
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border py-1">
              {monthTasks.map((t) => {
                const st = statuses[t.date]
                const meta = st ? getModeMeta(st) : null
                return (
                  <div key={t.id} className="flex items-center gap-2 py-2 text-sm">
                    <button onClick={() => setDetailDate(t.date)} className="w-14 shrink-0 text-left font-medium hover:text-primary">
                      {t.date.slice(5)}
                      <span className="ml-0.5 text-[10px] text-muted-foreground">{weekdayOf(t.date)}</span>
                    </button>
                    <span className="w-16 shrink-0 truncate text-muted-foreground">{t.module_name}</span>
                    <span className={cn('flex-1 truncate', t.is_completed ? 'text-muted-foreground line-through' : '')}>
                      {t.task_title}
                    </span>
                    {t.is_ai && (
                      <Badge className="shrink-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">AI</Badge>
                    )}
                    {meta && (
                      <Badge variant="outline" className={cn('shrink-0 text-[10px]', meta.accent)}>
                        {meta.short}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 当日详情弹窗 */}
      <DayDetailDialog
        open={!!detailDate}
        date={detailDate}
        userId={userId}
        onClose={() => setDetailDate(null)}
        onChanged={reload}
      />
    </div>
  )
}

function DayDetailDialog({
  open,
  date,
  userId,
  onClose,
  onChanged,
}: {
  open: boolean
  date: string | null
  userId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [dayPlans, setDayPlans] = useState<DailyPlan[]>([])
  const [status, setStatus] = useState<StudyMode | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open || !date) return
    ;(async () => {
      const [plans, statuses] = await Promise.all([getAllPlans(), getDayStatuses(userId)])
      setDayPlans(plans.filter((p) => p.date === date))
      const s = statuses.find((x) => x.date === date)
      setStatus(s?.status)
    })()
  }, [open, date, userId])

  const changeStatus = async (s: StudyMode) => {
    setStatus(s)
    if (date) await upsertDayStatus({ user_id: userId, date, status: s })
    onChanged()
  }

  const removePlan = async (id: string) => {
    await import('@/lib/api').then((m) => m.deletePlan(id))
    setDayPlans((p) => p.filter((x) => x.id !== id))
    onChanged()
  }

  const batchDelete = async () => {
    if (!date) return
    setDeleting(true)
    try {
      const n = await deletePlansByDateRange(userId, date, date)
      toast.success(`已删除当天 ${n} 条计划`)
      setDayPlans([])
      onChanged()
    } finally {
      setDeleting(false)
    }
  }

  if (!date) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{date} 当日安排</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </DialogTitle>
          <DialogDescription className="text-xs">设置当日状态，或批量删除当天计划（计划会随状态联动）</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">当日状态</span>
            <div className="flex gap-2">
              {(['fish', 'halfday', 'overtime'] as StudyMode[]).map((s) => {
                const meta = getModeMeta(s)
                return (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm',
                      status === s ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'
                    )}
                  >
                    <span className={cn('size-2.5 rounded-full', statusClass(s))} />
                    {meta.short}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">计划（{dayPlans.length}）</span>
              {dayPlans.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={batchDelete} disabled={deleting}>
                  <Trash2 className="size-3.5" />
                  批量删除
                </Button>
              )}
            </div>
            {dayPlans.length === 0 ? (
              <p className="rounded-lg bg-muted/40 py-4 text-center text-xs text-muted-foreground">当天暂无计划</p>
            ) : (
              <div className="max-h-[40vh] space-y-3 overflow-y-auto">
                {MODES.map((meta) => {
                  const plans = dayPlans.filter((p) => p.mode === meta.key)
                  if (plans.length === 0) return null
                  return (
                    <div key={meta.key} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className={cn('size-2.5 rounded-full', statusClass(meta.key))} />
                        <span className="text-xs font-semibold text-muted-foreground">{meta.label}</span>
                        <span className="text-[11px] text-muted-foreground">（{plans.length} 项）</span>
                      </div>
                      {plans.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm">
                          <span className="w-14 shrink-0 text-xs text-muted-foreground">{p.module_name}</span>
                          <div className={cn('break-any max-h-20 flex-1 overflow-y-auto', p.is_completed && 'text-muted-foreground line-through')}>
                            {p.task_title}
                          </div>
                          {p.is_ai && (
                            <Badge className="shrink-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">AI</Badge>
                          )}
                          <button onClick={() => removePlan(p.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
