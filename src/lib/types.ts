// ============================================================
// 省考备考打卡平台 - 领域类型定义
// 与 TCB PostgreSQL 表结构保持一致 (database: public)
// ============================================================

/** 学习模式 */
export type StudyMode = 'overtime' | 'halfday' | 'fish'

/** 计划类型：主计划(周计划分解) / 次计划 */
export type PlanType = 'main' | 'sub'

/** 任务分类：核心 / 常规 / 保温(额外) */
export type TaskCategory = 'core' | 'normal' | 'extra'

export interface User {
  uid: string
  nickname?: string
  avatar?: string
}

// ---------- daily_plans ----------
export interface DailyPlan {
  id: string
  user_id: string
  date: string
  mode: StudyMode
  plan_type: PlanType
  module_name: string
  task_title: string
  task_description?: string
  target_count?: number
  target_accuracy?: number
  question_source?: string
  is_completed: boolean
  task_category: TaskCategory
  sort_order: number
  is_ai?: boolean
  created_at?: string
  updated_at?: string
}

// ---------- checkins ----------
export interface Checkin {
  id: string
  user_id: string
  date: string
  mode: StudyMode
  total_tasks: number
  completed_tasks: number
  study_duration?: number
  notes?: string
  created_at?: string
  updated_at?: string
}

// ---------- ai_grading_records ----------
export interface AiGradingRecord {
  id: string
  user_id: string
  module_type: string
  question_content: string
  points?: string
  arguments?: string
  text_structure?: string
  formula?: string
  prediction_direction?: string
  user_answer: string
  reference_answer?: string
  ai_result?: string
  ai_analysis?: string
  score?: number
  is_correct?: boolean
  image_url?: string
  created_at?: string
  updated_at?: string
}

// ---------- mistakes ----------
export interface Mistake {
  id: string
  user_id: string
  module_type: string
  /** 题干（必填，作为主要题目内容） */
  stem?: string
  /** 兼容旧数据：题目内容 */
  question_content: string
  /** 材料/题干背景（可选，可空） */
  material?: string
  /** 选项列表（可选，可空） */
  options?: string[]
  /** 答案（可选） */
  answer?: string
  /** 我的答案（做错时的作答，可选） */
  my_answer?: string
  /** 错因标记 */
  error_reasons: string[]
  /** 解析（可选，可空） */
  analysis?: string
  /** 关键要点（必填，核心总结 1-3 条） */
  key_points?: string
  /** 兼容旧数据：正确思路 */
  correct_solution?: string
  review_date?: string
  /** 复习排程：下一次复习日期（YYYY-MM-DD），空表示从未按计划复习 */
  next_review_date?: string
  /** 复习排程阶段 0-4（对应间隔 1/3/7/15/30 天） */
  review_stage?: number
  source: 'manual' | 'ai' | 'quiz'
  source_id?: string
  reviewed_count: number
  mastered: boolean
  image_url?: string
  created_at?: string
  updated_at?: string
}

// ---------- reviews ----------
export type ReviewType = 'daily' | 'weekly'

export interface Review {
  id: string
  user_id: string
  type: ReviewType
  date: string
  content: string
  key_points?: string
  summary?: string
  next_plan?: string
  created_at?: string
  updated_at?: string
}

// ---------- question_banks ----------
export interface QuestionBank {
  id: string
  user_id: string
  name: string
  description?: string
  module_type?: string
  difficulty?: string
  total_count: number
  file_url?: string
  created_at?: string
  updated_at?: string
}

// ---------- questions ----------
export interface Question {
  id: string
  bank_id: string
  module_type?: string
  /** 材料/题干背景（可选，可空） */
  material?: string
  /** 题干（必填） */
  question_content: string
  options: string[]
  correct_answer: string
  analysis?: string
  key_points?: string
  difficulty?: string
  tags?: string[]
  image_url?: string
  created_at?: string
  updated_at?: string
}

// ---------- quiz_sessions ----------
export type QuizMode = 'practice' | 'review'

export interface QuizSession {
  id: string
  user_id: string
  bank_id: string
  mode: QuizMode
  total_count: number
  correct_count: number
  wrong_count: number
  duration?: number
  created_at?: string
  completed_at?: string
}

// ---------- day_status（每日可用状态：摸鱼/半天有空/没空）----------
// status 复用 StudyMode：fish=摸鱼, halfday=半天有空, overtime=没空
export interface DayStatus {
  id: string
  user_id: string
  date: string
  status: StudyMode
  updated_at?: string
}

// ---------- weekly_plans ----------
export interface WeeklyPlan {
  id: string
  user_id: string
  week_start_date: string
  file_url?: string
  file_name?: string
  content: WeeklyPlanContent
  created_at?: string
  updated_at?: string
}

/** 周计划内容：按星期几分解的每日任务 */
export interface WeeklyPlanContent {
  week_start_date: string
  days: {
    day: number
    label: string
    tasks: { module_name: string; task_title: string }[]
  }[]
}

// ---------- AI 批改结果 ----------
export interface GradingResult {
  ai_result: string
  ai_analysis: string
  score: number
  is_correct: boolean
  detailed_feedback?: string
}
