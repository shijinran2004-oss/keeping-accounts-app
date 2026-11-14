import mascot from '../assets/mascot.png'
import type { SealProps } from '../types'

/**
 * 品牌印章：纸色小卡片里放那只抱花的小狗，外面一圈朱砂细线。
 * 图形与桌面图标同一套构图（整张贴纸，不裁头也不切花），尺寸只需决定卡片大小。
 */
export function Seal({ size = 'sm', className = '' }: SealProps) {
  return (
    <span className={`seal ${size === 'sm' ? '' : size} ${className}`.trim()} aria-hidden="true">
      <img src={mascot} alt="" draggable={false} />
    </span>
  )
}
