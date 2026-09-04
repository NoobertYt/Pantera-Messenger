import { StickerItem } from '../types';

export const STICKER_PACKS: StickerItem[] = [
  // Panther Pack
  {
    id: 'panther_1',
    category: 'emoji',
    name: 'Грозный рык',
    emoji: '🐆',
    gradient: 'from-purple-900 to-black',
    quote: 'Р-р-р!'
  },
  {
    id: 'panther_2',
    category: 'emoji',
    name: 'Черная лапка',
    emoji: '🐾',
    gradient: 'from-purple-700 to-indigo-950',
    quote: 'След лапки'
  },
  {
    id: 'panther_3',
    category: 'emoji',
    name: 'Король Ночи',
    emoji: '👑',
    gradient: 'from-amber-600 to-purple-950',
    quote: 'Власть тьмы'
  },
  {
    id: 'panther_4',
    category: 'emoji',
    name: 'Глаза в темноте',
    emoji: '👁️',
    gradient: 'from-violet-600 to-black',
    quote: 'Слежу за тобой'
  },
  {
    id: 'panther_5',
    category: 'emoji',
    name: 'Неоновое сердце',
    emoji: '💜',
    gradient: 'from-fuchsia-600 to-purple-950',
    quote: 'Люблю'
  },
  {
    id: 'panther_6',
    category: 'emoji',
    name: 'Ночная охота',
    emoji: '🌙',
    gradient: 'from-indigo-800 to-black',
    quote: 'Выхожу на охоту'
  },
  {
    id: 'panther_7',
    category: 'emoji',
    name: 'Молния',
    emoji: '⚡',
    gradient: 'from-purple-600 to-slate-950',
    quote: 'Быстрее пули'
  },
  {
    id: 'panther_8',
    category: 'emoji',
    name: 'Огонь',
    emoji: '🔥',
    gradient: 'from-rose-600 to-purple-950',
    quote: 'Жара!'
  },

  // Cats pack
  {
    id: 'cat_1',
    category: 'cats',
    name: 'Хитрая мордочка',
    emoji: '😼',
    gradient: 'from-purple-800 to-zinc-900',
    quote: 'Ха-ха'
  },
  {
    id: 'cat_2',
    category: 'cats',
    name: 'Влюбленный котик',
    emoji: '😻',
    gradient: 'from-pink-800 to-purple-950',
    quote: 'В восторге'
  },
  {
    id: 'cat_3',
    category: 'cats',
    name: 'Шок',
    emoji: '🙀',
    gradient: 'from-violet-800 to-zinc-950',
    quote: 'Что произошло?!'
  },
  {
    id: 'cat_4',
    category: 'cats',
    name: 'Кот в очках',
    emoji: '😎',
    gradient: 'from-purple-700 to-black',
    quote: 'На стиле'
  },
  {
    id: 'cat_5',
    category: 'cats',
    name: 'Дерзкий кот',
    emoji: '🐱',
    gradient: 'from-indigo-900 to-purple-950',
    quote: 'Мяу'
  },
  {
    id: 'cat_6',
    category: 'cats',
    name: 'Сонный котик',
    emoji: '😴',
    gradient: 'from-blue-900 to-purple-950',
    quote: 'Спать пора'
  },

  // Reactions pack
  {
    id: 'react_1',
    category: 'reactions',
    name: '100 Баллов',
    emoji: '💯',
    gradient: 'from-purple-600 to-red-900',
    quote: 'Идеально'
  },
  {
    id: 'react_2',
    category: 'reactions',
    name: 'Бомба',
    emoji: '💣',
    gradient: 'from-zinc-800 to-purple-950',
    quote: 'Разрыв!'
  },
  {
    id: 'react_3',
    category: 'reactions',
    name: 'Ракета',
    emoji: '🚀',
    gradient: 'from-purple-700 to-violet-950',
    quote: 'Полетели!'
  },
  {
    id: 'react_4',
    category: 'reactions',
    name: 'Череп',
    emoji: '💀',
    gradient: 'from-neutral-900 to-purple-950',
    quote: 'Умер со смеху'
  },
  {
    id: 'react_5',
    category: 'reactions',
    name: 'Праздник',
    emoji: '🎉',
    gradient: 'from-amber-600 to-purple-900',
    quote: 'Поздравляю!'
  },
  {
    id: 'react_6',
    category: 'reactions',
    name: 'Релакс',
    emoji: '🎧',
    gradient: 'from-purple-800 to-indigo-950',
    quote: 'На своей волне'
  },
  // Exclusive PRO/VIP Pack
  {
    id: 'vip_1',
    category: 'vip',
    name: 'Золотая Пантера',
    emoji: '🐆',
    gradient: 'from-amber-400 via-amber-600 to-purple-900',
    quote: 'Чистое золото',
    isVipOnly: true
  },
  {
    id: 'vip_2',
    category: 'vip',
    name: 'Бриллиант',
    emoji: '💎',
    gradient: 'from-cyan-400 via-blue-600 to-purple-950',
    quote: 'Бесценно',
    isVipOnly: true
  },
  {
    id: 'vip_3',
    category: 'vip',
    name: 'Императорская Корона',
    emoji: '👑',
    gradient: 'from-amber-500 via-yellow-400 to-amber-700',
    quote: 'Власть и статус',
    isVipOnly: true
  },
  {
    id: 'vip_4',
    category: 'vip',
    name: 'Золотая Ракета',
    emoji: '🚀',
    gradient: 'from-amber-500 via-rose-500 to-purple-900',
    quote: 'Только на вершину',
    isVipOnly: true
  },
  {
    id: 'vip_5',
    category: 'vip',
    name: 'Пламенный огонь',
    emoji: '🔥',
    gradient: 'from-orange-500 via-red-600 to-purple-950',
    quote: 'Жгучая энергия',
    isVipOnly: true
  },
  {
    id: 'vip_6',
    category: 'vip',
    name: 'Звездный взрыв',
    emoji: '✨',
    gradient: 'from-yellow-300 via-purple-500 to-indigo-950',
    quote: 'Сияние звезд',
    isVipOnly: true
  }
];
