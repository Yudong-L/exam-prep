import type {
  DailyPlan,
  StudyMode,
  TaskCategory,
  WeeklyPlanContent,
} from './types'

// ============================================================
// 模式配置
// ============================================================
export interface ModeMeta {
  key: StudyMode
  label: string
  short: string
  desc: string
  emoji: string
  /** 该模式展示的任务分类 */
  categories: TaskCategory[]
  accent: string // tailwind 颜色类名 (用于高亮)
}

export const MODES: ModeMeta[] = [
  {
    key: 'overtime',
    label: '加班没空',
    short: '没空',
    desc: '只保留最核心任务，保住手感',
    emoji: '🔥',
    categories: ['core'],
    accent: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  {
    key: 'halfday',
    label: '半天备考',
    short: '半天',
    desc: '常规节奏，稳步推进计划',
    emoji: '🌤️',
    categories: ['core', 'normal'],
    accent: 'bg-primary/10 text-primary border-primary/20',
  },
  {
    key: 'fish',
    label: '全天摸鱼',
    short: '摸鱼',
    desc: '完整任务 + 保温任务，全面覆盖',
    emoji: '🐟',
    categories: ['core', 'normal', 'extra'],
    accent: 'bg-success/10 text-success border-success/20',
  },
]

export function getModeMeta(mode: StudyMode): ModeMeta {
  return MODES.find((m) => m.key === mode) ?? MODES[1]
}

// ============================================================
// 省考模块
// ============================================================
export const MODULES = [
  '言语理解',
  '言语逻辑填空',
  '图形推理',
  '逻辑判断论证',
  '定义判断',
  '类比推理',
  '资料分析',
  '数量关系',
  '常识判断',
  '政治理论',
  '申论',
] as const

// ============================================================
// 模块对应的专属字段标签（用于 AI 批改表单切换）
// ============================================================
export const MODULE_SPECIAL_FIELDS: Record<string, { field: string; key: string; placeholder: string }[]> = {
  '言语理解': [
    { field: '文段结构', key: 'text_structure', placeholder: '如：总分总结构，中心句在首段...' },
  ],
  '言语逻辑填空': [
    { field: '语境分析', key: 'text_structure', placeholder: '如：转折关系，前后语义相反...' },
  ],
  '图形推理': [
    { field: '图形特征', key: 'text_structure', placeholder: '如：元素组成相同，考虑位置规律...' },
  ],
  '逻辑判断论证': [
    { field: '论点', key: 'points', placeholder: '题目核心论点是什么？' },
    { field: '论据', key: 'arguments', placeholder: '支持论点的论据是什么？' },
  ],
  '定义判断': [
    { field: '关键要件', key: 'text_structure', placeholder: '定义中的关键要件有哪些？' },
  ],
  '类比推理': [
    { field: '词语关系', key: 'text_structure', placeholder: '如：种属关系、组成关系、功能对应...' },
  ],
  '资料分析': [
    { field: '公式', key: 'formula', placeholder: '如：基期=现期/(1+增长率)' },
  ],
  '数量关系': [
    { field: '公式/思路', key: 'formula', placeholder: '如：路程=速度×时间' },
  ],
  '常识判断': [
    { field: '知识点', key: 'text_structure', placeholder: '涉及的知识领域和判断依据...' },
  ],
  '政治理论': [
    { field: '理论要点', key: 'text_structure', placeholder: '涉及的政治理论要点...' },
  ],
  '申论': [
    { field: '作答要点', key: 'text_structure', placeholder: '如：问题-原因-对策结构...' },
  ],
}

// ============================================================
// 支持图片上传的模块（图形推理、资料分析等需要看图的题型）
// ============================================================
export const MODULES_WITH_IMAGE = ['图形推理', '资料分析', '定义判断']

// ============================================================
// 错因分类（预设 + 支持自定义）
// ============================================================
export const ERROR_REASONS = [
  '找数错',
  '公式错',
  '计算错',
  '审题错',
  '思路错',
  '知识点不会',
] as const

// ============================================================
// 默认计划模板（按分类）
// 说明：模式切换联动逻辑的核心 ——
// 不同 mode 生成不同 category 的任务集合：
//  - overtime(加班没空): 仅 core 核心任务 (1-2 个)
//  - halfday(半天备考):  core + normal 常规任务
//  - fish(全天摸鱼):     core + normal + extra 保温任务
// ============================================================
interface PlanTemplate {
  module_name: string
  task_title: string
  category: TaskCategory
}

const CORE_TASKS: PlanTemplate[] = [
  { module_name: '言语理解', task_title: '完成言语理解 15 题', category: 'core' },
  { module_name: '资料分析', task_title: '完成资料分析 2 篇', category: 'core' },
]

const NORMAL_TASKS: PlanTemplate[] = [
  { module_name: '图形推理', task_title: '图形推理专项 10 题', category: 'normal' },
  { module_name: '逻辑判断', task_title: '逻辑判断论证 10 题', category: 'normal' },
  { module_name: '错题复盘', task_title: '复习昨日错题本', category: 'normal' },
]

const EXTRA_TASKS: PlanTemplate[] = [
  { module_name: '常识判断', task_title: '常识速记 20 条', category: 'extra' },
  { module_name: '时政热点', task_title: '浏览今日时政热点', category: 'extra' },
]

const TEMPLATES: Record<TaskCategory, PlanTemplate[]> = {
  core: CORE_TASKS,
  normal: NORMAL_TASKS,
  extra: EXTRA_TASKS,
}

/** 根据模式生成当日默认计划（联动核心逻辑） */
export function generateDefaultPlans(
  mode: StudyMode,
  date: string,
  userId: string
): DailyPlan[] {
  const meta = getModeMeta(mode)
  const plans: DailyPlan[] = []
  let order = 0
  for (const cat of ['core', 'normal', 'extra'] as TaskCategory[]) {
    if (!meta.categories.includes(cat)) continue
    for (const tpl of TEMPLATES[cat]) {
      plans.push({
        id: '',
        user_id: userId,
        date,
        mode,
        plan_type: 'sub',
        module_name: tpl.module_name,
        task_title: tpl.task_title,
        task_description: '',
        is_completed: false,
        task_category: tpl.category,
        sort_order: order++,
      })
    }
  }
  return plans
}

// ============================================================
// 周计划导入：将 Excel 行解析为 WeeklyPlanContent
// 期望表头含：星期(周一~周日) / 模块 / 任务
// ============================================================
export function buildWeeklyPlanContent(
  weekStart: string,
  rows: { day: number; label: string; module_name: string; task_title: string }[]
): WeeklyPlanContent {
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    day: d,
    label: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][d - 1],
    tasks: [] as { module_name: string; task_title: string }[],
  }))
  for (const r of rows) {
    const target = days.find((x) => x.day === r.day)
    if (target) target.tasks.push({ module_name: r.module_name, task_title: r.task_title })
  }
  return { week_start_date: weekStart, days }
}

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 将Excel中的「状态」列文本解析为学习模式（摸鱼/半天/没空） */
export function parseMode(raw: string): StudyMode {
  const s = String(raw || '').trim()
  if (/摸鱼|全天|fish/i.test(s)) return 'fish'
  if (/半天|half/i.test(s)) return 'halfday'
  if (/没空|加班|overtime|没时间|无空/i.test(s)) return 'overtime'
  return 'halfday'
}
