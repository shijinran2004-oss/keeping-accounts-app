import type { Category } from '../types'

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: '餐饮', icon: 'utensils', color: '#C2563B', type: 'expense', builtin: true },
  { id: 'transport', name: '交通', icon: 'bus', color: '#4F6B78', type: 'expense', builtin: true },
  { id: 'shopping', name: '购物', icon: 'bag', color: '#B0804C', type: 'expense', builtin: true },
  { id: 'home', name: '居住', icon: 'house', color: '#6E7B5B', type: 'expense', builtin: true },
  { id: 'fun', name: '娱乐', icon: 'gamepad', color: '#8B6A8C', type: 'expense', builtin: true },
  { id: 'health', name: '医疗', icon: 'heart', color: '#A85B5B', type: 'expense', builtin: true },
  { id: 'study', name: '学习', icon: 'book', color: '#5E7396', type: 'expense', builtin: true },
  { id: 'social', name: '人情', icon: 'gift', color: '#BE8194', type: 'expense', builtin: true },
  { id: 'travel', name: '旅行', icon: 'plane', color: '#3F8579', type: 'expense', builtin: true },
  { id: 'pet', name: '宠物', icon: 'paw', color: '#9B7B55', type: 'expense', builtin: true },
  { id: 'phone', name: '通讯', icon: 'phone', color: '#77768A', type: 'expense', builtin: true },
  { id: 'other', name: '其他', icon: 'shapes', color: '#8C867A', type: 'expense', builtin: true },
]

export const INCOME_CATEGORIES: Category[] = [
  { id: 'bonus', name: '奖金', icon: 'sparkles', color: '#B0804C', type: 'income', builtin: true },
  { id: 'side', name: '兼职', icon: 'briefcase', color: '#4F6B78', type: 'income', builtin: true },
  { id: 'invest', name: '理财', icon: 'trend', color: '#6E7B5B', type: 'income', builtin: true },
  { id: 'redpacket', name: '红包', icon: 'gift', color: '#C2563B', type: 'income', builtin: true },
  { id: 'reimburse', name: '报销', icon: 'receipt', color: '#5E7396', type: 'income', builtin: true },
  { id: 'other-income', name: '其他', icon: 'shapes', color: '#8C867A', type: 'income', builtin: true },
]

export const DEFAULT_CATEGORIES: Category[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

export const ICON_CHOICES: { key: Category['icon']; label: string }[] = [
  { key: 'utensils', label: '餐饮' },
  { key: 'coffee', label: '咖啡' },
  { key: 'bus', label: '公交' },
  { key: 'car', label: '汽车' },
  { key: 'bag', label: '购物' },
  { key: 'house', label: '居住' },
  { key: 'gamepad', label: '娱乐' },
  { key: 'music', label: '音乐' },
  { key: 'camera', label: '摄影' },
  { key: 'heart', label: '健康' },
  { key: 'book', label: '学习' },
  { key: 'gift', label: '礼物' },
  { key: 'plane', label: '旅行' },
  { key: 'paw', label: '宠物' },
  { key: 'phone', label: '通讯' },
  { key: 'dumbbell', label: '运动' },
  { key: 'baby', label: '孩子' },
  { key: 'shapes', label: '其他' },
]

export const COLOR_CHOICES = [
  '#C2563B', '#4F6B78', '#B0804C', '#6E7B5B',
  '#8B6A8C', '#A85B5B', '#5E7396', '#3F8579',
]

export function findCategory(categories: Category[], id: string): Category {
  return (
    categories.find((c) => c.id === id) ??
    categories.find((c) => c.id === 'other') ?? {
      id: 'other',
      name: '其他',
      icon: 'shapes',
      color: '#8C867A',
      type: 'expense',
    }
  )
}
