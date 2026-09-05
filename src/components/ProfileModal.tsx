import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_AVATARS, chatService } from '../services/chatService';
import { UserProfile } from '../types';
import { UserBadge } from './UserBadge';
import { X, Camera, ShieldAlert, User, FileText, Check, LogOut, Trash2, Upload, Link, RotateCcw, Sparkles, Crown, Lock, Image as ImageIcon, PhoneCall, Music, Play, Square, Volume2, FileAudio, AlertCircle, RefreshCw } from 'lucide-react';
import { CustomRingtoneMetadata, soundService } from '../services/audioService';

interface ProfileModalProps {
  onClose: () => void;
  onOpenAdmin?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose, onOpenAdmin }) => {
  const { currentUser, updateProfile, logout, toggleBlock, isPro, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'blacklist'>('profile');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || DEFAULT_AVATARS[0]);
  const [onlyProCanMessage, setOnlyProCanMessage] = useState(currentUser?.onlyProCanMessage || false);
  const [onlyProCalls, setOnlyProCalls] = useState(currentUser?.onlyProCalls || false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [isPlayingRingtone, setIsPlayingRingtone] = useState(soundService.getIsPreviewPlaying());
  const [ringtoneVol, setRingtoneVol] = useState(soundService.getVolume());
  const [customRingtoneMeta, setCustomRingtoneMeta] = useState<CustomRingtoneMetadata | null>(
    soundService.getCustomRingtoneMeta()
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Blacklisted profiles resolution
  const [blockedProfiles, setBlockedProfiles] = useState<UserProfile[]>([]);

  React.useEffect(() => {
    const unsubPreview = soundService.subscribePreview((playing) => {
      setIsPlayingRingtone(playing);
    });
    const unsubMeta = soundService.subscribeCustomRingtone((meta) => {
      setCustomRingtoneMeta(meta);
    });
    return () => {
      unsubPreview();
      unsubMeta();
      soundService.stopAll();
    };
  }, []);

  React.useEffect(() => {
    if (currentUser?.blockedUsers?.length) {
      Promise.all(currentUser.blockedUsers.map((uid) => chatService.getUserProfile(uid))).then((users) => {
        setBlockedProfiles(users.filter(Boolean) as UserProfile[]);
      });
    } else {
      setBlockedProfiles([]);
    }
  }, [currentUser?.blockedUsers]);

  if (!currentUser) return null;

  // High-performance square center-crop compression for avatars
  const compressAvatar = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const img = new Image();
        img.onload = () => {
          const targetSize = 300;
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
            resolve(canvas.toDataURL('image/jpeg', 0.86));
          } else {
            resolve(loadEvt.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        img.src = loadEvt.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Ошибка при чтении файла'));
      reader.readAsDataURL(file);
    });
  };

  const isGifFile = (file: File): boolean => {
    return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
  };

  const isGifUrl = (url: string): boolean => {
    return url.toLowerCase().includes('.gif');
  };

  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Файл слишком большой (максимум 15 МБ)');
      return;
    }

    const isGif = isGifFile(file);
    if (isGif && !isPro && !isAdmin) {
      setErrorMsg('Анимированные GIF-аватарки доступны только для пользователей с PRO подпиской! 👑');
      if (e.target) e.target.value = '';
      return;
    }

    try {
      setIsProcessingAvatar(true);
      setErrorMsg('');

      if (isGif) {
        // Direct read as Data URL preserves animation frames without canvas flattening
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (evt.target?.result) {
            setAvatarUrl(evt.target.result as string);
          }
          setIsProcessingAvatar(false);
        };
        reader.onerror = () => {
          setErrorMsg('Ошибка при чтении GIF файла');
          setIsProcessingAvatar(false);
        };
        reader.readAsDataURL(file);
        return;
      }

      const compressed = await compressAvatar(file);
      if (compressed) {
        setAvatarUrl(compressed);
      }
    } catch {
      setErrorMsg('Не удалось загрузить выбранное фото');
    } finally {
      setIsProcessingAvatar(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleApplyUrl = () => {
    const trimmed = customUrlInput.trim();
    if (!trimmed) return;

    if (isGifUrl(trimmed) && !isPro && !isAdmin) {
      setErrorMsg('Установка GIF-аватарки по ссылке доступна только для пользователей с PRO подпиской! 👑');
      return;
    }

    setAvatarUrl(trimmed);
    setShowUrlInput(false);
    setCustomUrlInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMsg('Юзернейм должен содержать минимум 3 символа');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setErrorMsg('Юзернейм может содержать только латинские буквы, цифры и _');
      return;
    }

    try {
      const updated = await updateProfile({
        displayName: displayName.trim() || cleanUsername,
        username: cleanUsername,
        bio: bio.trim(),
        avatarUrl,
        onlyProCanMessage: isPro || isAdmin ? onlyProCanMessage : false,
        onlyProCalls: isPro || isAdmin ? onlyProCalls : false
      });
      setUsername(updated.username);
      if (updated.username.toLowerCase() !== cleanUsername.toLowerCase()) {
        setErrorMsg(`Юзернейм @${cleanUsername} был занят, вам присвоен уникальный @${updated.username}`);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      setErrorMsg('Не удалось сохранить изменения');
    }
  };

  const handleUnblock = async (targetUid: string) => {
    await toggleBlock(targetUid);
    setBlockedProfiles((prev) => prev.filter((p) => p.uid !== targetUid));
  };

  return (
    <div id="profile-modal-overlay" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-[#0c0c0e] border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-1.5 rounded-xl font-bold text-sm transition cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Мой профиль
            </button>
            <button
              onClick={() => setActiveTab('blacklist')}
              className={`px-4 py-1.5 rounded-xl font-bold text-sm transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'blacklist'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              ЧС ({currentUser.blockedUsers?.length || 0})
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-3 bg-[#121214] p-4 rounded-2xl border border-zinc-800/80">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-purple-500/80 shadow-xl shadow-purple-900/20 bg-zinc-900 relative">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {isProcessingAvatar && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-purple-300 text-xs font-medium">
                      Загрузка...
                    </div>
                  )}
                </div>
                <div
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-zinc-100 text-xs font-semibold cursor-pointer transition-opacity"
                >
                  <Camera className="w-6 h-6 mb-1 text-purple-400" />
                  Сменить
                </div>
              </div>

              <input
                ref={fileInputRef}
                id="avatar-file-input"
                type="file"
                accept="image/*"
                onChange={handleCustomAvatarUpload}
                className="hidden"
              />

              {/* User Badges & Display */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-100 text-sm">{currentUser?.displayName || currentUser?.username}</span>
                  <UserBadge user={currentUser} size="md" />
                </div>
                <span className="text-xs text-purple-400 font-mono">@{currentUser?.username}</span>
              </div>

              {/* Action Buttons for Avatar */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-purple-900/30 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Загрузить своё фото
                </button>

                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white font-medium text-xs transition flex items-center gap-1.5 border border-zinc-700/60 cursor-pointer"
                >
                  <Link className="w-3.5 h-3.5 text-zinc-400" />
                  По ссылке
                </button>

                <button
                  type="button"
                  onClick={() => setAvatarUrl(DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)])}
                  title="Выбрать случайную аватарку"
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white font-medium text-xs transition flex items-center gap-1.5 border border-zinc-700/60 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  Случайная
                </button>
              </div>

              {/* GIF Support Badge */}
              <div className="mt-0.5">
                {isPro || isAdmin ? (
                  <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Поддержка GIF-аватарок активна (PRO)
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400 bg-zinc-900/80 border border-zinc-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    GIF-аватарки доступны только с PRO подпиской
                  </span>
                )}
              </div>

              {/* Custom URL Input dropdown */}
              {showUrlInput && (
                <div className="w-full flex items-center gap-2 mt-1">
                  <input
                    type="url"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyUrl}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 transition cursor-pointer"
                  >
                    Применить
                  </button>
                </div>
              )}

              {/* Preset Avatars */}
              <div className="flex flex-col items-center gap-1.5 mt-1">
                <span className="text-[11px] text-zinc-400 font-medium">Коллекция аватарок Пантеры:</span>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {DEFAULT_AVATARS.map((preset, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setAvatarUrl(preset)}
                      className={`w-8 h-8 rounded-full overflow-hidden border-2 transition cursor-pointer ${
                        avatarUrl === preset ? 'border-purple-400 ring-2 ring-purple-500 scale-110' : 'border-zinc-700 opacity-70 hover:opacity-100 hover:scale-105'
                      }`}
                    >
                      <img src={preset} alt="preset" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-400" /> Отображаемое имя
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Как вас зовут?"
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            {/* Username - Telegram style without top label */}
            <div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-purple-400 font-mono font-bold text-sm pointer-events-none">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-8 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono transition"
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                По этому юзернейму другие пользователи смогут найти вас в поиске
              </p>
            </div>

            {/* Bio / Description */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400" /> О себе (статус)
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Расскажите о себе, своих увлечениях или оставьте цитату..."
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition resize-none"
              />
            </div>

            {/* PRO Privacy: Only users with PRO can message me */}
            <div className="bg-[#121214] border border-zinc-800/80 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isPro || isAdmin
                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                      : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-400'
                  }`}>
                    <Crown className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <span>Принимать сообщения только от PRO</span>
                      <span className="text-[10px] text-amber-300 font-extrabold bg-amber-500/20 border border-amber-500/35 px-1.5 py-0.5 rounded-md">
                        PRO
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Ограничить входящие личные сообщения: писать смогут только PRO пользователи
                    </div>
                  </div>
                </div>

                {isPro || isAdmin ? (
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={onlyProCanMessage}
                      onChange={(e) => setOnlyProCanMessage(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                ) : (
                  <div className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-xl flex items-center gap-1 flex-shrink-0">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Нужен PRO</span>
                  </div>
                )}
              </div>
              {!isPro && !isAdmin && (
                <p className="text-[11px] text-zinc-500 mt-2.5 pt-2 border-t border-zinc-800/60">
                  👑 Владельцы PRO подписки могут ограничить входящие сообщения, чтобы им писали только другие пользователи с PRO статусом.
                </p>
              )}
            </div>

            {/* PRO Privacy: Only users with PRO can call me (audio & video calls) */}
            <div className="bg-[#121214] border border-zinc-800/80 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isPro || isAdmin
                      ? 'bg-purple-500/15 border border-purple-500/30 text-purple-400'
                      : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-400'
                  }`}>
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <span>Принимать звонки только от PRO</span>
                      <span className="text-[10px] text-purple-300 font-extrabold bg-purple-500/20 border border-purple-500/35 px-1.5 py-0.5 rounded-md">
                        ЗВОНКИ
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Ограничить входящие аудио- и видеозвонки: дозваниваться смогут только PRO пользователи и админы
                    </div>
                  </div>
                </div>

                {isPro || isAdmin ? (
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={onlyProCalls}
                      onChange={(e) => setOnlyProCalls(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                ) : (
                  <div className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-xl flex items-center gap-1 flex-shrink-0">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Нужен PRO</span>
                  </div>
                )}
              </div>
              {!isPro && !isAdmin && (
                <p className="text-[11px] text-zinc-500 mt-2.5 pt-2 border-t border-zinc-800/60">
                  👑 Настройка доступна только пользователям с PRO статусом. Обычные пользователи не могут включить ограничение звонков.
                </p>
              )}
            </div>

            {/* Global Ringtone Display & Player Card */}
            <div className="bg-[#121214] border border-purple-500/30 rounded-2xl p-4 shadow-lg shadow-purple-950/20">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                    customRingtoneMeta
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}>
                    {customRingtoneMeta ? (
                      <FileAudio className="w-5 h-5 animate-pulse" />
                    ) : (
                      <Music className="w-5 h-5 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <span>Мелодия звонков (Рингтон)</span>
                      <span className="text-[9px] bg-purple-950/80 text-purple-300 border border-purple-600/50 px-1.5 py-0.5 rounded font-extrabold flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> ОБЩИЙ РИНГТОН
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-purple-300 mt-0.5 flex items-center gap-1.5 truncate max-w-[210px] sm:max-w-[280px]">
                      <span className="truncate">{soundService.getRingtoneTitle()}</span>
                      {customRingtoneMeta?.duration && (
                        <span className="text-[10px] text-zinc-500 font-mono flex-shrink-0">
                          {Math.round(customRingtoneMeta.duration)} сек
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => soundService.togglePreviewRingtone()}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      isPlayingRingtone
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-950/50 animate-pulse'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-950/50'
                    }`}
                    title={isPlayingRingtone ? 'Остановить воспроизведение' : 'Прослушать рингтон'}
                  >
                    {isPlayingRingtone ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Пауза</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Слушать</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Animated Equalizer Waveform when playing */}
              {isPlayingRingtone && (
                <div className="flex items-center justify-center gap-1 py-2 px-3 mb-3 rounded-xl bg-purple-950/50 border border-purple-500/30">
                  {[45, 90, 65, 100, 75, 40, 85, 95, 60, 80, 50, 95, 70, 45, 85].map((h, i) => (
                    <span
                      key={i}
                      style={{ height: `${h * 0.22}px` }}
                      className="w-1 bg-purple-400 rounded-full animate-pulse"
                    />
                  ))}
                  <span className="text-[10px] text-purple-300 font-mono ml-2 font-medium">
                    Воспроизведение...
                  </span>
                </div>
              )}

              {/* Centralized explanation notice */}
              <div className="text-[11px] text-zinc-400 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 mb-3 flex items-start gap-2">
                <Music className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span>
                    Эта мелодия играет при всех входящих и исходящих звонках для каждого пользователя. Мелодия централизованно устанавливается администратором приложения.
                  </span>
                  {isAdmin && onOpenAdmin && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAdmin();
                        }}
                        className="text-purple-300 hover:text-purple-200 underline font-semibold flex items-center gap-1"
                      >
                        Сменить рингтон для всех пользователей в Админ-панели →
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Volume Slider & Info */}
              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                  Громкость рингтона:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={ringtoneVol}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setRingtoneVol(v);
                      soundService.setVolume(v);
                    }}
                    className="w-24 accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-zinc-300 w-8 text-right">
                    {Math.round(ringtoneVol * 100)}%
                  </span>
                </div>
              </div>

              <div className="mt-2 text-[10px] text-zinc-500">
                ✓ Рингтон сохраняется локально в браузере и автоматически звучит при входящих и исходящих звонках.
              </div>
            </div>

            {errorMsg && (
              <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-2.5 rounded-xl">
                {errorMsg}
              </div>
            )}

            {savedSuccess && (
              <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-emerald-400" /> Профиль успешно сохранен!
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 mt-2">
              <button
                type="button"
                onClick={logout}
                className="px-4 py-2 rounded-xl text-red-400 hover:bg-red-950/30 border border-red-900/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Выйти из аккаунта
              </button>

              <button
                type="submit"
                id="save-profile-btn"
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold shadow-lg shadow-purple-950/60 transition cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        ) : (
          /* Blacklist (ЧС) Tab */
          <div className="flex flex-col gap-3">
            <div className="text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl leading-relaxed">
              🛡️ Пользователи из черного списка не смогут отправлять вам сообщения и совершать вызовы.
            </div>

            {blockedProfiles.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-500 text-sm">
                <ShieldAlert className="w-12 h-12 text-zinc-700 mb-2" />
                <span>Ваш черный список пуст</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {blockedProfiles.map((user) => (
                  <div
                    key={user.uid}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-700">
                        <img src={user.avatarUrl} alt={user.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-zinc-200">{user.displayName}</div>
                        <div className="text-xs text-zinc-500 font-mono">@{user.username}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUnblock(user.uid)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition cursor-pointer"
                    >
                      Разблокировать
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
