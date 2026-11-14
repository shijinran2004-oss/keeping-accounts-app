/**
 * 把相册/相机拿到的图片压到 OCR 合适的尺寸，再转成 dataURL。
 * 1600px 长边是准确率与内存的折中：再大收益很小，再小小票的小字会糊。
 */
export const OCR_MAX_SIDE = 1600

export async function fileToOcrDataUrl(file: File, maxSide: number = OCR_MAX_SIDE): Promise<string> {
  const bitmap = await loadBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('这台设备不支持图片处理')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.92)
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()
  }
}

type DrawableBitmap = ImageBitmap | HTMLImageElement

async function loadBitmap(file: File): Promise<DrawableBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('图片打不开，换一张试试'))
        img.src = url
      })
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}
