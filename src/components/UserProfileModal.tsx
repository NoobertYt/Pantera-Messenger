import React, { useState } from 'react';
import { UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { UserBadge, isUserAdmin, isUserPro, isUserBanned, isUserFrozen } from './UserBadge';
import {
  X,
  MessageSquare,
  Phone,
  Video,
  UserPlus,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Copy,
  Check,
  Crown,
  Lock,
  Sparkles,
  Calendar,
  AtSign
} from 'lucide-react';

interface UserProfileModalProps {
  user: UserProfile | null;
  onClose: () => void;
  onStartChat?: (user: UserProfile) => void;
  onStartCall?: (user: UserProfile, type: 'audio' | 'video') => void;
  onOpenAdminManage?: (user: UserProfile) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  onClose,
  onStartChat,
  onStartCall,
  onOpenAdminManage
}) => {
  const { currentUser, isAdmin: currentUserIsAdmin, isPro: currentUserIsPro, toggleBlock, isUserBlocked, toggleContact, isContact } = useAuth();
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  if (!user) return null;

  const isSelf = currentUser?.uid === user.uid;
  const inContacts = isContact(user.uid);
  const blocked = isUserBlocked(user.uid);
  const isTargetAdmin = isUserAdmin(user);
  const isTargetPro = isUserPro(user);
  const isTargetBanned = isUserBanned(user);
  const isTargetFrozen = isUserFrozen(user);

  const canMessageTarget =
    !user.onlyProCanMessage ||
    currentUserIsAdmin ||
    currentUserIsPro ||
    isSelf;

  const canCallTarget =
    !user.onlyProCalls ||
    currentUserIsAdmin ||
    currentUserIsPro ||
    isSelf;

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(`@${user.username}`);
    setCopiedUsername(true);
    setTimeout(() => setCopiedUsername(false), 2000);
  };

  const handleToggleBlock = async () => {
    await toggleBlock(user.uid);
  };

  const handleToggleContact = async () => {
    await toggleContact(user.uid);
  };

  const formatLastSeen = () => {
    if (user.isOnline) return 'В сети';
    if (!user.lastSeen) return 'Был(а) недавно';
    const diffMin = Math.round((Date.now() - user.lastSeen) / 60000);
    if (diffMin < 2) return 'Был(а) только что';
    if (diffMin < 60) return `Был(а) ${diffMin} мин. назад`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `Был(а) ${diffHours} ч. назад`;
    return `Был(а) ${new Date(user.lastSeen).toLocaleDateString()}`;
  };

  return (
    <div
      id="user-profile-modal-overlay"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0e0e11] border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5 text-purple-400" /> Профиль пользователя
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Avatar & Main Identity */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative mb-3.5">
            <div className={`w-28 h-28 rounded-full overflow-hidden border-2 bg-zinc-900 shadow-2xl p-0.5 ${
              isTargetAdmin
                ? 'border-red-500 shadow-red-900/30'
                : isTargetPro
                ? 'border-amber-400 shadow-amber-500/20'
                : 'border-purple-500/80 shadow-purple-900/20'
            }`}>
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            {user.isOnline && (
              <span
                className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-[#0e0e11] shadow-[0_0_10px_rgba(34,197,94,0.7)]"
                title="В сети"
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
            <h3 className="text-xl font-bold text-zinc-100 tracking-tight">{user.displayName}</h3>
            <UserBadge user={user} size="md" />
          </div>

          {/* Clickable Username with copy */}
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={handleCopyUsername}
              className="px-3 py-1 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-purple-500/40 text-xs font-mono text-purple-300 flex items-center gap-1.5 transition cursor-pointer group"
              title="Нажмите, чтобы скопировать @username"
            >
              <span>@{user.username}</span>
              {copiedUsername ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" />
              )}
            </button>

            <span className="text-xs text-zinc-500">•</span>

            <span className={`text-xs font-medium ${user.isOnline ? 'text-green-400' : 'text-zinc-400'}`}>
              {formatLastSeen()}
            </span>
          </div>
        </div>

        {/* Status badges: PRO, Banned, Frozen, Privacy */}
        <div className="space-y-2 mb-5">
          {isTargetPro && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1">
                    PRO Подписка активна {user.proBadgeIcon || '👑'}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {user.proUntil
                      ? `Действует до ${new Date(user.proUntil).toLocaleDateString()}`
                      : 'Бессрочный статус (Навсегда)'}
                  </div>
                </div>
              </div>
              <Sparkles className="w-4 h-4 text-amber-400/80 animate-pulse" />
            </div>
          )}

          {user.onlyProCanMessage && (
            <div className="p-3 rounded-2xl bg-purple-950/30 border border-purple-800/40 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-purple-300">
                  Сообщения только от PRO
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Этот пользователь разрешил отправлять себе личные сообщения только обладателям PRO подписки.
                </div>
              </div>
            </div>
          )}

          {isTargetBanned && (
            <div className="p-3 rounded-2xl bg-red-950/40 border border-red-800/50 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-red-300">Аккаунт заблокирован (Бан)</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Причина: {user.banReason || 'Нарушение правил сообщества'}
                </div>
              </div>
            </div>
          )}

          {isTargetFrozen && (
            <div className="p-3 rounded-2xl bg-blue-950/40 border border-blue-800/50 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-blue-300">Режим только для чтения (Мут)</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Причина: {user.freezeReason || 'Ограничение активности'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bio / Description */}
        <div className="bg-[#131317] border border-zinc-800/80 rounded-2xl p-4 mb-5">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
            О себе
          </div>
          <div className="text-sm text-zinc-200 leading-relaxed break-words whitespace-pre-line">
            {user.bio ? user.bio : <span className="text-zinc-500 italic">Информация о себе не указана</span>}
          </div>
        </div>

        {/* Action buttons (Chat, Calls, Contacts, Block, Admin) */}
        {!isSelf && (
          <div className="flex flex-col gap-2.5">
            {/* Primary Chat / Call row */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  if (onStartChat) onStartChat(user);
                  onClose();
                }}
                disabled={!canMessageTarget || blocked}
                className="py-3 px-2 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-lg shadow-purple-900/30 transition cursor-pointer"
                title={!canMessageTarget ? 'Только для обладателей PRO' : 'Написать сообщение'}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Написать</span>
              </button>

              <button
                onClick={() => {
                  if (onStartCall) onStartCall(user, 'audio');
                  onClose();
                }}
                disabled={blocked || !canCallTarget}
                className="py-3 px-2 rounded-2xl bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 text-zinc-200 hover:text-white font-semibold text-xs flex flex-col items-center justify-center gap-1 border border-zinc-700/60 transition cursor-pointer relative"
                title={!canCallTarget ? 'Звонки разрешены только пользователям с PRO подпиской' : 'Аудиозвонок'}
              >
                <Phone className="w-4 h-4 text-purple-400" />
                <span>Аудио</span>
                {!canCallTarget && (
                  <span className="absolute top-1 right-1 text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold border border-amber-500/30">
                    PRO
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  if (onStartCall) onStartCall(user, 'video');
                  onClose();
                }}
                disabled={blocked || !canCallTarget}
                className="py-3 px-2 rounded-2xl bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 text-zinc-200 hover:text-white font-semibold text-xs flex flex-col items-center justify-center gap-1 border border-zinc-700/60 transition cursor-pointer relative"
                title={!canCallTarget ? 'Видеозвонки разрешены только пользователям с PRO подпиской' : 'Видеозвонок'}
              >
                <Video className="w-4 h-4 text-purple-400" />
                <span>Видео</span>
                {!canCallTarget && (
                  <span className="absolute top-1 right-1 text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold border border-amber-500/30">
                    PRO
                  </span>
                )}
              </button>
            </div>

            {/* Secondary actions: Contacts & Block */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleToggleContact}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  inContacts
                    ? 'bg-purple-600/15 border-purple-500/40 text-purple-300 hover:bg-purple-600/25'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {inContacts ? <UserCheck className="w-4 h-4 text-purple-400" /> : <UserPlus className="w-4 h-4 text-zinc-400" />}
                <span>{inContacts ? 'В контактах' : 'В контакты'}</span>
              </button>

              <button
                onClick={handleToggleBlock}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  blocked
                    ? 'bg-red-950/40 border-red-800/60 text-red-400 hover:bg-red-950/60'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-800'
                }`}
              >
                {blocked ? <ShieldAlert className="w-4 h-4 text-red-400" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{blocked ? 'Разблокировать' : 'В черный список'}</span>
              </button>
            </div>

            {/* Admin Management quick access */}
            {currentUserIsAdmin && onOpenAdminManage && (
              <button
                onClick={() => {
                  onOpenAdminManage(user);
                  onClose();
                }}
                className="w-full mt-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600/20 via-purple-600/20 to-red-600/20 border border-red-500/40 hover:border-red-400 text-red-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Shield className="w-4 h-4 text-red-400" />
                <span>Управление пользователем в Админ-панели</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
