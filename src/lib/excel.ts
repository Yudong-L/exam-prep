import * as XLSX from 'xlsx'

export interface ParsedExcel {
  headers: string[]
  rows: Record<string, any>[]
}

/** 解析 Excel/CSV 文件为行数据 */
export async function parseExcelFile(file: File): Promise<ParsedExcel> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', codepage: 65001 })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet) return { headers: [], rows: [] }
  const ws = wb.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
    defval: '',
    raw: false,
  })
  const headers = rows.length ? Object.keys(rows[0]) : []
  return { headers, rows }
}

/** 将数组导出为 Excel 并触发下载（用于导出模板） */
export function exportTemplate(rows: Record<string, any>[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'template')
  XLSX.writeFile(wb, fileName)
}
