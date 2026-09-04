import React, { useState } from 'react';
import { STICKER_PACKS } from '../data/stickers';
import { StickerItem } from '../types';
import { Sparkles, Smile, Flame, X } from 'lucide-react';

interface StickerPickerProps {
  onSelectSticker: (sticker: StickerItem) => void;
  onClose: () => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelectSticker, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<'emoji' | 'cats' | 'reactions'>('emoji');

  const filteredStickers = STICKER_PACKS.filter((s) => s.category === selectedCategory);

  return (
    <div id="sticker-picker-container" className="w-80 sm:w-96 bg-[#121214] border border-zinc-800 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 z-30">
      {/* Header with category tabs and close */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedCategory('emoji')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'emoji'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <span>🐆</span> Стикеры
          </button>
          <button
            onClick={() => setSelectedCategory('cats')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'cats'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <span>🐱</span> Котики
          </button>
          <button
            onClick={() => setSelectedCategory('reactions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'reactions'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <span>🔥</span> Реакции
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-zinc-400 hover:text-zinc-200 rounded-md transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stickers Grid */}
      <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
        {filteredStickers.map((stk) => (
          <button
            key={stk.id}
            id={`sticker-btn-${stk.id}`}
            onClick={() => onSelectSticker(stk)}
            className="group flex flex-col items-center justify-center p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-purple-500/60 transition-all hover:scale-105 cursor-pointer"
            title={stk.name}
          >
            <span className="text-3xl filter drop-shadow-md group-hover:scale-110 transition-transform">
              {stk.emoji}
            </span>
            <span className="text-[10px] text-zinc-400 group-hover:text-purple-300 font-medium truncate w-full text-center mt-1">
              {stk.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
