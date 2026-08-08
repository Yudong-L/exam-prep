// ============================================================
// React Query 数据钩子
// 服务端状态统一通过 TCB SDK 管理，客户端 UI 状态通过 useAppStore
// ============================================================
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useAppStore } from '@/store/useAppStore'
import * as api from '@/lib/api'
import type {
  AiGradingRecord,
  Checkin,
  DailyPlan,
  Mistake,
  Question,
  QuestionBank,
  QuizSession,
  Review,
  StudyMode,
  WeeklyPlan,
} from '@/lib/types'

// 取当前用户 id（避免触发额外渲染）
function useUserId(): string {
  return useAppStore((s) => s.user?.uid ?? '')
}

function useDateMode(): { userId: string; date: string; mode: StudyMode } {
  const userId = useAppStore((s) => s.user?.uid ?? '')
  const date = useAppStore((s) => s.currentDate)
  const mode = useAppStore((s) => s.currentMode)
  return { userId, date, mode }
}

// -------------------- 每日计划 --------------------
// 主计划(周计划导入)不区分模式；次计划展示该日期下全部状态(摸鱼/半天/没空)的任务
export function useDailyPlans(customDate?: string) {
  const { userId, date: globalDate } = useDateMode()
  const date = customDate ?? globalDate
  return useQuery({
    queryKey: ['dailyPlans', userId, date],
    queryFn: async () => {
      // 1. 获取主计划（周计划导入的任务，不受模式影响）
      const mainPlans = await api.getMainPlans(userId, date)
      // 2. 获取该日期下所有状态的次计划（不再自动生成，删除后保持为空）
      const subPlans = await api.getSubPlansByDate(userId, date)
      // 3. 合并：主计划在前，次计划在后
      return [...mainPlans, ...subPlans]
    },
    enabled: !!userId,
  })
}

export function useTogglePlan(customDate?: string) {
  const qc = useQueryClient()
  const { userId, date: globalDate } = useDateMode()
  const date = customDate ?? globalDate
  return useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) =>
      api.togglePlanComplete(id, isCompleted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dailyPlans', userId, date] })
    },
  })
}

export function useSavePlan(customDate?: string) {
  const qc = useQueryClient()
  const { userId, date: globalDate } = useDateMode()
  const date = customDate ?? globalDate
  return useMutation({
    mutationFn: (plan: DailyPlan) => api.upsertDailyPlan(plan),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dailyPlans', userId, date] })
    },
  })
}

export function useDeletePlan(customDate?: string) {
  const qc = useQueryClient()
  const { userId, date: globalDate } = useDateMode()
  const date = customDate ?? globalDate
  return useMutation({
    mutationFn: (id: string) => api.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dailyPlans', userId, date] })
    },
  })
}

// -------------------- 打卡 --------------------
export function useCheckin() {
  const { userId, date } = useDateMode()
  return useQuery({
    queryKey: ['checkin', userId, date],
    queryFn: () => api.getCheckin(userId, date),
    enabled: !!userId,
  })
}

export function useCheckinHistory() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['checkinHistory', userId],
    queryFn: () => api.getCheckinHistory(userId),
    enabled: !!userId,
  })
}

export function useSaveCheckin() {
  const qc = useQueryClient()
  const { userId, date } = useDateMode()
  return useMutation({
    mutationFn: (record: Checkin) => api.upsertCheckin(record),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkin', userId, date] })
      qc.invalidateQueries({ queryKey: ['checkinHistory', userId] })
    },
  })
}

// -------------------- AI 批改记录 --------------------
export function useGradingHistory() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['grading', userId],
    queryFn: () => api.getGradingHistory(userId),
    enabled: !!userId,
  })
}

export function useSaveGrading() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (rec: Omit<AiGradingRecord, 'id' | 'created_at' | 'updated_at'>) =>
      api.saveGradingRecord(rec),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grading', userId] }),
  })
}

// -------------------- 错题本 --------------------
export function useMistakes(module?: string) {
  const userId = useUserId()
  return useQuery({
    queryKey: ['mistakes', userId, module ?? 'all'],
    queryFn: () => api.getMistakes(userId, module),
    enabled: !!userId,
  })
}

export function useAddMistake() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (
      m: Omit<Mistake, 'id' | 'created_at' | 'updated_at' | 'reviewed_count' | 'mastered'>
    ) => api.addMistake(m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mistakes', userId] }),
  })
}

export function useUpdateMistake() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Mistake> }) =>
      api.updateMistake(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mistakes', userId] }),
  })
}

export function useDeleteMistake() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (id: string) => api.deleteMistake(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mistakes', userId] }),
  })
}

// 当天待复习错题（间隔重复）
export function useDueReviews() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['dueReviews', userId],
    queryFn: () => api.getDueReviews(userId),
    enabled: !!userId,
  })
}

// 完成一次复习并推进排程
export function useAdvanceReview() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (id: string) => api.advanceReview(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mistakes', userId] })
      qc.invalidateQueries({ queryKey: ['dueReviews', userId] })
    },
  })
}

// -------------------- 复盘 --------------------
export function useReviews(type?: 'daily' | 'weekly') {
  const userId = useUserId()
  return useQuery({
    queryKey: ['reviews', userId, type ?? 'all'],
    queryFn: () => api.getReviews(userId, type),
    enabled: !!userId,
  })
}

export function useAddReview() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (r: Omit<Review, 'id' | 'created_at' | 'updated_at'>) => api.addReview(r),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', userId] }),
  })
}

export function useUpdateReview() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Review> }) =>
      api.updateReview(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', userId] }),
  })
}

// -------------------- 题库 & 题目 --------------------
export function useQuestionBanks() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['banks', userId],
    queryFn: () => api.getQuestionBanks(userId),
    enabled: !!userId,
  })
}

export function useCreateBank() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (payload: {
      bank: Omit<QuestionBank, 'id' | 'created_at' | 'updated_at'>
      questions: Omit<Question, 'id' | 'bank_id' | 'created_at' | 'updated_at'>[]
    }) => api.createQuestionBank(payload.bank, payload.questions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banks', userId] }),
  })
}

export function useQuestions(bankId: string | null) {
  return useQuery({
    queryKey: ['questions', bankId],
    queryFn: () => api.getQuestions(bankId as string),
    enabled: !!bankId,
  })
}

export function useDeleteBank() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (id: string) => api.deleteQuestionBank(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banks', userId] }),
  })
}

// -------------------- 刷题会话 --------------------
export function useCreateQuizSession() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (s: Omit<QuizSession, 'id' | 'created_at' | 'completed_at'>) =>
      api.createQuizSession(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizSessions', userId] }),
  })
}

export function useUpdateQuizSession() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<QuizSession> }) =>
      api.updateQuizSession(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizSessions', userId] }),
  })
}

export function useQuizSessions(bankId?: string) {
  const userId = useUserId()
  return useQuery({
    queryKey: ['quizSessions', userId, bankId ?? 'all'],
    queryFn: () => api.getQuizSessions(userId, bankId),
    enabled: !!userId,
  })
}

// -------------------- 周计划 --------------------
export function useWeeklyPlans() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['weeklyPlans', userId],
    queryFn: () => api.getWeeklyPlans(userId),
    enabled: !!userId,
  })
}

export function useAddWeeklyPlan() {
  const qc = useQueryClient()
  const userId = useUserId()
  return useMutation({
    mutationFn: (wp: Omit<WeeklyPlan, 'id' | 'created_at' | 'updated_at'>) =>
      api.addWeeklyPlan(wp),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weeklyPlans', userId] }),
  })
}
