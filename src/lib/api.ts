// ============================================================
// 数据访问层 (Data Access Layer) — 本地存储版本
// 所有数据存储在浏览器 IndexedDB 中，不依赖云端数据库。
// AI 批改/对话功能仍通过后端 API 调用通义千问。
// ============================================================
import type {
  AiGradingRecord,
  Checkin,
  DailyPlan,
  DayStatus,
  Mistake,
  Question,
  QuestionBank,
  QuizSession,
  Review,
  StudyMode,
  WeeklyPlan,
} from './types'

// ============================================================
// IndexedDB 封装
// ============================================================
const DB_NAME = 'exam-prep-db'
const DB_VERSION = 2

const STORES = [
  'daily_plans',
  'checkins',
  'ai_grading_records',
  'mistakes',
  'reviews',
  'question_banks',
  'questions',
  'quiz_sessions',
  'weekly_plans',
  'day_status',
] as const

let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => {
      dbInstance = req.result
      resolve(dbInstance)
    }
    req.onerror = () => reject(req.error)
  })
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

async function dbGet<T>(store: string, id: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut<T>(store: string, record: T): Promise<T> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(record)
    tx.oncomplete = () => resolve(record)
    tx.onerror = () => reject(tx.error)
  })
}

async function dbDelete(store: string, id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function dbClear(store: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function nowISO(): string {
  return new Date().toISOString()
}

// ============================================================
// daily_plans
// ============================================================

/** 获取主计划（周计划导入，不区分模式） */
export async function getMainPlans(
  _userId: string,
  date: string
): Promise<DailyPlan[]> {
  const all = await dbGetAll<DailyPlan>('daily_plans')
  return all
    .filter((p) => p.date === date && p.plan_type === 'main')
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** 获取次计划（按模式生成的默认任务） */
export async function getSubPlans(
  _userId: string,
  date: string,
  mode: StudyMode
): Promise<DailyPlan[]> {
  const all = await dbGetAll<DailyPlan>('daily_plans')
  return all
    .filter((p) => p.date === date && p.mode === mode && p.plan_type === 'sub')
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function getDailyPlans(
  _userId: string,
  date: string,
  mode: StudyMode
): Promise<DailyPlan[]> {
  const all = await dbGetAll<DailyPlan>('daily_plans')
  return all
    .filter((p) => p.date === date && p.mode === mode && p.plan_type === 'sub')
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** 获取某日期下所有状态的次计划（用于每日计划页按状态分组展示） */
export async function getSubPlansByDate(
  _userId: string,
  date: string
): Promise<DailyPlan[]> {
  const all = await dbGetAll<DailyPlan>('daily_plans')
  return all
    .filter((p) => p.date === date && p.plan_type !== 'main')
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function ensurePlansForMode(
  userId: string,
  date: string,
  mode: StudyMode,
  templates: Omit<DailyPlan, 'id' | 'created_at' | 'updated_at'>[]
): Promise<DailyPlan[]> {
  const existing = await getDailyPlans(userId, date, mode)
  if (existing.length > 0) return existing
  const created: DailyPlan[] = []
  for (const tpl of templates) {
    const plan: DailyPlan = {
      ...tpl,
      id: genId(),
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    await dbPut('daily_plans', plan)
    created.push(plan)
  }
  return created
}

export async function upsertDailyPlan(plan: DailyPlan): Promise<DailyPlan | null> {
  if (!plan.id) {
    plan.id = genId()
  }
  plan.updated_at = nowISO()
  if (!plan.created_at) plan.created_at = nowISO()
  await dbPut('daily_plans', plan)
  return plan
}

export async function togglePlanComplete(id: string, isCompleted: boolean): Promise<boolean> {
  const plan = await dbGet<DailyPlan>('daily_plans', id)
  if (!plan) return false
  plan.is_completed = isCompleted
  plan.updated_at = nowISO()
  await dbPut('daily_plans', plan)
  return true
}

export async function updatePlanField(
  id: string,
  patch: Partial<DailyPlan>
): Promise<boolean> {
  const plan = await dbGet<DailyPlan>('daily_plans', id)
  if (!plan) return false
  Object.assign(plan, patch)
  plan.updated_at = nowISO()
  await dbPut('daily_plans', plan)
  return true
}

export async function deletePlan(id: string): Promise<boolean> {
  await dbDelete('daily_plans', id)
  return true
}

/** 批量移动计划：提前完成或推迟一天 */
export async function shiftPlans(
  _userId: string,
  fromDate: string,
  direction: 'advance' | 'postpone'
): Promise<{ success: boolean; message: string }> {
  const all = await dbGetAll<DailyPlan>('daily_plans')

  function dateAdd(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  if (direction === 'advance') {
    // 提前完成：明天计划合并到今天，之后所有计划往前移一天
    // 收集 fromDate 之后所有有计划的日期
    const futureDates = [...new Set(all.filter(p => p.date > fromDate).map(p => p.date))].sort()
    for (const oldDate of futureDates) {
      const newDate = dateAdd(oldDate, -1)
      const plansOnDate = all.filter(p => p.date === oldDate)
      for (const p of plansOnDate) {
        p.date = newDate
        p.updated_at = nowISO()
        await dbPut('daily_plans', p)
      }
    }
  } else {
    // 推迟一天：今天未完成的计划移到明天，之后所有计划往后移一天
    // 从最远日期开始往后移，避免冲突
    const futureDates = [...new Set(all.filter(p => p.date >= fromDate).map(p => p.date))].sort().reverse()
    for (const oldDate of futureDates) {
      const newDate = dateAdd(oldDate, 1)
      const plansOnDate = all.filter(p => p.date === oldDate)
      for (const p of plansOnDate) {
        // 推迟时，今天已完成的计划不动
        if (oldDate === fromDate && p.is_completed) continue
        p.date = newDate
        p.updated_at = nowISO()
        await dbPut('daily_plans', p)
      }
    }
  }

  return { success: true, message: direction === 'advance' ? '已提前完成' : '已推迟一天' }
}

// ============================================================
// checkins
// ============================================================
export async function getCheckin(_userId: string, date: string): Promise<Checkin | null> {
  const all = await dbGetAll<Checkin>('checkins')
  return all.find(c => c.date === date) || null
}

export async function upsertCheckin(record: Checkin): Promise<Checkin | null> {
  const all = await dbGetAll<Checkin>('checkins')
  const existing = all.find(c => c.user_id === record.user_id && c.date === record.date)
  if (existing) {
    record.id = existing.id
  } else {
    record.id = record.id || genId()
  }
  record.updated_at = nowISO()
  if (!record.created_at) record.created_at = nowISO()
  await dbPut('checkins', record)
  return record
}

export async function getCheckinHistory(_userId: string): Promise<Checkin[]> {
  const all = await dbGetAll<Checkin>('checkins')
  return all.sort((a, b) => b.date.localeCompare(a.date))
}

// ============================================================
// ai_grading_records
// ============================================================
export async function saveGradingRecord(
  rec: Omit<AiGradingRecord, 'id' | 'created_at' | 'updated_at'>
): Promise<AiGradingRecord | null> {
  const record: AiGradingRecord = {
    ...rec,
    id: genId(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  await dbPut('ai_grading_records', record)
  return record
}

export async function getGradingHistory(_userId: string, max = 10): Promise<AiGradingRecord[]> {
  const all = await dbGetAll<AiGradingRecord>('ai_grading_records')
  const sorted = all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  // 仅保留最新的 max 条；超出的历史直接从本地存储删除，精简空间
  if (sorted.length > max) {
    for (const r of sorted.slice(max)) {
      await dbDelete('ai_grading_records', r.id)
    }
    return sorted.slice(0, max)
  }
  return sorted
}

export async function deleteGradingRecord(id: string): Promise<void> {
  await dbDelete('ai_grading_records', id)
}

// ============================================================
// AI 批改 / 对话 / 复盘 — 前端直接调用（支持多服务商）
// ============================================================
export { submitGrading } from './ai-service'
export type { GradingInput, GradingResult } from './ai-service'
export {
  aiGradingChat,
  aiReviewChat,
  verifyAiPassword,
  hasAiAccess,
  clearAiAccess,
  setAiApiKey,
  getAiApiKey,
  hasAiApiKey,
  clearAiApiKey,
  AI_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_SIGNUP,
  getAiProvider,
  setAiProvider,
  getApiKeyForProvider,
  setApiKeyForProvider,
  clearApiKeyForProvider,
  getModelForProvider,
  setModelForProvider,
  getProviderDefaultModel,
  providerSupportsVision,
} from './ai-service'
export type { AiProvider } from './ai-service'

// ============================================================
// mistakes
// ============================================================
export async function getMistakes(_userId: string, module?: string): Promise<Mistake[]> {
  const all = await dbGetAll<Mistake>('mistakes')
  const filtered = module ? all.filter(m => m.module_type === module) : all
  return filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

export async function addMistake(
  m: Omit<Mistake, 'id' | 'created_at' | 'updated_at' | 'reviewed_count' | 'mastered'>
): Promise<Mistake | null> {
  const mistake: Mistake = {
    ...m,
    id: genId(),
    reviewed_count: 0,
    mastered: false,
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  await dbPut('mistakes', mistake)
  return mistake
}

export async function updateMistake(id: string, patch: Partial<Mistake>): Promise<boolean> {
  const m = await dbGet<Mistake>('mistakes', id)
  if (!m) return false
  Object.assign(m, patch)
  m.updated_at = nowISO()
  await dbPut('mistakes', m)
  return true
}

export async function markMistakeReviewed(id: string, reviewedCount: number): Promise<boolean> {
  return updateMistake(id, { reviewed_count: reviewedCount + 1 })
}

// ============================================================
// 复习排程（简易间隔重复：1/3/7/15/30 天）
// ============================================================
const REVIEW_INTERVALS = [1, 3, 7, 15, 30]

function reviewDateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 当天需要复习的错题（next_review_date 为空或 <= 今天，且未掌握） */
export async function getDueReviews(userId: string): Promise<Mistake[]> {
  const all = await getMistakes(userId)
  const today = reviewDateStr(0)
  return all.filter((m) => !m.mastered && (!m.next_review_date || m.next_review_date <= today))
}

/** 完成一次复习后推进排程：阶段 +1，下一次复习日期顺延；已到最后一阶段则标记为掌握 */
export async function advanceReview(id: string): Promise<boolean> {
  const m = await dbGet<Mistake>('mistakes', id)
  if (!m) return false
  const stage = Math.min((m.review_stage ?? 0) + 1, REVIEW_INTERVALS.length)
  const reachedEnd = stage >= REVIEW_INTERVALS.length
  const patch: Partial<Mistake> = {
    review_stage: stage,
    reviewed_count: (m.reviewed_count || 0) + 1,
    next_review_date: reachedEnd ? undefined : reviewDateStr(REVIEW_INTERVALS[stage] ?? 30),
    mastered: reachedEnd ? true : m.mastered,
  }
  return updateMistake(id, patch)
}

export async function deleteMistake(id: string): Promise<boolean> {
  await dbDelete('mistakes', id)
  return true
}

/**
 * 查重：判断错题本是否已存在同一道题（同模块 + 题干一致）。
 * 用于加入错题本前的「防止重复」提示。
 */
export async function findDuplicateMistake(
  _userId: string,
  stem: string,
  moduleType: string
): Promise<Mistake | null> {
  const all = await dbGetAll<Mistake>('mistakes')
  const norm = (s: string) => (s || '').trim().replace(/\s+/g, '')
  const target = norm(stem)
  if (!target) return null
  return (
    all.find(
      (m) =>
        norm(m.module_type) === norm(moduleType) &&
        norm(m.stem || m.question_content) === target
    ) || null
  )
}

// ============================================================
// reviews
// ============================================================
export async function getReviews(
  _userId: string,
  type?: 'daily' | 'weekly'
): Promise<Review[]> {
  const all = await dbGetAll<Review>('reviews')
  const filtered = type ? all.filter(r => r.type === type) : all
  return filtered.sort((a, b) => b.date.localeCompare(a.date))
}

export async function addReview(
  r: Omit<Review, 'id' | 'created_at' | 'updated_at'>
): Promise<Review | null> {
  const review: Review = {
    ...r,
    id: genId(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  await dbPut('reviews', review)
  return review
}

export async function updateReview(id: string, patch: Partial<Review>): Promise<boolean> {
  const r = await dbGet<Review>('reviews', id)
  if (!r) return false
  Object.assign(r, patch)
  r.updated_at = nowISO()
  await dbPut('reviews', r)
  return true
}

/** 删除单条复盘记录 */
export async function deleteReview(id: string): Promise<boolean> {
  await dbDelete('reviews', id)
  return true
}

// ============================================================
// question_banks + questions
// ============================================================
export async function getQuestionBanks(_userId: string): Promise<QuestionBank[]> {
  const all = await dbGetAll<QuestionBank>('question_banks')
  return all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

export async function createQuestionBank(
  bank: Omit<QuestionBank, 'id' | 'created_at' | 'updated_at'>,
  questions: Omit<Question, 'id' | 'bank_id' | 'created_at' | 'updated_at'>[]
): Promise<QuestionBank | null> {
  const bankId = genId()
  const newBank: QuestionBank = {
    ...bank,
    id: bankId,
    total_count: questions.length,
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  await dbPut('question_banks', newBank)

  for (const q of questions) {
    const question: Question = {
      ...q,
      id: genId(),
      bank_id: bankId,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    await dbPut('questions', question)
  }

  return newBank
}

export async function getQuestions(bankId: string): Promise<Question[]> {
  const all = await dbGetAll<Question>('questions')
  return all.filter(q => q.bank_id === bankId).sort((a, b) => (a.id || '').localeCompare(b.id || ''))
}

export async function addQuestion(
  q: Omit<Question, 'id' | 'bank_id' | 'created_at' | 'updated_at'> & { bank_id: string }
): Promise<Question | null> {
  const question: Question = {
    ...q,
    id: genId(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  await dbPut('questions', question)

  // Update total_count
  const bank = await dbGet<QuestionBank>('question_banks', q.bank_id)
  if (bank) {
    const count = (await getQuestions(q.bank_id)).length
    bank.total_count = count
    bank.updated_at = nowISO()
    await dbPut('question_banks', bank)
  }

  return question
}

export async function deleteQuestionBank(id: string): Promise<boolean> {
  // Delete all questions in this bank
  const all = await dbGetAll<Question>('questions')
  for (const q of all.filter(qq => qq.bank_id === id)) {
    await dbDelete('questions', q.id)
  }
  await dbDelete('question_banks', id)
  return true
}

// ============================================================
// quiz_sessions
// ============================================================
export async function createQuizSession(
  s: Omit<QuizSession, 'id' | 'created_at' | 'completed_at'>
): Promise<QuizSession | null> {
  const session: QuizSession = {
    ...s,
    id: genId(),
    created_at: nowISO(),
  }
  await dbPut('quiz_sessions', session)
  return session
}

export async function updateQuizSession(id: string, patch: Partial<QuizSession>): Promise<boolean> {
  const s = await dbGet<QuizSession>('quiz_sessions', id)
  if (!s) return false
  Object.assign(s, patch)
  if (patch.completed_at !== undefined) {
    s.completed_at = nowISO()
  }
  await dbPut('quiz_sessions', s)
  return true
}

export async function getQuizSessions(_userId: string, bankId?: string): Promise<QuizSession[]> {
  const all = await dbGetAll<QuizSession>('quiz_sessions')
  const filtered = bankId ? all.filter(s => s.bank_id === bankId) : all
  return filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

// ============================================================
// weekly_plans
// ============================================================
export async function getWeeklyPlans(_userId: string): Promise<WeeklyPlan[]> {
  const all = await dbGetAll<WeeklyPlan>('weekly_plans')
  return all.sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))
}

export async function addWeeklyPlan(
  wp: Omit<WeeklyPlan, 'id' | 'created_at' | 'updated_at'>
): Promise<WeeklyPlan | null> {
  const plan: WeeklyPlan = {
    ...wp,
    id: genId(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  await dbPut('weekly_plans', plan)
  return plan
}

// ============================================================
// day_status（每日可用状态）
// ============================================================
export async function getDayStatuses(_userId: string): Promise<DayStatus[]> {
  const all = await dbGetAll<DayStatus>('day_status')
  return all
}

/** 获取全部每日计划（本地单用户，按月筛选用） */
export async function getAllPlans(): Promise<DailyPlan[]> {
  return dbGetAll<DailyPlan>('daily_plans')
}

export async function upsertDayStatus(
  record: Omit<DayStatus, 'id' | 'updated_at'> & { id?: string }
): Promise<DayStatus | null> {
  const status: DayStatus = {
    ...record,
    id: record.id || `${record.user_id}:${record.date}`,
    updated_at: nowISO(),
  }
  await dbPut('day_status', status)
  return status
}

// ============================================================
// 错题批量加入练习题库
// ============================================================
export async function addMistakesToQuizBank(
  mistakes: Mistake[],
  bankName = '错题练习库'
): Promise<QuestionBank | null> {
  const all = await dbGetAll<QuestionBank>('question_banks')
  let bank = all.find((b) => b.name === bankName)
  if (!bank) {
    bank = {
      id: genId(),
      user_id: mistakes[0]?.user_id ?? '',
      name: bankName,
      description: '由错题本一键生成的练习题库',
      total_count: 0,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    await dbPut('question_banks', bank)
  }
  for (const m of mistakes) {
    const question: Question = {
      id: genId(),
      bank_id: bank.id,
      module_type: m.module_type,
      material: m.material,
      question_content: m.stem || m.question_content,
      options: m.options && m.options.length > 0 ? m.options : [],
      correct_answer: m.answer || m.correct_solution || '',
      analysis: m.analysis || (m.error_reasons || []).join('；'),
      key_points: m.key_points,
      difficulty: m.mastered ? '已掌握' : '待巩固',
      tags: ['错题'],
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    await dbPut('questions', question)
  }
  bank.total_count = (await getQuestions(bank.id)).length
  bank.updated_at = nowISO()
  await dbPut('question_banks', bank)
  return bank
}

// ============================================================
// 批量删除某日期范围内的计划
// ============================================================
export async function deletePlansByDateRange(
  _userId: string,
  fromDate: string,
  toDate: string
): Promise<number> {
  const all = await dbGetAll<DailyPlan>('daily_plans')
  const toDelete = all.filter((p) => p.date >= fromDate && p.date <= toDate)
  for (const p of toDelete) {
    await dbDelete('daily_plans', p.id)
  }
  return toDelete.length
}

// ============================================================
// 清除历史记录（设置页「清除记录」）
// 删除：已完成的计划、已掌握的错题、一个月前的每日复盘
// ============================================================
export async function clearOldRecords(
  userId: string
): Promise<{ plans: number; mistakes: number; reviews: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 1. 已完成的计划
  const allPlans = await getAllPlans()
  const donePlans = allPlans.filter((p) => p.is_completed)
  for (const p of donePlans) await deletePlan(p.id)

  // 2. 已掌握的错题
  const mistakes = await getMistakes(userId)
  const mastered = mistakes.filter((m) => m.mastered)
  for (const m of mastered) await deleteMistake(m.id)

  // 3. 一个月前的每日复盘（仅 type=daily）
  const dailies = await getReviews(userId, 'daily')
  const oldReviews = dailies.filter((r) => r.created_at && r.created_at < cutoff)
  for (const r of oldReviews) await deleteReview(r.id)

  return { plans: donePlans.length, mistakes: mastered.length, reviews: oldReviews.length }
}

// ============================================================
// 数据导出 / 导入（用于备份和恢复）
// ============================================================
export async function exportAllData(): Promise<Record<string, any[]>> {
  const result: Record<string, any[]> = {}
  for (const store of STORES) {
    result[store] = await dbGetAll(store)
  }
  return result
}

export async function importAllData(data: Record<string, any[]>): Promise<void> {
  for (const store of STORES) {
    await dbClear(store)
    const records = data[store] || []
    for (const record of records) {
      await dbPut(store, record)
    }
  }
}
