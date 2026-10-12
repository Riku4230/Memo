import {
  Baby, Bath, Bed, BookOpen, Camera, Car, Coffee, Dog, Dumbbell, Gamepad2, Gift, Globe, Heart, House, Lamp, Laptop, Lightbulb,
  Music, Package, Pill, Plane, Refrigerator, Scissors, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sofa, Sparkles, Store,
  Tag, Truck, Tv, Utensils, WashingMachine, type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import type { TagIconKey } from '../../shared/icons';

export const ICONS: Record<TagIconKey, LucideIcon> = {
  store: Store, 'shopping-bag': ShoppingBag, 'shopping-basket': ShoppingBasket, package: Package, truck: Truck, globe: Globe,
  tv: Tv, 'washing-machine': WashingMachine, refrigerator: Refrigerator, laptop: Laptop, smartphone: Smartphone, camera: Camera,
  lightbulb: Lightbulb, sofa: Sofa, lamp: Lamp, bed: Bed, house: House, bath: Bath, sparkles: Sparkles, pill: Pill,
  utensils: Utensils, coffee: Coffee, shirt: Shirt, scissors: Scissors, baby: Baby, dog: Dog, book: BookOpen, gamepad: Gamepad2,
  music: Music, dumbbell: Dumbbell, gift: Gift, plane: Plane, car: Car, heart: Heart,
};

interface Props {
  icon: string | null | undefined;
  color: string | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** 背景を敷かず、アイコンだけを描く（タグの中など） */
  plain?: boolean;
}

/** 色をごく薄く敷いた角丸の四角に、色の細い線のアイコンを描く（Kakeibo の CategoryIcon と同じ見た目） */
export function TagIcon({ icon, color = '#8a8f98', size = 'md', className, plain = false }: Props) {
  const Icon = (icon && ICONS[icon as TagIconKey]) || Tag;
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-flex shrink-0 items-center justify-center',
        size === 'xs' && 'size-5 rounded-md',
        size === 'sm' && 'size-7 rounded-lg',
        size === 'md' && 'size-10 rounded-xl',
        size === 'lg' && 'size-12 rounded-2xl',
        className,
      )}
      style={{ backgroundColor: plain ? undefined : `${color}1a`, color }}
    >
      <Icon className={size === 'xs' ? 'size-3.5' : size === 'sm' ? 'size-4' : size === 'md' ? 'size-5' : 'size-6'} />
    </span>
  );
}
