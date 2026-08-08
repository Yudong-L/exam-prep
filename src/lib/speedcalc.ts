// 速算练习题目生成器
// 三种模式：纯算数(arithmetic) / 资料估算(estimate) / 资料找数(find)

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type ArithmeticQ = { kind: 'arithmetic'; q: string; answer: number; op: string }
export type EstimateQ = { kind: 'estimate'; q: string; options: number[]; answer: number }
export type FindTable = { title: string; headers: string[]; rows: { label: string; values: number[] }[] }
export type FindQ = { kind: 'find'; table: FindTable; question: string; answer: number; ri: number; ci: number }

// 纯算数：加减乘除 + 百分比（均保证答案为整数，便于心算与输入）
export function genArithmetic(): ArithmeticQ {
  const ops = ['add', 'sub', 'mul', 'div', 'pct'] as const
  const op = ops[randInt(0, ops.length - 1)]
  if (op === 'add') {
    const a = randInt(10, 999)
    const b = randInt(10, 999)
    return { kind: 'arithmetic', q: `${a} + ${b}`, answer: a + b, op: '加法' }
  }
  if (op === 'sub') {
    const a = randInt(100, 999)
    const b = randInt(10, a)
    return { kind: 'arithmetic', q: `${a} - ${b}`, answer: a - b, op: '减法' }
  }
  if (op === 'mul') {
    const a = randInt(11, 99)
    const b = randInt(11, 99)
    return { kind: 'arithmetic', q: `${a} × ${b}`, answer: a * b, op: '乘法' }
  }
  if (op === 'div') {
    const b = randInt(2, 12)
    const ans = randInt(11, 99)
    const a = ans * b
    return { kind: 'arithmetic', q: `${a} ÷ ${b}`, answer: ans, op: '除法' }
  }
  // 百分比：base 为 20 的倍数，p 为 5 的倍数，保证结果为整数
  const base = randInt(2, 50) * 20
  const p = randInt(1, 19) * 5
  return { kind: 'arithmetic', q: `${base} 的 ${p}%`, answer: (base * p) / 100, op: '百分比' }
}

// 资料估算：给出两数乘积，从四个接近的选项中选最接近的（训练快速近似）
export function genEstimate(): EstimateQ {
  const a = randInt(12, 199)
  const b = randInt(12, 199)
  const exact = a * b
  const opts = new Set<number>([exact])
  let step = 0
  while (opts.size < 4 && step < 40) {
    const sign = step % 2 === 0 ? 1 : -1
    const mag = Math.round(exact * (0.06 + 0.03 * Math.floor(step / 2)))
    opts.add(Math.max(1, exact + sign * mag))
    step++
  }
  const options = shuffle([...opts]).slice(0, 4)
  return {
    kind: 'estimate',
    q: `估算 ${a} × ${b} 的结果（选最接近的）`,
    options,
    answer: exact,
  }
}

const FIND_THEMES = [
  {
    title: '某省 2020–2023 年主要经济指标',
    headers: ['指标', '2021', '2022', '2023'],
    labels: ['地区生产总值(亿元)', '财政收入(亿元)', '常住人口(万人)', '社会消费品零售总额(亿元)'],
  },
  {
    title: '某市高新区企业情况（单位：家）',
    headers: ['类别', '一季度', '二季度', '三季度'],
    labels: ['新注册企业', '高新技术企业', '规模以上工业企业', '科技型中小企业'],
  },
  {
    title: '某银行支行年度业务量',
    headers: ['业务', '1月', '2月', '3月'],
    labels: ['存款余额(亿元)', '贷款余额(亿元)', '理财销售额(亿元)', '客户数(万户)'],
  },
]

// 资料找数：生成一张结构化小表格 + 若干定位题（训练扫读与定位能力）
export function genFindRound(): FindQ[] {
  const theme = FIND_THEMES[randInt(0, FIND_THEMES.length - 1)]
  const headers = theme.headers
  const rows = theme.labels.map((label) => ({
    label,
    values: headers.slice(1).map(() => randInt(20, 9999)),
  }))
  const table: FindTable = { title: theme.title, headers, rows }

  const used = new Set<string>()
  const questions: FindQ[] = []
  while (questions.length < 4) {
    const ri = randInt(0, rows.length - 1)
    const ci = randInt(0, headers.length - 2)
    const key = `${ri}-${ci}`
    if (used.has(key)) continue
    used.add(key)
    questions.push({
      kind: 'find',
      table,
      question: `「${headers[ci + 1]}」对应的「${rows[ri].label}」数值是？`,
      answer: rows[ri].values[ci],
      ri,
      ci,
    })
  }
  return questions
}
