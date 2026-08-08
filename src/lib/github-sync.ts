// ============================================================
// GitHub 同步模块
// 通过 GitHub REST API 实现数据的一键上传/下载/智能合并
// ============================================================
import { exportAllData, importAllData } from './api'

const SYNC_FILE_PATH = 'data/sync-backup.json'
const CONFIG_KEY = 'github_sync_config'
const LAST_SYNC_KEY = 'github_last_sync_time'

export interface GitHubSyncConfig {
  token: string
  owner: string
  repo: string
}

export interface SyncResult {
  action: 'upload' | 'download' | 'merge' | 'nochange' | 'conflict'
  message: string
  details?: string
}

// ============================================================
// 配置管理
// ============================================================

export function getSyncConfig(): GitHubSyncConfig | null {
  const json = localStorage.getItem(CONFIG_KEY)
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function setSyncConfig(config: GitHubSyncConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function clearSyncConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
  localStorage.removeItem(LAST_SYNC_KEY)
}

export function getLastSyncTime(): Date | null {
  const ts = localStorage.getItem(LAST_SYNC_KEY)
  if (!ts) return null
  return new Date(Number(ts))
}

// ============================================================
// GitHub API 封装
// ============================================================

function githubApi(config: GitHubSyncConfig, path: string, options: RequestInit = {}) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/** 从 GitHub 仓库读取同步文件 */
async function fetchRemoteData(config: GitHubSyncConfig): Promise<{ data: Record<string, any[]> | null; sha: string | null }> {
  const resp = await githubApi(config, SYNC_FILE_PATH)
  if (resp.status === 404) {
    return { data: null, sha: null }
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`GitHub API 错误: ${err.message || resp.status}`)
  }
  const json = await resp.json()
  const sha = json.sha
  const content = JSON.parse(decodeURIComponent(escape(atob(json.content))))
  return { data: content, sha }
}

/** 上传数据到 GitHub 仓库 */
async function pushRemoteData(config: GitHubSyncConfig, data: Record<string, any[]>, sha: string | null): Promise<void> {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))))
  const body: any = {
    message: `数据同步 ${new Date().toISOString()}`,
    content,
  }
  if (sha) body.sha = sha

  const resp = await githubApi(config, SYNC_FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`上传失败: ${err.message || resp.status}`)
  }
}

// ============================================================
// 智能合并 — 按记录 ID 合并，不丢失任何设备的数据
// ============================================================

/**
 * 合并两份数据，以记录 ID 为唯一键：
 * - 同 ID 记录：取 updated_at 较新的那份
 * - 不同 ID 记录：全部保留
 * - 删除操作：不自动删除（保留所有记录，用户可手动清理）
 */
function mergeData(
  local: Record<string, any[]>,
  remote: Record<string, any[]>
): Record<string, any[]> {
  const result: Record<string, any[]> = {}
  const stores = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const store of stores) {
    const localRecords = local[store] || []
    const remoteRecords = remote[store] || []

    // 以 ID 为键建立 Map
    const merged = new Map<string, any>()

    // 先放入 remote 记录
    for (const r of remoteRecords) {
      merged.set(r.id, r)
    }

    // 再用 local 记录覆盖（取 updated_at 更新的）
    for (const r of localRecords) {
      const existing = merged.get(r.id)
      if (!existing) {
        merged.set(r.id, r)
      } else {
        // 比较 updated_at，取更新的
        const localTime = r.updated_at || r.created_at || ''
        const remoteTime = existing.updated_at || existing.created_at || ''
        if (localTime >= remoteTime) {
          merged.set(r.id, r)
        }
      }
    }

    result[store] = Array.from(merged.values())
  }

  return result
}

/** 计算本地和远程数据的差异摘要 */
function diffSummary(local: Record<string, any[]>, remote: Record<string, any[]>): string {
  const stores = new Set([...Object.keys(local), ...Object.keys(remote)])
  const localIds = new Map<string, Set<string>>()
  const remoteIds = new Map<string, Set<string>>()

  for (const store of stores) {
    localIds.set(store, new Set((local[store] || []).map(r => r.id)))
    remoteIds.set(store, new Set((remote[store] || []).map(r => r.id)))
  }

  let localOnly = 0
  let remoteOnly = 0
  let common = 0

  for (const store of stores) {
    const lIds = localIds.get(store)!
    const rIds = remoteIds.get(store)!
    for (const id of lIds) {
      if (rIds.has(id)) common++
      else localOnly++
    }
    for (const id of rIds) {
      if (!lIds.has(id)) remoteOnly++
    }
  }

  return `本地新增 ${localOnly} 条，远程新增 ${remoteOnly} 条，共同 ${common} 条`
}

// ============================================================
// 对外接口
// ============================================================

/** 验证 GitHub 配置是否有效 */
export async function verifyConfig(config: GitHubSyncConfig): Promise<boolean> {
  try {
    const resp = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
      },
    })
    return resp.ok
  } catch {
    return false
  }
}

/** 一键同步：自动判断上传/下载/合并 */
export async function syncData(): Promise<SyncResult> {
  const config = getSyncConfig()
  if (!config) {
    return { action: 'conflict', message: '请先配置 GitHub 同步' }
  }

  try {
    const localData = await exportAllData()
    const { data: remoteData, sha } = await fetchRemoteData(config)

    if (!remoteData) {
      // 远程没有数据，直接上传
      await pushRemoteData(config, localData, sha)
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString())
      return { action: 'upload', message: '首次上传完成，远程仓库已创建数据文件' }
    }

    // 检查是否有差异
    const summary = diffSummary(localData, remoteData)
    const localJson = JSON.stringify(localData)
    const remoteJson = JSON.stringify(remoteData)

    if (localJson === remoteJson) {
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString())
      return { action: 'nochange', message: '本地和远程数据一致，无需同步' }
    }

    // 智能合并
    const merged = mergeData(localData, remoteData)

    // 写入本地
    await importAllData(merged)

    // 上传合并后的数据到远程
    await pushRemoteData(config, merged, sha)

    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString())
    return {
      action: 'merge',
      message: '同步完成，已合并本地和远程数据',
      details: summary,
    }
  } catch (e: any) {
    return { action: 'conflict', message: e.message || '同步失败' }
  }
}

/** 强制上传（覆盖远程） */
export async function forceUpload(): Promise<SyncResult> {
  const config = getSyncConfig()
  if (!config) {
    return { action: 'conflict', message: '请先配置 GitHub 同步' }
  }

  try {
    const localData = await exportAllData()
    const { sha } = await fetchRemoteData(config)
    await pushRemoteData(config, localData, sha)
    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString())
    return { action: 'upload', message: '已强制上传本地数据到 GitHub' }
  } catch (e: any) {
    return { action: 'conflict', message: e.message || '上传失败' }
  }
}

/** 强制下载（覆盖本地） */
export async function forceDownload(): Promise<SyncResult> {
  const config = getSyncConfig()
  if (!config) {
    return { action: 'conflict', message: '请先配置 GitHub 同步' }
  }

  try {
    const { data: remoteData } = await fetchRemoteData(config)
    if (!remoteData) {
      return { action: 'conflict', message: '远程仓库暂无数据' }
    }
    await importAllData(remoteData)
    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString())
    return { action: 'download', message: '已从 GitHub 下载并覆盖本地数据' }
  } catch (e: any) {
    return { action: 'conflict', message: e.message || '下载失败' }
  }
}
