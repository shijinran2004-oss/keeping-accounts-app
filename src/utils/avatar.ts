/**
 * 头像处理：把相册里选的原图压成 384×384 的 JPEG data URL。
 * 用 data URL 而不是文件路径，是为了让头像跟着账本一起存在 localStorage 里。
 */
const AVATAR_SIZE = 384
const MAX_FILE_BYTES = 12 * 1024 * 1024

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  if (file.size > MAX_FILE_BYTES) throw new Error('image too large')

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')

    const scale = Math.max(AVATAR_SIZE / img.naturalWidth, AVATAR_SIZE / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale

    // 透明 PNG 铺在面板色上，避免转 JPEG 后发黑
    ctx.fillStyle = '#1c1c1e'
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h)

    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}
