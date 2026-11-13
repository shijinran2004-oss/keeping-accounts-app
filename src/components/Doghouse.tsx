import type { DoghouseProps, DogMood } from '../types'

/**
 * 手绘狗屋 + 屋顶小狗。
 * SVG 路径与配色按参考稿逐条复刻：peaceful（<50%）、alert（50–85%）、panic（>85%）。
 */
export function Doghouse({ mood = 'peaceful', className = '' }: DoghouseProps) {
  const state: DogMood = mood

  return (
    <div className={`dh is-${state} ${className}`.trim()} aria-hidden="true">
      {state === 'peaceful' && (
        <div className="dh-zzz">
          <span>z</span>
          <span>Z</span>
          <span>Z</span>
        </div>
      )}
      {state === 'alert' && <div className="dh-alert">!?</div>}
      {state === 'panic' && (
        <div className="dh-panic">
          <span className="dh-sos">SOS</span>
          <span className="dh-sweat">💦</span>
        </div>
      )}

      <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="dh-svg">
        <ellipse cx="56" cy="95" rx="46" ry="4" fill="#E2E8F0" />

        <path
          d="M22 52H90V94H22V52Z"
          fill="#DC2626"
          stroke="#1E293B"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <line x1="22" y1="66" x2="90" y2="66" stroke="#B91C1C" strokeWidth="2" />
        <line x1="22" y1="80" x2="90" y2="80" stroke="#B91C1C" strokeWidth="2" />

        <path
          d="M45 94V72C45 65.9249 49.9249 61 56 61C62.0751 61 67 65.9249 67 72V94H45Z"
          fill="#1E293B"
        />

        <path
          d="M10 54L30 30H82L102 54H10Z"
          fill="#EF4444"
          stroke="#1E293B"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M18 44H94" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" />
        <rect
          x="8"
          y="51"
          width="96"
          height="6"
          rx="3"
          fill="#B91C1C"
          stroke="#1E293B"
          strokeWidth="3"
        />

        {state === 'peaceful' && (
          <g>
            <path d="M27 27C23 24 21 27 24 30" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" fill="#FFFFFF" />
            <ellipse
              cx="29"
              cy="26"
              rx="3.5"
              ry="6"
              transform="rotate(-12 29 26)"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
            />
            <path
              d="M31 30C34 19 49 19 55 28L31 30Z"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <path d="M54 24L56 30" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />
            <path
              d="M55 28C55 15 69 11 77 16C84 20 85 28 77 30L55 28Z"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <circle cx="82" cy="18" r="3.5" fill="#1E293B" />
            <path d="M67 19C69 21 72 21 73 19" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M62 24C58 24 56 33 62 35C67 36 69 28 65 24" fill="#1E293B" />
            <circle cx="43" cy="19" r="3.5" fill="#F59E0B" stroke="#1E293B" strokeWidth="2" />
            <path d="M41 15L43 12L45 15" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {state === 'alert' && (
          <g>
            <path
              d="M44 30C44 18 57 18 59 30H44Z"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <path d="M45 24C48 24 49 27 46 29" fill="#1E293B" />
            <path d="M46 19H57" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />
            <path
              d="M45 19C43 8 54 4 64 7C73 9 74 17 65 19H45Z"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <circle cx="72" cy="11" r="3.5" fill="#1E293B" />
            <circle cx="58" cy="11" r="2" fill="#1E293B" />
            <path d="M55 7L61 8" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
            <path d="M48 12C43 14 43 24 49 24C54 24 53 15 48 12Z" fill="#1E293B" />
          </g>
        )}

        {state === 'panic' && (
          <g>
            <path
              d="M45 30C44 17 58 17 59 30H45Z"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <path d="M46 19H58" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />
            <path
              d="M45 19C43 7 55 3 65 6C74 8 74 17 64 19H45Z"
              fill="#FFFFFF"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <circle cx="72" cy="10" r="3.5" fill="#1E293B" />
            <circle cx="58" cy="11" r="2.5" fill="#1E293B" />
            <circle cx="58" cy="11" r="1" fill="#FFFFFF" />
            <path d="M46 10C40 2 35 5 41 13C44 16 48 13 46 10Z" fill="#1E293B" />
            <path d="M36 9C34 11 36 14 38 11Z" fill="#38BDF8" />
            <path d="M77 5C79 7 77 10 75 7Z" fill="#38BDF8" />
          </g>
        )}
      </svg>
    </div>
  )
}
