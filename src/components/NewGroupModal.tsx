import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { chatService, DEFAULT_AVATARS } from '../services/chatService';
import { UserProfile, ChatConversation } from '../types';
import { X, Users, Search, Check, Camera, Upload } from 'lucide-react';

interface NewGroupModalProps {
  onClose: () => void;
  onGroupCreated: (chat: ChatConversation) => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({ onClose, onGroupCreated }) => {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATARS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressAvatar = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const img = new Image();
        img.onload = () => {
          const targetSize = 250;
          let { width, height } = img;
          const minDim = Math.min(width, height);
          const startX = (width - minDim) / 2;
          const startY = (height - minDim) / 2;

          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve(loadEvt.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        img.src = loadEvt.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsDataURL(file);
    });
  };

  const handleCustomAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatar(file);
      if (compressed) {
        setAvatarUrl(compressed);
      }
    } catch {
      setErrorMsg('Не удалось загрузить аватарку группы');
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    // Initial fetch of users to invite
    chatService.searchUsers('', currentUser.uid).then((users) => {
      setAvailableUsers(users);
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      chatService.searchUsers(searchQuery, currentUser.uid).then((users) => {
        setAvailableUsers(users);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser]);

  const toggleSelectUser = (uid: string) => {
    if (selectedUids.includes(uid)) {
      setSelectedUids(selectedUids.filter((id) => id !== uid));
    } else {
      setSelectedUids([...selectedUids, uid]);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!name.trim()) {
      setErrorMsg('Введите название группы');
      return;
    }

    setLoading(true);
    try {
      const group = await chatService.createGroupChat(
        currentUser,
        name.trim(),
        avatarUrl,
        description.trim(),
        selectedUids
      );
      onGroupCreated(group);
      onClose();
    } catch {
      setErrorMsg('Ошибка при создании группы');
      setLoading(false);
    }
  };

  return (
    <div id="new-group-modal-overlay" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-[#0c0c0e] border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Создать группу</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateGroup} className="flex flex-col gap-4">
          {/* Group Avatar & Name */}
          <div className="flex items-center gap-4">
            <div
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              title="Нажмите, чтобы загрузить фото группы"
            >
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-purple-500/60 shadow-md bg-zinc-900">
                <img src={avatarUrl} alt="avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
                <Camera className="w-5 h-5 text-purple-400" />
                <span className="text-[9px] font-medium">Фото</span>
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Название группы
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Проект X, Команда, Друзья..."
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleCustomAvatar}
            className="hidden"
          />

          {/* Preset icons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Иконка:</span>
              <div className="flex items-center gap-1.5">
                {DEFAULT_AVATARS.slice(0, 5).map((preset, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setAvatarUrl(preset)}
                    className={`w-7 h-7 rounded-lg overflow-hidden border transition cursor-pointer ${
                      avatarUrl === preset ? 'border-purple-400 ring-2 ring-purple-500 scale-105' : 'border-zinc-700 opacity-60'
                    }`}
                  >
                    <img src={preset} alt="preset" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Своё фото
            </button>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Описание (необязательно)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Правила чата, тема общения..."
              className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          {/* Select Members Section */}
          <div className="border-t border-zinc-800/80 pt-3">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Добавить участников ({selectedUids.length})</span>
            </label>

            {/* Member search bar */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по @username или имени..."
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            {/* List of candidates */}
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-1">
              {availableUsers.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-500">
                  Пользователи не найдены
                </div>
              ) : (
                availableUsers.map((user) => {
                  const isSelected = selectedUids.includes(user.uid);
                  return (
                    <div
                      key={user.uid}
                      onClick={() => toggleSelectUser(user.uid)}
                      className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                        isSelected
                          ? 'bg-purple-950/40 border border-purple-600/50'
                          : 'bg-zinc-900/40 hover:bg-zinc-800/60 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700">
                          <img src={user.avatarUrl} alt={user.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-zinc-200">{user.displayName}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">@{user.username}</div>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'border-zinc-700 bg-zinc-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-2.5 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs font-semibold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-bold shadow-xl shadow-purple-900/30 transition cursor-pointer"
            >
              {loading ? 'Создание...' : 'Создать группу'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
