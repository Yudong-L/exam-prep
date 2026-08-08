/**
 * 将用户选择的图片文件统一转成 PNG data URL。
 * 目的：
 * 1. 兼容视觉模型（通义千问 qwen-vl 系列对图片格式/编码较敏感，统一 PNG 最稳妥）；
 * 2. 控制尺寸（最长边 1600px），避免超大 base64 导致请求失败或识别变慢。
 * 若浏览器不支持 canvas 处理，则回退到原始 data URL。
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        try {
          const maxDim = 1600
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(dataUrl)
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/png'))
        } catch {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
