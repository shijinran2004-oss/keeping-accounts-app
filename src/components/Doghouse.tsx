import type { DoghouseProps } from '../types'

/**
 * 首页表头的狗屋守卫。
 * 四套姿态与动画完全按参考稿的 SnoopyDoghouseSVG 复刻：
 * peaceful 屋顶睡觉、alert 坐起盯账、panic 余额告急、dance 点击彩蛋。
 */
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
        <ellipse cx="58" cy="102" rx="44" ry="4" fill="#E2E8F0" />

        {mood === 'peaceful' && (
          <g>
            <g className="dh-woodstock">
              <circle cx="44" cy="21" r="4.2" fill="#FBBF24" stroke="#1E293B" strokeWidth="2.6" />
              <path d="M42 16L44 13L46 16" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="43" y1="21" x2="45" y2="21" stroke="#1E293B" strokeWidth="1.8" strokeLinecap="round" />
            </g>
            <g className="dh-foot">
              <ellipse cx="30" cy="27" rx="3.8" ry="6.2" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" />
              <line x1="29" y1="24" x2="29" y2="26" stroke="#1E293B" strokeWidth="1.8" strokeLinecap="round" />
            </g>
            <g className="dh-breathe">
              <path d="M29 34C29 26 37 24 46 25C54 25.5 60 27 63 34H29Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
              <line x1="60" y1="26.5" x2="60" y2="34" stroke="#DC2626" strokeWidth="3.8" strokeLinecap="round" />
            </g>
            <path d="M60 24C60 16.5 69 14.5 76 16.5C83 18.5 87 22.5 87 28C87 32 82 34 74 34H60V24Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="87" cy="19.5" r="3.6" fill="#1E293B" />
            <path d="M71 21.5C72.8 23.5 75.5 23.5 77 21.5" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
            <g className="dh-ear">
              <path d="M66 26.5C63 26.5 61 31 63 35.5C65 39 71 39 73 34.5C74 31 70 26.5 66 26.5Z" fill="#1E293B" />
            </g>
          </g>
        )}

        {mood === 'alert' && (
          <g>
            <path className="dh-tail" d="M44 31C39 27 37 29 40 33" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" fill="#FFFFFF" />
            <path d="M44 34C44 21 57 21 59 34H44Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
            <path d="M45 27C48 27 49 30 46 32" fill="#1E293B" />
            <path d="M46 22H58" stroke="#DC2626" strokeWidth="3.8" strokeLinecap="round" />
            <g className="dh-look">
              <path d="M45 22C43 10 54 6 65 9C74 11 75 19 66 22H45Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
              <circle cx="73" cy="13" r="3.6" fill="#1E293B" />
              <g className="dh-blink">
                <circle cx="59" cy="14" r="2.2" fill="#1E293B" />
              </g>
              <path d="M56 9.5L62 10.5" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M49 14C44 16 44 26 50 26C55 26 54 17 49 14Z" fill="#1E293B" />
            </g>
            <g className="dh-woodstock">
              <circle cx="33" cy="29" r="4" fill="#FBBF24" stroke="#1E293B" strokeWidth="2.4" />
              <circle cx="34" cy="28.5" r="1" fill="#1E293B" />
            </g>
          </g>
        )}

        {mood === 'panic' && (
          <g>
            <path className="dh-sweat-drop dh-sweat-l" d="M35 12C32 14 34 18 37 15Z" fill="#38BDF8" />
            <path className="dh-sweat-drop dh-sweat-r" d="M80 10C83 12 81 16 78 13Z" fill="#38BDF8" />
            <path d="M45 34C44 20 58 20 59 34H45Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
            <path d="M46 22H58" stroke="#DC2626" strokeWidth="3.8" strokeLinecap="round" />
            <path d="M45 22C43 9 55 5 66 8C75 10 75 19 65 22H45Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="73" cy="12" r="3.6" fill="#1E293B" />
            <circle cx="59" cy="13.5" r="2.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.2" />
            <circle cx="59" cy="13.5" r="1" fill="#1E293B" />
            <g className="dh-panic-ear">
              <path d="M47 13C40 4 34 8 41 16C44 19 49 16 47 13Z" fill="#1E293B" />
            </g>
          </g>
        )}

        {mood === 'dance' && (
          <g className="dh-dance">
            <ellipse className="dh-dance-foot-l" cx="49" cy="32" rx="4.5" ry="2.6" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.8" />
            <ellipse className="dh-dance-foot-r" cx="61" cy="32" rx="4.5" ry="2.6" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.8" />
            <path d="M47 31C46 19 61 19 60 31H47Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
            <path d="M46 23L39 18" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 23L67 18" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
            <path d="M48 20H59" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M46 20C44 8 56 3 66 7C74 10 74 18 64 20H46Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="72" cy="9.5" r="3.5" fill="#1E293B" />
            <path d="M56 12C57.5 10 60 10 61.5 12" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M47 13C40 9 38 16 44 19C48 20 50 15 47 13Z" fill="#1E293B" />
          </g>
        )}

        <path d="M25 34H91L103 53H13L25 34Z" fill="#EF4444" stroke="#1E293B" strokeWidth="3.5" strokeLinejoin="round" />
        <line x1="20" y1="44" x2="96" y2="44" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="10" y="51" width="96" height="6.5" rx="3.2" fill="#DC2626" stroke="#1E293B" strokeWidth="3.5" />
        <rect x="23" y="57.5" width="70" height="42.5" fill="#DC2626" stroke="#1E293B" strokeWidth="3.5" strokeLinejoin="round" />
        <line x1="25" y1="71.5" x2="91" y2="71.5" stroke="#991B1B" strokeWidth="2.5" />
        <line x1="25" y1="85.5" x2="91" y2="85.5" stroke="#991B1B" strokeWidth="2.5" />
        <path d="M47 100V76C47 69.9249 51.9249 65 58 65C64.0751 65 69 69.9249 69 76V100H47Z" fill="#1E293B" />
      </svg>
    </div>
  )
}
