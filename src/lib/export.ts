// ============================================================
// 数据导出工具（JSON / CSV）
// 用于月计划、错题本、题库等页面的导出功能
// ============================================================

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 导出为 JSON 文件 */
export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  triggerDownload(blob, filename)
}

/** CSV 单元格转义（处理逗号、引号、换行） */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** 导出为 CSV 文件（带 BOM，避免 Excel 中文乱码） */
export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  triggerDownload(blob, filename)
}
