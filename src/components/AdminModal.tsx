import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import { chatService } from '../services/chatService';
import { ADMIN_EMAIL, UserBadge, isUserAdmin, isUserPro, isUserBanned } from './UserBadge';
import { useAuth } from '../context/AuthContext';
import { soundService, CustomRingtoneMetadata } from '../services/audioService';
import {
  Shield,
  Search,
  X,
  Ban,
  Clock,
  Crown,
  Edit3,
  Check,
  AlertTriangle,
  User,
  AtSign,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
  Sliders,
  ChevronRight,
  Music,
  Play,
  Square,
  Volume2,
  Upload,
  RotateCcw,
  FileAudio,
  Globe,
  Radio,
  CheckCircle2
} from 'lucide-react';

interface AdminModalProps {
  onClose: () => void;
  currentUser?: UserProfile | null;
  initialSelectedUser?: UserProfile | null;
  onViewUserProfile?: (user: UserProfile) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  onClose,
  currentUser: propCurrentUser,
  initialSelectedUser,
  onViewUserProfile
}) => {
  const auth = useAuth();
  const currentUser = propCurrentUser || auth.currentUser;
  const isAdmin = auth.isAdmin || isUserAdmin(currentUser);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(initialSelectedUser || null);
  const [activeTab, setActiveTab] = useState<'all' | 'pro' | 'banned' | 'ringtone'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Global Ringtone state
  const [ringtoneMeta, setRingtoneMeta] = useState<CustomRingtoneMetadata | null>(
    soundService.getCustomRingtoneMeta()
  );
  const [isPlayingRingtone, setIsPlayingRingtone] = useState(soundService.getIsPreviewPlaying());
  const [selectedRingtoneFile, setSelectedRingtoneFile] = useState<File | null>(null);
  const [isUploadingRingtone, setIsUploadingRingtone] = useState(false);
  const [ringtoneProgress, setRingtoneProgress] = useState(0);
  const [ringtoneStage, setRingtoneStage] = useState('');
  const [directUrlInput, setDirectUrlInput] = useState('');
  const [directUrlTitle, setDirectUrlTitle] = useState('');
  const [isDragOverRingtone, setIsDragOverRingtone] = useState(false);
  const [ringtoneUploadError, setRingtoneUploadError] = useState<string | null>(null);
  const ringtoneFileInputRef = useRef<HTMLInputElement>(null);

  // Quick PRO Grant by Username (@юз)
  const [quickProUsername, setQuickProUsername] = useState('');
  const [quickProDuration, setQuickProDuration] = useState<number | null>(30);
  const [quickProIcon, setQuickProIcon] = useState('👑');
  const [isQuickGranting, setIsQuickGranting] = useState(false);

  // Edit Username state
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsernameInput, setNewUsernameInput] = useState('');

  // Ban Dialog state
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banDurationHours, setBanDurationHours] = useState<number | null>(24);
  const [banReasonInput, setBanReasonInput] = useState('Нарушение правил сообщества');

  // PRO Dialog state
  const [showProDialog, setShowProDialog] = useState(false);
  const [proDurationDays, setProDurationDays] = useState<number | null>(30);
  const [proBadgeIcon, setProBadgeIcon] = useState('👑');

  // Update selectedUser if initialSelectedUser changes
  useEffect(() => {
    if (initialSelectedUser) {
      setSelectedUser(initialSelectedUser);
      setNewUsernameInput(initialSelectedUser.username);
    }
  }, [initialSelectedUser]);

  // Load all users
  const refreshUsers = () => {
    if (!currentUser) return;
    chatService.subscribeToAllUsers(currentUser.uid, (allUsers) => {
      // Include current user in admin list too for convenience
      setUsers([currentUser, ...allUsers.filter((u) => u.uid !== currentUser.uid)]);
    });
  };

  useEffect(() => {
    refreshUsers();
  }, [currentUser?.uid]);

  // Subscribe to real-time ringtone status & preview
  useEffect(() => {
    const unsubPreview = soundService.subscribePreview((playing) => {
      setIsPlayingRingtone(playing);
    });
    const unsubMeta = soundService.subscribeCustomRingtone((meta) => {
      setRingtoneMeta(meta);
    });
    return () => {
      unsubPreview();
      unsubMeta();
      soundService.stopAll();
    };
  }, []);

  const handleAdminSelectAudioFile = (file: File) => {
    setRingtoneUploadError(null);
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm'];
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!file.type.startsWith('audio/') && !validExtensions.includes(ext)) {
      setRingtoneUploadError('Пожалуйста, выберите корректный аудиофайл (.mp3, .wav, .ogg, .m4a)');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setRingtoneUploadError('Размер файла превышает 20 МБ. Рекомендуется файл до 10-15 МБ.');
      return;
    }
    setSelectedRingtoneFile(file);
  };

  const handleAdminApplyUploadedRingtone = async () => {
    if (!selectedRingtoneFile) return;
    setIsUploadingRingtone(true);
    setRingtoneUploadError(null);
    try {
      const adminName = currentUser?.displayName || currentUser?.username || 'Администратор';
      const meta = await soundService.adminSetGlobalRingtoneFromFile(
        selectedRingtoneFile,
        adminName,
        (pct, stage) => {
          setRingtoneProgress(pct);
          setRingtoneStage(stage);
        }
      );
      setSelectedRingtoneFile(null);
      showNotice(`🎉 Рингтон "${meta.name}" установлен для всех пользователей!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при загрузке рингтона';
      setRingtoneUploadError(msg);
    } finally {
      setIsUploadingRingtone(false);
      setRingtoneProgress(0);
      setRingtoneStage('');
      if (ringtoneFileInputRef.current) ringtoneFileInputRef.current.value = '';
    }
  };

  const handleAdminApplyUrlRingtone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrlInput.trim()) return;
    setIsUploadingRingtone(true);
    setRingtoneUploadError(null);
    try {
      const adminName = currentUser?.displayName || currentUser?.username || 'Администратор';
      const meta = await soundService.adminSetGlobalRingtoneFromUrl(
        directUrlInput.trim(),
        directUrlTitle.trim(),
        adminName
      );
      setDirectUrlInput('');
      setDirectUrlTitle('');
      showNotice(`🎉 Рингтон "${meta.name}" установлен по ссылке для всех пользователей!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки по ссылке';
      setRingtoneUploadError(msg);
    } finally {
      setIsUploadingRingtone(false);
    }
  };

  const handleAdminResetRingtone = async () => {
    if (!confirm('Вернуть стандартную мелодию ("Serebro — Мало тебя") для всех пользователей?')) return;
    setIsUploadingRingtone(true);
    try {
      const adminName = currentUser?.displayName || currentUser?.username || 'Администратор';
      await soundService.adminResetGlobalRingtone(adminName);
      showNotice('Стандартная мелодия установлена для всех пользователей');
    } catch {
      showNotice('Ошибка при сбросе рингтона');
    } finally {
      setIsUploadingRingtone(false);
    }
  };

  const showNotice = (text: string) => {
    setNoticeMessage(text);
    setTimeout(() => setNoticeMessage(null), 3500);
  };

  // Action: Quick Issue PRO by Username ("с помощью юза")
  const handleQuickGrantProByUsername = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = quickProUsername.trim().toLowerCase().replace(/^@/, '');
    if (!clean) {
      showNotice('Введите юзернейм пользователя (например: @username)');
      return;
    }

    setIsQuickGranting(true);
    try {
      const targetUser = await chatService.getUserByUsername(clean);
      if (!targetUser) {
        showNotice(`❌ Пользователь с юзернеймом @${clean} не найден в базе данных`);
        setIsQuickGranting(false);
        return;
      }

      await chatService.adminSetPro(targetUser.uid, true, quickProDuration, quickProIcon);
      const updatedTarget: UserProfile = {
        ...targetUser,
        isPro: true,
        proUntil: quickProDuration ? Date.now() + quickProDuration * 24 * 3600 * 1000 : null,
        proBadgeIcon: quickProIcon,
        proGrantedAt: Date.now()
      };

      setUsers((prev) => prev.map((u) => (u.uid === targetUser.uid ? updatedTarget : u)));
      setSelectedUser(updatedTarget);
      setQuickProUsername('');
      showNotice(`🎉 Пользователю @${targetUser.username} успешно выдана PRO подписка ${quickProIcon}!`);
    } catch {
      showNotice('❌ Ошибка при выдаче PRO подписки');
    } finally {
      setIsQuickGranting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-[#121215] border border-red-800/80 rounded-3xl p-6 max-w-md w-full text-center shadow-2xl">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Доступ ограничен</h2>
          <p className="text-xs text-zinc-400 mb-5">
            Панель управления доступна только для администратора.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim().replace(/^@/, '');
    const matchesSearch =
      !q ||
      u.displayName?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (activeTab === 'pro') return isUserPro(u);
    if (activeTab === 'banned') return isUserBanned(u);
    return true;
  });

  // Action: Save edited username
  const handleSaveUsername = async () => {
    if (!selectedUser) return;
    const clean = newUsernameInput.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    if (!clean) {
      showNotice('Юзернейм не может быть пустым');
      return;
    }
    setIsSaving(true);
    try {
      const finalUsername = await chatService.findUniqueUsername(clean, selectedUser.uid);
      await chatService.adminUpdateUser(selectedUser.uid, { username: finalUsername });
      const updatedUser = { ...selectedUser, username: finalUsername };
      setSelectedUser(updatedUser);
      setUsers((prev) => prev.map((u) => (u.uid === selectedUser.uid ? updatedUser : u)));
      setEditingUsername(false);
      showNotice(`Юзернейм изменен на @${finalUsername}`);
    } catch {
      showNotice('Ошибка при изменении юзернейма');
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Toggle or set BAN
  const handleApplyBan = async (isBanned: boolean) => {
    if (!selectedUser) return;
    if (isUserAdmin(selectedUser)) {
      showNotice('Нельзя заблокировать учетную запись Администратора');
      return;
    }
    setIsSaving(true);
    try {
      await chatService.adminBanUser(
        selectedUser.uid,
        isBanned,
        isBanned ? banDurationHours : null,
        isBanned ? banReasonInput : undefined
      );

      const updatedUser: UserProfile = {
        ...selectedUser,
        isBanned,
        bannedUntil: isBanned && banDurationHours ? Date.now() + banDurationHours * 3600 * 1000 : null,
        banReason: isBanned ? banReasonInput : undefined,
        bannedAt: isBanned ? Date.now() : undefined
      };
      setSelectedUser(updatedUser);
      setUsers((prev) => prev.map((u) => (u.uid === selectedUser.uid ? updatedUser : u)));
      setShowBanDialog(false);
      showNotice(isBanned ? `Пользователь @${selectedUser.username} заблокирован` : `Блокировка снята`);
    } catch {
      showNotice('Ошибка выполнения операции');
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Toggle or set PRO
  const handleApplyPro = async (isPro: boolean) => {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      await chatService.adminSetPro(
        selectedUser.uid,
        isPro,
        isPro ? proDurationDays : null,
        proBadgeIcon
      );

      const updatedUser: UserProfile = {
        ...selectedUser,
        isPro,
        proUntil: isPro && proDurationDays ? Date.now() + proDurationDays * 24 * 3600 * 1000 : null,
        proBadgeIcon: isPro ? proBadgeIcon : undefined,
        proGrantedAt: isPro ? Date.now() : undefined
      };
      setSelectedUser(updatedUser);
      setUsers((prev) => prev.map((u) => (u.uid === selectedUser.uid ? updatedUser : u)));
      setShowProDialog(false);
      showNotice(isPro ? `PRO подписка выдана для @${selectedUser.username}` : `PRO статус отозван`);
    } catch {
      showNotice('Ошибка обновления статуса PRO');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick stats
  const totalCount = users.length;
  const proCount = users.filter((u) => isUserPro(u)).length;
  const bannedCount = users.filter((u) => isUserBanned(u)).length;

  return (
    <div id="admin-panel-overlay" className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="relative w-full max-w-4xl bg-[#0e0e11] border border-red-900/40 rounded-3xl shadow-[0_0_50px_rgba(225,29,72,0.15)] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/80 bg-gradient-to-r from-red-950/40 via-zinc-900 to-purple-950/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-lg shadow-red-600/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-wide">
                  Панель Администратора
                </h1>
                <span className="text-[10px] bg-red-600/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-mono font-bold">
                  ROOT
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                Управление пользователями, блокировками и подписками PRO
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice toast */}
        {noticeMessage && (
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 border-b border-purple-500/30 px-4 py-2 text-center text-xs font-semibold text-purple-100 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            {noticeMessage}
          </div>
        )}

        {/* Quick Stats & Navigation Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-[#121216] border-b border-zinc-800/60">
          <button
            onClick={() => setActiveTab('all')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'all'
                ? 'bg-zinc-800/80 border-purple-500/50 ring-1 ring-purple-500/30'
                : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
            }`}
          >
            <div className="text-[10px] text-zinc-400 uppercase font-semibold">Всего аккаунтов</div>
            <div className="text-lg font-black text-zinc-100">{totalCount}</div>
          </button>

          <button
            onClick={() => setActiveTab('pro')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'pro'
                ? 'bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/30'
                : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
            }`}
          >
            <div className="text-[10px] text-amber-400 uppercase font-semibold flex items-center gap-1">
              <Crown className="w-3 h-3" /> PRO Подписки
            </div>
            <div className="text-lg font-black text-amber-300">{proCount}</div>
          </button>

          <button
            onClick={() => setActiveTab('banned')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'banned'
                ? 'bg-red-950/30 border-red-500/50 ring-1 ring-red-500/30'
                : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
            }`}
          >
            <div className="text-[10px] text-red-400 uppercase font-semibold flex items-center gap-1">
              <Ban className="w-3 h-3" /> Забанено
            </div>
            <div className="text-lg font-black text-red-400">{bannedCount}</div>
          </button>

          <button
            onClick={() => setActiveTab('ringtone')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'ringtone'
                ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/40'
                : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
            }`}
          >
            <div className="text-[10px] text-purple-400 uppercase font-semibold flex items-center gap-1 truncate">
              <Music className="w-3 h-3 text-purple-400" /> Рингтон для всех
            </div>
            <div className="text-xs font-black text-purple-200 truncate mt-1">
              {soundService.getRingtoneTitle().length > 18
                ? soundService.getRingtoneTitle().slice(0, 18) + '...'
                : soundService.getRingtoneTitle()}
            </div>
          </button>
        </div>

        {activeTab === 'ringtone' ? (
          /* Dedicated Global Ringtone Management Room */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#0c0c0e]">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-purple-950/60 via-indigo-950/40 to-black border border-purple-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-300 flex items-center justify-center flex-shrink-0">
                  <Music className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black text-white">Общесистемный рингтон</h2>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full font-bold uppercase">
                      ЕДИНЫЙ ЗВУК ДЛЯ ВСЕХ
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
                    Загруженная или указанная вами мелодия мгновенно устанавливается для <strong>всех пользователей</strong> сервиса «Пантера» как основной рингтон при входящих и исходящих звонках.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Автосинхронизация активна
                </span>
              </div>
            </div>

            {/* Current Active Ringtone Card */}
            <div className="bg-[#121216] border border-zinc-800/80 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/70">
                <div className="flex items-start gap-3.5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                    ringtoneMeta
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
                  }`}>
                    {ringtoneMeta ? <FileAudio className="w-6 h-6" /> : <Music className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-2">
                      <span>Текущий установленный рингтон</span>
                      {ringtoneMeta ? (
                        <span className="text-[9px] bg-purple-950/80 text-purple-300 border border-purple-600/50 px-1.5 py-0.2 rounded font-extrabold">
                          КАСТОМНЫЙ
                        </span>
                      ) : (
                        <span className="text-[9px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.2 rounded font-extrabold">
                          СТАНДАРТНЫЙ
                        </span>
                      )}
                    </div>
                    <div className="text-base font-black text-zinc-100 mt-0.5">
                      {soundService.getRingtoneTitle()}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 mt-1">
                      <span>Установил: <strong className="text-zinc-300">{ringtoneMeta?.updatedBy || 'Администрация'}</strong></span>
                      <span>•</span>
                      <span>
                        Обновлено: <strong className="text-zinc-300">{ringtoneMeta?.updatedAt ? new Date(ringtoneMeta.updatedAt).toLocaleString('ru') : 'По умолчанию'}</strong>
                      </span>
                      {ringtoneMeta?.size ? (
                        <>
                          <span>•</span>
                          <span>Размер: <strong className="text-zinc-300">{(ringtoneMeta.size / (1024 * 1024)).toFixed(2)} МБ</strong></span>
                        </>
                      ) : null}
                      {ringtoneMeta?.duration ? (
                        <>
                          <span>•</span>
                          <span>Длительность: <strong className="text-zinc-300">{Math.round(ringtoneMeta.duration)} сек.</strong></span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Play / Reset buttons */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => soundService.togglePreviewRingtone()}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-md ${
                      isPlayingRingtone
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50 animate-pulse'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/50'
                    }`}
                  >
                    {isPlayingRingtone ? (
                      <>
                        <Square className="w-4 h-4 fill-current" />
                        <span>Остановить тест</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Прослушать мелодию</span>
                      </>
                    )}
                  </button>

                  {ringtoneMeta && (
                    <button
                      type="button"
                      onClick={handleAdminResetRingtone}
                      disabled={isUploadingRingtone}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-red-950/60 hover:text-red-300 border border-zinc-700 hover:border-red-800/60 text-zinc-300 transition cursor-pointer flex items-center gap-1.5"
                      title="Сбросить на стандартную мелодию"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Сбросить на стандартный</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Waveform visualizer */}
              {isPlayingRingtone && (
                <div className="flex items-center justify-center gap-1.5 py-3 px-4 mt-3 rounded-xl bg-purple-950/40 border border-purple-500/30">
                  {[35, 70, 50, 95, 60, 40, 85, 100, 75, 45, 90, 65, 80, 50, 95, 70, 40, 85, 60, 90].map((h, i) => (
                    <span
                      key={i}
                      style={{ height: `${h * 0.28}px` }}
                      className="w-1 bg-purple-400 rounded-full animate-pulse"
                    />
                  ))}
                  <span className="text-xs text-purple-200 font-mono ml-3 font-semibold">
                    Тестовое воспроизведение рингтона...
                  </span>
                </div>
              )}
            </div>

            {/* Section: Set New Ringtone for All Users */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Method 1: File Upload (MP3, WAV, OGG, M4A) */}
              <div className="bg-[#121216] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">Загрузить MP3 файл с устройства</h3>
                      <p className="text-[11px] text-zinc-400">Поддерживаются форматы MP3, WAV, OGG, M4A (до 20 МБ)</p>
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={ringtoneFileInputRef}
                    accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAdminSelectAudioFile(file);
                    }}
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOverRingtone(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragOverRingtone(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverRingtone(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleAdminSelectAudioFile(file);
                    }}
                    onClick={() => ringtoneFileInputRef.current?.click()}
                    className={`mt-3 p-4 rounded-xl border-2 border-dashed transition flex flex-col items-center justify-center text-center cursor-pointer min-h-[120px] ${
                      isDragOverRingtone
                        ? 'border-purple-500 bg-purple-950/50 text-purple-100 ring-2 ring-purple-500/30'
                        : selectedRingtoneFile
                        ? 'border-purple-500/70 bg-purple-950/20 text-purple-200'
                        : 'border-zinc-700/80 hover:border-purple-500/60 bg-zinc-900/40 hover:bg-zinc-900/80 text-zinc-300'
                    }`}
                  >
                    {selectedRingtoneFile ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <FileAudio className="w-8 h-8 text-purple-400 animate-bounce" />
                        <div className="text-xs font-bold text-white max-w-[280px] truncate">
                          {selectedRingtoneFile.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {(selectedRingtoneFile.size / (1024 * 1024)).toFixed(2)} МБ • Нажмите, чтобы выбрать другой
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload className="w-7 h-7 text-zinc-400 mb-1" />
                        <div className="text-xs font-semibold text-zinc-200">
                          Нажмите для выбора файла или перетащите MP3 сюда
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Файл будет сохранен в облаке и немедленно применен для всех
                        </div>
                      </div>
                    )}
                  </div>

                  {ringtoneUploadError && (
                    <div className="mt-3 p-2.5 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{ringtoneUploadError}</span>
                    </div>
                  )}

                  {isUploadingRingtone && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-purple-300">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          {ringtoneStage || 'Загрузка рингтона на сервер...'}
                        </span>
                        <span className="font-mono">{ringtoneProgress}%</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 transition-all duration-300"
                          style={{ width: `${ringtoneProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAdminApplyUploadedRingtone}
                  disabled={!selectedRingtoneFile || isUploadingRingtone}
                  className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:opacity-95 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-purple-950/50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{isUploadingRingtone ? 'Установка для всех...' : 'Установить эту мелодию для всех пользователей'}</span>
                </button>
              </div>

              {/* Method 2: Direct URL */}
              <div className="bg-[#121216] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                <form onSubmit={handleAdminApplyUrlRingtone} className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">Установить рингтон по прямой ссылке</h3>
                      <p className="text-[11px] text-zinc-400">Прямая ссылка на MP3 или аудиофайл в интернете</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 uppercase font-semibold mb-1">
                      Название мелодии (необязательно):
                    </label>
                    <input
                      type="text"
                      value={directUrlTitle}
                      onChange={(e) => setDirectUrlTitle(e.target.value)}
                      placeholder="Например: Мой любимый трек"
                      className="w-full bg-[#18181e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 uppercase font-semibold mb-1">
                      Прямой URL адрес аудиофайла:
                    </label>
                    <input
                      type="url"
                      value={directUrlInput}
                      onChange={(e) => setDirectUrlInput(e.target.value)}
                      placeholder="https://example.com/audio/ringtone.mp3"
                      className="w-full bg-[#18181e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    💡 Аудиофайл будет скачан сервером и мгновенно применен для всех пользователей мессенджера.
                  </p>

                  <button
                    type="submit"
                    disabled={!directUrlInput.trim() || isUploadingRingtone}
                    className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700 disabled:opacity-40 text-zinc-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <span>Применить по ссылке для всех</span>
                  </button>
                </form>

                <div className="mt-4 p-3 rounded-xl bg-purple-950/20 border border-purple-500/20 text-[11px] text-zinc-400 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Обычные пользователи больше не могут загружать собственные рингтоны — звук централизованно контролируется только администратором.
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Quick Issue PRO by Username Banner ("спомощю юза") */}
            <div className="bg-gradient-to-r from-amber-950/40 via-purple-950/45 to-[#121216] border-b border-amber-500/25 p-3 sm:p-4">
              <form onSubmit={handleQuickGrantProByUsername} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 text-sm">
                    👑
                  </span>
                  <span className="text-xs font-bold text-amber-200 whitespace-nowrap">
                    Выдать PRO по юзу:
                  </span>
                </div>

                <div className="relative flex-1 min-w-[140px]">
                  <span className="absolute left-2.5 top-2 text-amber-400/80 font-mono text-xs font-bold pointer-events-none">@</span>
                  <input
                    type="text"
                    value={quickProUsername}
                    onChange={(e) => setQuickProUsername(e.target.value)}
                    placeholder="username"
                    className="w-full bg-black/40 border border-amber-500/30 rounded-xl pl-6 pr-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Duration selector */}
                <select
                  value={quickProDuration === null ? 'perm' : quickProDuration}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuickProDuration(v === 'perm' ? null : Number(v));
                  }}
                  className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="7">7 дней</option>
                  <option value="30">30 дней</option>
                  <option value="90">3 месяца</option>
                  <option value="365">1 год</option>
                  <option value="perm">Навсегда</option>
                </select>

                {/* Icon badge selector */}
                <select
                  value={quickProIcon}
                  onChange={(e) => setQuickProIcon(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="👑">👑 Корона</option>
                  <option value="💎">💎 Алмаз</option>
                  <option value="⚡">⚡ Молния</option>
                  <option value="🔥">🔥 Огонь</option>
                  <option value="⭐">⭐ Звезда</option>
                </select>

                <button
                  type="submit"
                  disabled={isQuickGranting || !quickProUsername.trim()}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-zinc-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Crown className="w-3.5 h-3.5 fill-zinc-950" />
                  <span>{isQuickGranting ? 'Выдача...' : 'Выдать PRO'}</span>
                </button>
              </form>
            </div>

        {/* Content Body: Split view (User list + Detail Inspector) */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-[350px]">
          {/* Left Column: User Directory */}
          <div className="w-full sm:w-1/2 border-r border-zinc-800/60 flex flex-col overflow-hidden bg-[#0c0c0e]">
            {/* Search Input */}
            <div className="p-3 border-b border-zinc-800/50 bg-[#101014]">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по юзернейму, имени или email..."
                  className="w-full bg-[#16161c] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60 transition"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  Пользователи не найдены
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUser?.uid === user.uid;
                  const isCurAdmin = isUserAdmin(user);
                  const isCurPro = isUserPro(user);
                  const isCurBanned = isUserBanned(user);

                  return (
                    <div
                      key={user.uid}
                      onClick={() => {
                        setSelectedUser(user);
                        setEditingUsername(false);
                        setNewUsernameInput(user.username);
                      }}
                      className={`p-2.5 rounded-2xl flex items-center justify-between transition cursor-pointer border ${
                        isSelected
                          ? 'bg-red-950/20 border-red-500/40 text-white'
                          : 'bg-[#141418] hover:bg-zinc-800/40 border-zinc-800/80 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800">
                            <img
                              src={user.avatarUrl}
                              alt={user.displayName}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {user.isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0c0c0e]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold text-xs truncate">{user.displayName}</span>
                            <UserBadge user={user} size="sm" />
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono truncate">
                            @{user.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isCurBanned && (
                          <span className="text-[9px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.5 rounded font-bold">
                            BAN
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: User Management Inspector */}
          <div className="w-full sm:w-1/2 flex flex-col bg-[#111115] overflow-y-auto p-4 sm:p-5">
            {selectedUser ? (
              <div className="flex flex-col gap-4">
                {/* User Card Header */}
                <div className="p-4 rounded-2xl bg-[#16161c] border border-zinc-800 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-red-500/40 bg-zinc-900 flex-shrink-0">
                    <img
                      src={selectedUser.avatarUrl}
                      alt={selectedUser.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-sm text-zinc-100 truncate">
                        {selectedUser.displayName}
                      </h2>
                      <UserBadge user={selectedUser} size="md" />
                    </div>
                    <div className="text-xs text-purple-400 font-mono">@{selectedUser.username}</div>
                    <div className="text-[11px] text-zinc-400 truncate">{selectedUser.email}</div>
                    {onViewUserProfile && (
                      <button
                        onClick={() => onViewUserProfile(selectedUser)}
                        className="mt-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer flex items-center gap-1.5 w-fit border border-zinc-700/60"
                      >
                        <User className="w-3.5 h-3.5 text-purple-400" />
                        <span>Открыть профиль пользователя</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Account Status Tags */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <div className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700 text-zinc-300 font-mono">
                    UID: {selectedUser.uid.substring(0, 10)}...
                  </div>
                  {isUserBanned(selectedUser) && (
                    <div className="px-2.5 py-1 rounded-lg bg-red-950/70 border border-red-700 text-red-300 font-medium">
                      Заблокирован {selectedUser.bannedUntil ? `до ${new Date(selectedUser.bannedUntil).toLocaleString('ru')}` : '(Бессрочно)'}
                    </div>
                  )}
                  {isUserPro(selectedUser) && !isUserAdmin(selectedUser) && (
                    <div className="px-2.5 py-1 rounded-lg bg-amber-950/70 border border-amber-700 text-amber-300 font-medium">
                      PRO подписка {selectedUser.proUntil ? `до ${new Date(selectedUser.proUntil).toLocaleDateString('ru')}` : '(Бессрочная)'}
                    </div>
                  )}
                </div>

                {/* 1. Change Username Module */}
                <div className="p-3.5 rounded-2xl bg-[#16161c] border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <AtSign className="w-3.5 h-3.5 text-purple-400" /> Юзернейм аккаунта
                    </span>
                    {!editingUsername && (
                      <button
                        onClick={() => {
                          setEditingUsername(true);
                          setNewUsernameInput(selectedUser.username);
                        }}
                        className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" /> Изменить
                      </button>
                    )}
                  </div>

                  {editingUsername ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-purple-400 font-mono font-bold text-xs">@</span>
                        <input
                          type="text"
                          value={newUsernameInput}
                          onChange={(e) => setNewUsernameInput(e.target.value)}
                          placeholder="new_username"
                          className="w-full bg-[#0c0c0e] border border-zinc-700 rounded-xl pl-7 pr-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditingUsername(false)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleSaveUsername}
                          disabled={isSaving}
                          className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition cursor-pointer"
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400 font-mono bg-[#0c0c0e] px-3 py-1.5 rounded-xl border border-zinc-800/80">
                      @{selectedUser.username}
                    </div>
                  )}
                </div>

                {/* 2. Ban Management Module */}
                <div className="p-3.5 rounded-2xl bg-[#16161c] border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5" /> Система блокировки (Бан)
                    </span>
                    {isUserBanned(selectedUser) ? (
                      <span className="text-[10px] text-red-400 font-bold bg-red-950/80 border border-red-800/80 px-2 py-0.5 rounded-md">
                        ЗАБАНЕН
                      </span>
                    ) : (
                      <span className="text-[10px] text-green-400 font-medium bg-green-950/60 border border-green-800/60 px-2 py-0.5 rounded-md">
                        Активен
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-400 mb-3">
                    Заблокированный пользователь теряет доступ к общению и видит экран блокировки с указанием причины и срока.
                  </p>

                  {isUserBanned(selectedUser) ? (
                    <button
                      onClick={() => handleApplyBan(false)}
                      disabled={isSaving}
                      className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-green-400 font-bold text-xs border border-green-700/40 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" /> Разблокировать пользователя
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowBanDialog(true)}
                      disabled={isSaving || isUserAdmin(selectedUser)}
                      className="w-full py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white font-bold text-xs border border-red-500/40 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" /> Заблокировать аккаунт...
                    </button>
                  )}
                </div>

                  {/* 3. PRO Subscription Module */}
                  <div className="p-3.5 rounded-2xl bg-[#16161c] border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5" /> Статус PRO Подписки
                    </span>
                    {isUserPro(selectedUser) ? (
                      <span className="text-[10px] text-amber-300 font-extrabold bg-amber-950/80 border border-amber-600/60 px-2 py-0.5 rounded-md">
                        PRO АКТИВЕН
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500">Базовый</span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-400 mb-3">
                    Дает эксклюзивный значок {selectedUser.proBadgeIcon || '👑'} PRO возле ника, доступ к секретному VIP-паку стикеров и приоритетный статус.
                  </p>

                  {isUserPro(selectedUser) ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowProDialog(true)}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs border border-amber-500/30 transition cursor-pointer"
                      >
                        Продлить / Настроить
                      </button>
                      <button
                        onClick={() => handleApplyPro(false)}
                        disabled={isSaving}
                        className="py-2.5 px-3.5 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                        title="Забрать PRO подписку у пользователя"
                      >
                        <X className="w-3.5 h-3.5" /> Забрать PRO
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowProDialog(true)}
                      disabled={isSaving}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 hover:opacity-90 text-zinc-950 font-black text-xs transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Crown className="w-3.5 h-3.5 text-zinc-950" /> Выдать PRO подписку
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <Sliders className="w-12 h-12 text-zinc-800 mb-3" />
                <span className="text-xs font-semibold text-zinc-400">Выберите пользователя</span>
                <span className="text-[11px] text-zinc-600 mt-1 max-w-[220px]">
                  Выберите пользователя из левого списка для изменения юзернейма, блокировки или выдачи PRO
                </span>
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {/* Dialog Modal: BAN Configuration */}
        {showBanDialog && selectedUser && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#141418] border border-red-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-3">
                <Ban className="w-4 h-4" /> Блокировка @{selectedUser.username}
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase font-semibold mb-1">
                    Срок блокировки:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {[
                      { label: '1 час', val: 1 },
                      { label: '24 часа', val: 24 },
                      { label: '7 дней', val: 168 },
                      { label: 'Навсегда', val: null }
                    ].map((opt) => (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => setBanDurationHours(opt.val)}
                        className={`py-1.5 px-2 rounded-lg border font-medium transition cursor-pointer ${
                          banDurationHours === opt.val
                            ? 'bg-red-950 border-red-500 text-red-200'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase font-semibold mb-1">
                    Причина блокировки:
                  </label>
                  <input
                    type="text"
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    placeholder="Спам, оскорбления..."
                    className="w-full bg-[#0e0e11] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBanDialog(false)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBan(true)}
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Забанить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dialog Modal: PRO Configuration */}
        {showProDialog && selectedUser && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#141418] border border-amber-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm mb-3">
                <Crown className="w-4 h-4" /> Выдача PRO для @{selectedUser.username}
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase font-semibold mb-1">
                    Период подписки:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {[
                      { label: '7 дней (Пробный)', val: 7 },
                      { label: '30 дней (Месяц)', val: 30 },
                      { label: '365 дней (Год)', val: 365 },
                      { label: 'Бессрочно', val: null }
                    ].map((opt) => (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => setProDurationDays(opt.val)}
                        className={`py-1.5 px-2 rounded-lg border font-medium transition cursor-pointer ${
                          proDurationDays === opt.val
                            ? 'bg-amber-950 border-amber-500 text-amber-200'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase font-semibold mb-1">
                    Иконка PRO бейджа:
                  </label>
                  <div className="flex gap-2">
                    {['👑', '💎', '⚡', '🔥', '⭐'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setProBadgeIcon(emoji)}
                        className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition cursor-pointer ${
                          proBadgeIcon === emoji
                            ? 'bg-amber-500/30 border-amber-400 scale-110'
                            : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {isUserPro(selectedUser) && (
                <button
                  type="button"
                  onClick={() => handleApplyPro(false)}
                  disabled={isSaving}
                  className="w-full mb-3 py-2.5 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <X className="w-4 h-4" /> Забрать PRO подписку
                </button>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowProDialog(false)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPro(true)}
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 hover:opacity-95 text-zinc-950 text-xs font-black transition cursor-pointer"
                >
                  Активировать PRO
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
