// ============================================================
// 自动备份模块
// 每次数据变化时自动保存快照到 localStorage
// 每天提醒用户导出备份文件
// ============================================================
import { exportAllData, importAllData } from './api'

const BACKUP_KEY = 'exam-prep-auto-backup'
const BACKUP_TIME_KEY = 'exam-prep-last-backup-time'
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000 // 24小时

/** 自动保存数据快照到 localStorage */
export async function autoBackup(): Promise<void> {
  try {
    const data = await exportAllData()
    const json = JSON.stringify(data)
    localStorage.setItem(BACKUP_KEY, json)
    localStorage.setItem(BACKUP_TIME_KEY, Date.now().toString())
  } catch (e) {
    console.error('Auto backup failed:', e)
  }
}

/** 获取上次自动备份的时间 */
export function getLastBackupTime(): Date | null {
  const ts = localStorage.getItem(BACKUP_TIME_KEY)
  if (!ts) return null
  return new Date(Number(ts))
}

/** 检查是否需要提醒用户导出备份（距离上次超过24小时） */
export function shouldRemindBackup(): boolean {
  const last = getLastBackupTime()
  if (!last) return true
  return Date.now() - last.getTime() > BACKUP_INTERVAL
}

/** 从 localStorage 恢复自动备份的数据 */
export async function restoreFromAutoBackup(): Promise<boolean> {
  const json = localStorage.getItem(BACKUP_KEY)
  if (!json) return false
  try {
    const data = JSON.parse(json)
    await importAllData(data)
    return true
  } catch {
    return false
  }
}

/** 检查是否有自动备份可用 */
export function hasAutoBackup(): boolean {
  return !!localStorage.getItem(BACKUP_KEY)
}
