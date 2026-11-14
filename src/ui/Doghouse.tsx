import type { DoghouseProps } from '../types'
import roofSnoopy from '../assets/roof-snoopy.png'

/**
 * 首页表头的狗屋：史努比躺在屋顶上睡觉（原画贴纸，位图保证形态一致）。
 * 四种 mood 共用同一张贴纸，只用动效与徽标区分：睡觉、盯账、报警、跳舞。
 * 纯展示组件，预算比例由 Home 算好传入；点击只是彩蛋，不修改数据。
 */
const SNOOPY = { x: 23, y: -0.3, width: 65.6, height: 53.4 }

export function Doghouse({ mood = 'peaceful', className = '', onClick }: DoghouseProps) {
  const cls = ['dh', `dh-${mood}`, className].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? '让小狗跳个舞' : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {mood === 'peaceful' && (
        <div className="dh-zzz-bubbles" aria-hidden="true">
          <span>z</span>
          <span>Z</span>
          <span>Z</span>
        </div>
      )}
      {mood === 'alert' && <div className="dh-alert-badge" aria-hidden="true">!?</div>}
      {mood === 'panic' && <div className="dh-sos-badge" aria-hidden="true">SOS!</div>}
      {mood === 'dance' && (
        <div className="dh-notes" aria-hidden="true">
          <span>♪</span>
          <span>♫</span>
        </div>
      )}

      <svg viewBox="0 0 120 108" fill="none" xmlns="http://www.w3.org/2000/svg" className="dh-svg">
        <ellipse className="dh-ground" cx="58" cy="102" rx="44" ry="4" fill="#E2E8F0" />

        {mood === 'panic' && (
          <g>
            <path className="dh-sweat-drop dh-sweat-l" d="M35 12C32 14 34 18 37 15Z" fill="#38BDF8" />
            <path className="dh-sweat-drop dh-sweat-r" d="M80 10C83 12 81 16 78 13Z" fill="#38BDF8" />
          </g>
        )}

        <path d="M25 34H91L103 53H13L25 34Z" fill="#EF4444" stroke="#1E293B" strokeWidth="3.5" strokeLinejoin="round" />
        <line x1="20" y1="44" x2="96" y2="44" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="10" y="51" width="96" height="6.5" rx="3.2" fill="#DC2626" stroke="#1E293B" strokeWidth="3.5" />
        <rect x="23" y="57.5" width="70" height="42.5" fill="#DC2626" stroke="#1E293B" strokeWidth="3.5" strokeLinejoin="round" />
        <line x1="25" y1="71.5" x2="91" y2="71.5" stroke="#991B1B" strokeWidth="2.5" />
        <line x1="25" y1="85.5" x2="91" y2="85.5" stroke="#991B1B" strokeWidth="2.5" />
        <path d="M47 100V76C47 69.9249 51.9249 65 58 65C64.0751 65 69 69.9249 69 76V100H47Z" fill="#1E293B" />

        {mood === 'peaceful' && (
          <g className="dh-breathe">
            <image href={roofSnoopy} {...SNOOPY} preserveAspectRatio="none" />
          </g>
        )}

        {mood === 'alert' && (
          <g className="dh-look">
            <image href={roofSnoopy} {...SNOOPY} y={-1.2} preserveAspectRatio="none" />
          </g>
        )}

        {mood === 'panic' && (
          <g>
            <image href={roofSnoopy} {...SNOOPY} y={-1} preserveAspectRatio="none" />
          </g>
        )}

        {mood === 'dance' && (
          <g className="dh-dance">
            <image href={roofSnoopy} {...SNOOPY} y={-0.4} preserveAspectRatio="none" />
          </g>
        )}
      </svg>
    </div>
  )
}
