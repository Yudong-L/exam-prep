// ============================================================
// AI 服务 — 前端直接调用「OpenAI 兼容」接口
// 支持 通义千问(DashScope) / DeepSeek / OpenAI 三家，可随时切换
// 适用于纯静态托管（GitHub Pages），无需后端
//
// 隐私设计：API Key 由用户本人在「设置 → AI」中填写，仅保存在本机浏览器
// （localStorage）。代码仓库里不含任何密钥，公开也安全。
// AI 功能另设解锁密码（990528），用于临时离开设备时上锁。
// ============================================================

const AI_PASSWORD = '990528'
const PASSWORD_KEY = 'ai_access_granted'

/** 当前选中的 AI 服务商 */
export type AiProvider = 'dashscope' | 'deepseek' | 'nvidia'

export const AI_PROVIDERS: AiProvider[] = ['dashscope', 'deepseek', 'nvidia']

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  dashscope: '通义千问',
  deepseek: 'DeepSeek',
  nvidia: '英伟达 NIM',
}

/** 各服务商的接口配置（均为 OpenAI 兼容的 /chat/completions 格式） */
interface ProviderConfig {
  label: string
  baseURL: string
  /** 默认文本模型 */
  defaultTextModel: string
  /** 默认视觉模型；undefined 表示该服务商不支持图片识别 */
  defaultVisionModel?: string
  /** 申请 API Key 的官方地址 */
  signup: string
}

const PROVIDERS: Record<AiProvider, ProviderConfig> = {
  dashscope: {
    label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultTextModel: 'qwen-plus',
    defaultVisionModel: 'qwen-vl-max',
    signup: 'https://dashscope.console.aliyun.com/apiKey',
  },
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1/chat/completions',
    defaultTextModel: 'deepseek-chat',
    signup: 'https://platform.deepseek.com/api_keys',
  },
  nvidia: {
    label: '英伟达 NIM',
    baseURL: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultTextModel: 'nvidia/nvidia-nemotron-nano-9b-v2',
    defaultVisionModel: 'meta/llama-3.2-11b-vision-instruct',
    signup: 'https://build.nvidia.com/',
  },
}

export const PROVIDER_SIGNUP: Record<AiProvider, string> = {
  dashscope: PROVIDERS.dashscope.signup,
  deepseek: PROVIDERS.deepseek.signup,
  nvidia: PROVIDERS.nvidia.signup,
}

// ============================================================
// 服务商 / 密钥 / 模型 的本地存储
// ============================================================

const PROVIDER_KEY = 'ai_provider'
// 通义千问沿用历史存储键，保证老用户已填的密钥不丢失；其余服务商用 ai_key_xxx
function keyStorageFor(p: AiProvider): string {
  return p === 'dashscope' ? 'dashscope_api_key' : `ai_key_${p}`
}
function modelStorageFor(p: AiProvider): string {
  return `ai_model_${p}`
}

export function getAiProvider(): AiProvider {
  const v = localStorage.getItem(PROVIDER_KEY)
  return (PROVIDERS as Record<string, ProviderConfig>)[v ?? ''] ? (v as AiProvider) : 'dashscope'
}
export function setAiProvider(p: AiProvider): void {
  localStorage.setItem(PROVIDER_KEY, p)
}

export function getApiKeyForProvider(p: AiProvider): string | null {
  return localStorage.getItem(keyStorageFor(p))
}
export function setApiKeyForProvider(p: AiProvider, key: string): void {
  localStorage.setItem(keyStorageFor(p), key.trim())
}
export function clearApiKeyForProvider(p: AiProvider): void {
  localStorage.removeItem(keyStorageFor(p))
}

export function getModelForProvider(p: AiProvider): string | null {
  return localStorage.getItem(modelStorageFor(p))
}
export function setModelForProvider(p: AiProvider, model: string): void {
  const m = model.trim()
  if (m) localStorage.setItem(modelStorageFor(p), m)
  else localStorage.removeItem(modelStorageFor(p))
}

export function getProviderDefaultModel(p: AiProvider): string {
  return PROVIDERS[p].defaultTextModel
}
export function providerSupportsVision(p: AiProvider): boolean {
  return !!PROVIDERS[p].defaultVisionModel
}

// —— 以下旧接口保持可用，语义改为「当前服务商」的密钥，供表单守卫复用 ——
export function getAiApiKey(): string | null {
  return getApiKeyForProvider(getAiProvider())
}
export function setAiApiKey(key: string): void {
  setApiKeyForProvider(getAiProvider(), key)
}
export function hasAiApiKey(): boolean {
  return !!getAiApiKey()
}
export function clearAiApiKey(): void {
  clearApiKeyForProvider(getAiProvider())
}

/** 验证 AI 功能密码 */
export function verifyAiPassword(input: string): boolean {
  if (input === AI_PASSWORD) {
    localStorage.setItem(PASSWORD_KEY, 'true')
    return true
  }
  return false
}

/** 检查是否已获得 AI 访问权限 */
export function hasAiAccess(): boolean {
  return localStorage.getItem(PASSWORD_KEY) === 'true'
}

/** 清除 AI 访问权限 */
export function clearAiAccess(): void {
  localStorage.removeItem(PASSWORD_KEY)
}

// ============================================================
// 通用 OpenAI 兼容调用封装
// ============================================================

async function callChat(
  messages: any[],
  opts: { temperature?: number; max_tokens?: number; vision?: boolean; model?: string } = {},
): Promise<string> {
  const provider = getAiProvider()
  const cfg = PROVIDERS[provider]
  const apiKey = getApiKeyForProvider(provider)

  if (!apiKey) {
    throw new Error(`请先在「设置 → AI」中填写你的 ${cfg.label} API Key`)
  }

  // 解析最终使用的模型
  let model: string
  if (opts.model) {
    model = opts.model
  } else if (opts.vision) {
    if (!cfg.defaultVisionModel) {
      throw new Error(
        `${cfg.label} 暂不支持图片识别。请改用「通义千问」或「OpenAI」，或在设置里切换到支持图片的服务商后再上传题目图片。`,
      )
    }
    // 视觉请求始终使用服务商默认视觉模型，确保图片能力可用
    model = cfg.defaultVisionModel
  } else {
    // 文本请求：优先使用用户自定义的模型名，否则用默认
    model = getModelForProvider(provider) || cfg.defaultTextModel
  }

  const resp = await fetch(cfg.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens ?? 1500,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`AI 服务错误 ${resp.status}${errText ? '：' + errText.slice(0, 200) : ''}`)
  }

  const json: any = await resp.json()
  return json?.choices?.[0]?.message?.content || ''
}

/** 解析模型返回的 JSON（兼容 markdown 代码块包裹） */
function parseJsonContent(content: string): any {
  let cleaned = content.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  return JSON.parse(cleaned)
}

/** 将 base64 或完整 data URL 统一成可被视觉模型识别的 data URL（保留原始图片格式，提升识别准确率） */
function toImageUrl(input?: string): string | undefined {
  if (!input) return undefined
  return input.startsWith('data:') ? input : `data:image/png;base64,${input}`
}

// ============================================================
// 批改 prompt 构建（移植自后端）
// ============================================================

const MODULE_LABELS: Record<string, string> = {
  言语理解: '文段结构',
  言语逻辑填空: '语境分析',
  图形推理: '图形特征与规律',
  逻辑判断论证: '论点·论据',
  资料分析: '公式与计算步骤',
  数量关系: '公式与解题思路',
  常识判断: '知识判断',
  定义判断: '关键要件匹配',
  类比推理: '词语逻辑关系',
  政治理论: '理论要点',
  申论: '作答要点与结构',
}

function buildPrompt(data: {
  module_type: string
  question_content?: string
  points?: string
  arguments?: string
  text_structure?: string
  formula?: string
  prediction_direction?: string
  user_answer: string
  image_base64?: string
  reference_answer?: string
}): string {
  const {
    module_type,
    question_content,
    user_answer,
    prediction_direction,
    image_base64,
    reference_answer,
  } = data

  const fieldLabel = MODULE_LABELS[module_type] || '作答要点'

  let extraContext = ''
  if (data.points) extraContext += `\n【论点】${data.points}`
  if (data.arguments) extraContext += `\n【论据】${data.arguments}`
  if (data.text_structure) extraContext += `\n【文段结构】${data.text_structure}`
  if (data.formula) extraContext += `\n【公式/计算步骤】${data.formula}`
  if (prediction_direction) extraContext += `\n【预判方向】${prediction_direction}`

  let referenceContext = ''
  if (reference_answer && reference_answer.trim().length > 0) {
    referenceContext = `\n【参考答案】${reference_answer}`
  }

  const hasImage = !!image_base64
  const hasTextQuestion = !!question_content && question_content.trim().length > 0

  let prompt = `你是省考行测/申论专业批改老师。请批改以下${module_type}题目。

【模块】${module_type}`

  if (hasImage && !hasTextQuestion) {
    prompt += `
【题干】题目图片已随消息一并提供，请先仔细查看图片内容，再结合图片进行批改。`
  } else {
    prompt += `
【题干】${question_content}`
  }

  if (hasImage) {
    prompt += `
（本题附有一张题目图片，请务必先查看并理解图片内容后再批改。请先逐字、完整地转写图片中的题干、所有选项、图表数据与数字，确认题目信息无误后再评分，不要凭空猜测图片中看不清的内容。）`
  }

  prompt += `${extraContext}${referenceContext}
【我的答案】${user_answer}

请按以下格式返回 JSON：
{
  "ai_result": "一句话判定（如：思路正确但细节有误 / 完全正确 / 方向偏差较大）",
  "ai_analysis": "详细分析：①${fieldLabel}是否准确 ②答案逻辑是否正确 ③具体改进建议（2-3条）",
  "score": 0-100的整数分数,
  "is_correct": true或false
}

批改标准：
- 言语类：重点看文段结构分析是否准确，中心句定位是否正确
- 逻辑判断：重点看论点论据是否匹配，推理链条是否完整
- 资料分析/数量关系：重点看公式运用和计算步骤是否正确
- 图形推理：重点看图形特征识别和规律推断
- 定义判断：重点看关键要件是否逐一比对
- 申论：重点看作答要点覆盖度和逻辑结构

只返回JSON，不要加其他文字。`

  return prompt
}

// ============================================================
// 对外接口
// ============================================================

export interface GradingInput {
  module_type: string
  question_content: string
  points?: string
  arguments?: string
  text_structure?: string
  formula?: string
  prediction_direction?: string
  user_answer: string
  image_base64?: string
  reference_answer?: string
}

export interface GradingResult {
  ai_result: string
  ai_analysis: string
  score: number
  is_correct: boolean
  detailed_feedback?: string
}

export async function submitGrading(data: GradingInput): Promise<GradingResult> {
  if (!hasAiAccess()) {
    throw new Error('请先输入密码解锁 AI 功能')
  }

  const prompt = buildPrompt(data)
  const imgUrl = toImageUrl(data.image_base64)
  const messages: any[] = []

  if (imgUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imgUrl } },
        { type: 'text', text: prompt },
      ],
    })
  } else {
    messages.push({ role: 'user', content: prompt })
  }

  const content = await callChat(messages, {
    temperature: imgUrl ? 0.2 : 0.3,
    max_tokens: 1500,
    vision: !!imgUrl,
  })

  try {
    const parsed = parseJsonContent(content)
    return {
      ai_result: parsed.ai_result || '批改完成',
      ai_analysis: parsed.ai_analysis || content,
      score: typeof parsed.score === 'number' ? parsed.score : 70,
      is_correct: !!parsed.is_correct,
      detailed_feedback: parsed.detailed_feedback,
    }
  } catch {
    return {
      ai_result: '批改完成（格式异常）',
      ai_analysis: content,
      score: 70,
      is_correct: true,
    }
  }
}

/** AI 批改对话（支持图片追问，自动切换视觉模型） */
export async function aiGradingChat(
  history: { role: 'user' | 'assistant'; content: string }[],
  moduleType?: string,
  imageBase64?: string,
): Promise<string> {
  if (!hasAiAccess()) {
    throw new Error('请先输入密码解锁 AI 功能')
  }

  const systemMsg = {
    role: 'system',
    content: `你是一位专业的省考辅导老师，正在批改一道${moduleType || '行测'}题目。请针对学生的追问给出专业、具体的回答。如果学生质疑评分，请重新评估并给出修改后的评分。${imageBase64 ? '本题附有一张题目图片，请结合图片内容回答。' : ''}`,
  }

  const messages: any[] = [systemMsg, ...history.map((m) => ({ role: m.role, content: m.content }))]

  // 若存在题目图片，附在最后一条 user 消息上（支持对话中随时上传追问）
  const imgUrl = toImageUrl(imageBase64)
  if (imgUrl) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const text = typeof messages[i].content === 'string' ? messages[i].content : '请看这张题目图片'
        messages[i] = {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imgUrl } },
            { type: 'text', text },
          ],
        }
        break
      }
    }
  }

  return callChat(messages, {
    temperature: imgUrl ? 0.3 : 0.5,
    max_tokens: 1500,
    vision: !!imgUrl,
  })
}

/** 通用备考教练对话（用于制定计划 / 周复盘等） */
export async function aiCoachChat(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
): Promise<string> {
  if (!hasAiAccess()) {
    throw new Error('请先输入密码解锁 AI 功能')
  }

  const systemMsg = {
    role: 'system' as const,
    content:
      '你是一位专业的省考备考规划教练，熟悉行测各模块（言语、判断、资料、数量、常识、申论）。请基于学生的实际情况给出可执行的建议，并以 JSON 格式返回。',
  }

  const payload = [systemMsg, ...messages.map((m) => ({ role: m.role, content: m.content }))]
  return callChat(payload, { temperature: 0.6, max_tokens: 2000 })
}

/** AI 复盘（多轮对话，可纠正偏差；支持上传图片辅助复盘） */
export async function aiReviewChat(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  imageBase64?: string,
): Promise<{
  reply: string
  summary: string
  key_points: string[]
  analysis: string
  score: number
}> {
  if (!hasAiAccess()) {
    throw new Error('请先输入密码解锁 AI 功能')
  }

  const systemMsg = {
    role: 'system' as const,
    content: `你是一位省考备考教练。请根据学生的描述与后续对话，给出专业复盘建议。
如果学生提出纠正或补充，请在建议中体现修正后的结论。${imageBase64 ? '学生上传了一张图片（如笔记、错题、答题卡等），请结合图片内容一起复盘。' : ''}

请按以下JSON格式回复：
{
  "summary": "一句话总结（如：整体进度良好但逻辑判断需加强）",
  "key_points": ["要点1", "要点2", "要点3"],
  "analysis": "详细复盘分析（200字以内）：①做得好的地方 ②需要改进的地方 ③具体建议",
  "score": 1-10的整数（对本次学习状态的综合评分）
}

只返回JSON，不要加其他文字。`,
  }

  const payload: any[] = [systemMsg, ...messages.map((m) => ({ role: m.role, content: m.content }))]

  // 若上传了图片，附在最后一条 user 消息上（自动切换视觉模型）
  const imgUrl = toImageUrl(imageBase64)
  if (imgUrl) {
    for (let i = payload.length - 1; i >= 0; i--) {
      if (payload[i].role === 'user') {
        const text = typeof payload[i].content === 'string' ? payload[i].content : '请看这张图片'
        payload[i] = {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imgUrl } },
            { type: 'text', text },
          ],
        }
        break
      }
    }
  }

  const replyText = await callChat(payload, {
    temperature: imgUrl ? 0.4 : 0.5,
    max_tokens: 1000,
    vision: !!imgUrl,
  })

  try {
    const parsed = parseJsonContent(replyText)
    return {
      reply: parsed.analysis || replyText,
      summary: parsed.summary || '复盘建议',
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      analysis: parsed.analysis || replyText,
      score: typeof parsed.score === 'number' ? parsed.score : 5,
    }
  } catch {
    return {
      reply: replyText,
      summary: '复盘建议',
      key_points: ['请查看详细分析'],
      analysis: replyText,
      score: 5,
    }
  }
}

/** AI 错题整理对话（用于对话式制题 / 错题复盘） */
export async function aiMistakeChat(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  mode: 'create' | 'review' = 'create',
  imageBase64?: string,
): Promise<string> {
  if (!hasAiAccess()) {
    throw new Error('请先输入密码解锁 AI 功能')
  }

  const systemContent =
    mode === 'create'
      ? `你是一位省考错题整理老师。请像真人老师一样，用自然、口语化的中文和学生对话，帮助他把做错的题梳理清楚。

要求：
- 先理解学生描述的错题，必要时追问：属于哪个模块、错在哪里、正确答案是什么、为什么错。
- 用正常的聊天语气回复，不要输出 JSON，不要使用代码块，不要出现 \\u 这类转义字符。
- 只有当学生明确说“整理成错题”或“生成错题”时，你才需要返回结构化 JSON 数组；正常情况下请保持自然对话。
- 当学生要求整理成错题时，返回的 JSON 数组每一项包含以下字段：module_type（模块名）、material（材料，可空字符串）、question_content（题干）、options（选项数组，可空）、answer（答案，可空）、error_reasons（错误原因数组）、analysis（解析，可空）、key_points（关键要点，必填，1-3 条核心总结）。
- 如果学生发来的内容本身就是一段结构化 JSON 错题，请先友好地确认，再继续对话。
- 如果学生上传了题目图片，请先逐字、完整地转写图片中的题干、选项与数字，确认题目信息后再进行整理或对话。`
      : `你是一位省考备考教练。请根据学生选定的一道或一类错题，进行针对性复盘指导，
指出这类题的易错点、改进方法和后续练习建议。用专业、具体、可执行的口吻回答。`

  const systemMsg = { role: 'system' as const, content: systemContent }
  const payload: any[] = [systemMsg, ...messages.map((m) => ({ role: m.role, content: m.content }))]

  const imgUrl = toImageUrl(imageBase64)
  if (imgUrl) {
    for (let i = payload.length - 1; i >= 0; i--) {
      if (payload[i].role === 'user') {
        const text = typeof payload[i].content === 'string' ? payload[i].content : '请看这张题目图片'
        payload[i] = {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imgUrl } },
            { type: 'text', text },
          ],
        }
        break
      }
    }
  }

  return callChat(payload, { temperature: imgUrl ? 0.3 : 0.6, max_tokens: 1800, vision: !!imgUrl })
}
