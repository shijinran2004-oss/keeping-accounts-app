import {
  Baby, BookOpen, Briefcase, BusFront, Camera, CarFront, Coffee, Dumbbell,
  Gamepad2, Gift, HeartPulse, House, Music2, PawPrint, Plane, ReceiptText,
  Shapes, ShoppingBag, Smartphone, Sparkles, TrendingUp, Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { IconKey } from '../types'

const MAP: Record<IconKey, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  bus: BusFront,
  car: CarFront,
  bag: ShoppingBag,
  house: House,
  gamepad: Gamepad2,
  music: Music2,
  camera: Camera,
  heart: HeartPulse,
  book: BookOpen,
  gift: Gift,
  plane: Plane,
  paw: PawPrint,
  phone: Smartphone,
  dumbbell: Dumbbell,
  baby: Baby,
  shapes: Shapes,
  sparkles: Sparkles,
  briefcase: Briefcase,
  trend: TrendingUp,
  receipt: ReceiptText,
}

export function CategoryIcon({
  name,
  size = 20,
  strokeWidth = 1.7,
  className,
}: {
  name: IconKey
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const Cmp = MAP[name] ?? Shapes
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
