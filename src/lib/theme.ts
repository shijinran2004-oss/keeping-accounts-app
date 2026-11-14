import type { AccentKey, ThemeMode } from '../types'

/**
 * openGym 的主题系统（深/浅色 + 强调色预设）在本项目的轻量实现。
 * 只落三件事：把 data-theme / data-accent 写到 <html> 上、记住用户选择、跟随系统。
 */

export const THEME_OPTIONS: { key: ThemeMode; name: string }[] = [
  { key: 'dark', name: '深色' },
  { key: 'light', name: '浅色' },
  { key: 'system', name: '跟随系统' },
]

/** 色块用深色主题下的 Apple 系统色；主题 CSS 会按 data-theme 换浅色版本。 */
export const ACCENTS: { key: AccentKey; name: string; hex: string }[] = [
  { key: 'lime', name: '青柠', hex: '#30d158' },
  { key: 'sky', name: '天蓝', hex: '#0a84ff' },
  { key: 'orange', name: '橙色', hex: '#ff9f0a' },
  { key: 'violet', name: '紫罗兰', hex: '#bf5af2' },
  { key: 'pink', name: '粉色', hex: '#ff375f' },
  { key: 'red', name: '红色', hex: '#ff453a' },
  { key: 'teal', name: '青色', hex: '#40c8e0' },
  { key: 'gold', name: '金色', hex: '#ffd60a' },
]

export const THEME_KEYS = THEME_OPTIONS.map((t) => t.key)
export const ACCENT_KEYS = ACCENTS.map((a) => a.key)

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && (THEME_KEYS as string[]).includes(value)

export const isAccentKey = (value: unknown): value is AccentKey =>
  typeof value === 'string' && (ACCENT_KEYS as string[]).includes(value)

export const themeName = (mode: ThemeMode) =>
  THEME_OPTIONS.find((t) => t.key === mode)?.name ?? '深色'

export const accentName = (accent: AccentKey) =>
  ACCENTS.find((a) => a.key === accent)?.name ?? '青柠'

/** 当前实际生效的主题（system 时读系统偏好）。 */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * 把主题写到根元素；返回实际生效的深/浅色，方便原生状态栏跟着变。
 */
export function applyTheme(mode: ThemeMode, accent: AccentKey): 'dark' | 'light' {
  const theme = resolveTheme(mode)
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.accent = accent
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#F2F2F7' : '#000000')
  return theme
}

/** 首屏渲染前从本地存储恢复，避免先闪一下默认深色。 */
export function applyThemeFromStorage() {
  try {
    const raw = localStorage.getItem('shijinran.money.v1')
    const settings = raw ? (JSON.parse(raw)?.settings ?? {}) : {}
    const mode = settings.themeSet === true && isThemeMode(settings.theme) ? settings.theme : 'light'
    const accent = isAccentKey(settings.accent) ? settings.accent : 'lime'
    applyTheme(mode, accent)
  } catch {
    applyTheme('light', 'lime')
  }
}
