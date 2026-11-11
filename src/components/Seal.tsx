import mascotHead from '../assets/mascot-head.png'
import type { SealProps } from '../types'

/**
 * 品牌印章：纸色小卡片里放那只抱花的小狗，外面一圈朱砂细线。
 * 图形在 CSS 里放大裁切（见 .seal img），尺寸只需决定卡片大小。
 */
export function Seal({ size = 'sm', className = '' }: SealProps) {
  return (
    <span className={`seal ${size === 'sm' ? '' : size} ${className}`.trim()} aria-hidden="true">
      <img src={mascotHead} alt="" draggable={false} />
    </span>
  )
}
