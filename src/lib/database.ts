// ============================================================
// 本地用户标识 (Local User Identity)
//
// 原方案依赖 CloudBase 前端 SDK 的匿名登录来获取 user_id，
// 但本环境未下发 publish key，SDK 无法鉴权。
// 改为使用固定用户 ID，确保跨设备数据一致（个人备考应用）。
// 数据仍存于 TCB PostgreSQL（跨设备同步）。
// ============================================================

// 固定用户 ID —— 个人备考应用，所有设备共享同一份数据
const FIXED_USER_ID = 'exam-prep-user'

let cachedUserId: string | null = null

/** 获取用户 ID（固定值，确保跨设备同步） */
export function getUserId(): string {
  if (cachedUserId) return cachedUserId
  cachedUserId = FIXED_USER_ID
  return cachedUserId
}

/** 兼容旧调用：异步返回用户对象 */
export async function ensureLogin(): Promise<{ uid: string } | null> {
  return { uid: getUserId() }
}

export default { getUserId, ensureLogin }
