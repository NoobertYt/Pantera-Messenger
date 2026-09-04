import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { chatService } from '../services/chatService';
import { ChatConversation, ChatMessage, UserProfile, StickerItem, CallSession } from '../types';
import { StickerPicker } from './StickerPicker';
import { ImageViewerModal } from './ImageViewerModal';
import {
  Phone,
  Video,
  Paperclip,
  Smile,
  Send,
  MoreVertical,
  ShieldAlert,
  ShieldCheck,
  Check,
  CheckCheck,
  ArrowLeft,
  X,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Image as ImageIcon,
  User,
  Crown,
  Lock
} from 'lucide-react';
import { UserBadge } from './UserBadge';

interface ChatViewProps {
  chat: ChatConversation;
  onBack?: () => void;
  onStartCall: (targetUser: UserProfile, type: 'audio' | 'video') => void;
  onViewProfile?: (user: UserProfile) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ chat, onBack, onStartCall, onViewProfile }) => {
  const { currentUser, toggleBlock, isUserBlocked, isPro, isAdmin } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGroup = chat.type === 'group';
  const otherUid = isGroup ? null : chat.participants.find((id) => id !== currentUser?.uid);
  const isBlocked = otherUid ? isUserBlocked(otherUid) : false;
  const isRestrictedByPro = !isGroup && Boolean(otherUser?.onlyProCanMessage) && !isPro && !isAdmin;

  // Fetch other participant profile
  useEffect(() => {
    if (otherUid) {
      chatService.getUserProfile(otherUid).then((prof) => {
        setOtherUser(prof);
      });
    } else {
      setOtherUser(null);
    }
  }, [otherUid, chat.id]);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!currentUser) return;
    const unsub = chatService.subscribeToMessages(chat.id, currentUser.uid, (msgs) => {
      setMessages(msgs);
    });

    return () => unsub();
  }, [chat.id, currentUser?.uid]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Client-side image compression to guarantee fast delivery and Firestore compliance (<1MB)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 1200;
          const maxHeight = 1200;
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser) return;
    if (isBlocked || isRestrictedByPro) return;

    const trimmed = inputText.trim();
    if (!trimmed && !selectedPhoto) return;

    const photoToSend = selectedPhoto;
    const currentReply = replyingTo;

    // Reset input fields immediately
    setSelectedPhoto(null);
    setInputText('');
    setReplyingTo(null);

    try {
      const newMsg = await chatService.sendMessage({
        chatId: chat.id,
        sender: currentUser,
        text: trimmed,
        photoUrl: photoToSend || undefined,
        type: photoToSend ? 'image' : 'text',
        replyTo: currentReply
          ? {
              id: currentReply.id,
              text: currentReply.text || (currentReply.type === 'image' ? 'Фото' : 'Стикер'),
              senderName: currentReply.senderName
            }
          : undefined
      });

      // Immediate state update ensures user sees it with 0ms delay
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleSelectSticker = async (sticker: StickerItem) => {
    if (!currentUser || isBlocked) return;
    setShowStickers(false);
    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      const newMsg = await chatService.sendMessage({
        chatId: chat.id,
        sender: currentUser,
        text: `${sticker.name} — «${sticker.quote || ''}»`,
        stickerEmoji: sticker.emoji,
        type: 'sticker',
        replyTo: currentReply
          ? {
              id: currentReply.id,
              text: currentReply.text || 'Стикер',
              senderName: currentReply.senderName
            }
          : undefined
      });

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err) {
      console.error('Error sending sticker:', err);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('Файл слишком большой. Максимальный размер: 15 МБ');
      return;
    }

    try {
      const compressedBase64 = await compressImage(file);
      if (compressedBase64) {
        setSelectedPhoto(compressedBase64);
      }
    } catch (err) {
      console.error('Photo load error:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleToggleBlock = async () => {
    if (!otherUid) return;
    await toggleBlock(otherUid);
    setShowMenu(false);
  };

  const formatMessageTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusText = () => {
    if (isGroup) {
      return `${chat.participants.length} участников`;
    }
    if (!otherUser) return 'В сети';
    if (otherUser.isOnline) {
      return 'в сети';
    }
    const diffMin = Math.round((Date.now() - otherUser.lastSeen) / 60000);
    if (diffMin < 2) return 'был(а) только что';
    if (diffMin < 60) return `был(а) в сети ${diffMin} мин. назад`;
    return 'был(а) недавно';
  };

  const chatTitle = isGroup ? chat.name : otherUser?.displayName || 'Пользователь';
  const chatAvatar = isGroup
    ? chat.avatarUrl || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80'
    : otherUser?.avatarUrl || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80';

  return (
    <div id="active-chat-view" className="flex-1 h-full flex flex-col bg-[#09090b] bg-[radial-gradient(circle_at_center,_rgba(88,28,135,0.05)_0%,_transparent_70%)] relative select-none">
      {/* Top Header */}
      <div className="h-16 px-6 sm:px-8 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3.5">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Avatar & Online status */}
          <div
            className={`relative ${!isGroup && otherUser && onViewProfile ? 'cursor-pointer group' : ''}`}
            onClick={() => !isGroup && otherUser && onViewProfile && onViewProfile(otherUser)}
            title={!isGroup && otherUser ? `Посмотреть профиль @${otherUser.username}` : undefined}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border border-purple-500/40 bg-zinc-800 shadow-md group-hover:ring-2 group-hover:ring-purple-500 transition">
              <img src={chatAvatar} alt={chatTitle} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            {!isGroup && otherUser?.isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[#09090b] shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            )}
          </div>

          <div
            className={!isGroup && otherUser && onViewProfile ? 'cursor-pointer' : ''}
            onClick={() => !isGroup && otherUser && onViewProfile && onViewProfile(otherUser)}
          >
            <div className="font-bold text-lg text-zinc-100 flex items-center gap-2 leading-tight">
              <span>{chatTitle}</span>
              {!isGroup && otherUser && <UserBadge user={otherUser} size="sm" />}
              {!isGroup && otherUser && (
                <span className="text-xs text-purple-400 font-mono font-normal hover:underline">
                  @{otherUser.username}
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest flex items-center gap-1.5">
              {!isGroup && otherUser?.isOnline && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
              )}
              {isGroup ? `${chat.participants.length} УЧАСТНИКОВ` : (otherUser?.isOnline ? 'В СЕТИ' : getStatusText().toUpperCase())}
            </div>
          </div>
        </div>

        {/* Action Buttons: Audio Call, Video Call, Menu */}
        <div className="flex items-center gap-2">
          {!isGroup && otherUser && (
            <>
              <button
                id="btn-voice-call"
                onClick={() => onStartCall(otherUser, 'audio')}
                disabled={isBlocked}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30 transition cursor-pointer disabled:opacity-30"
                title="Позвонить (голосовой вызов с гудками)"
              >
                <Phone className="w-4 h-4 fill-white" />
              </button>
              <button
                id="btn-video-call"
                onClick={() => onStartCall(otherUser, 'video')}
                disabled={isBlocked}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer disabled:opacity-30"
                title="Видеозвонок с гудками"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}

          {/* More options */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-12 w-52 bg-[#141417] border border-zinc-800 rounded-2xl p-1.5 shadow-2xl z-30 flex flex-col gap-1">
                {!isGroup && otherUser && onViewProfile && (
                  <button
                    onClick={() => {
                      onViewProfile(otherUser);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 transition cursor-pointer text-left"
                  >
                    <User className="w-4 h-4 text-purple-400" />
                    <span>Профиль пользователя</span>
                  </button>
                )}

                {!isGroup && otherUid && (
                  <button
                    onClick={handleToggleBlock}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer text-left ${
                      isBlocked
                        ? 'text-green-400 hover:bg-green-950/30'
                        : 'text-red-400 hover:bg-red-950/30'
                    }`}
                  >
                    {isBlocked ? (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Разблокировать
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4" /> В черный список (ЧС)
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4 flex flex-col">
        {/* Chat introduction banner */}
        <div className="mx-auto my-2 px-4 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/80 text-[10px] text-zinc-400 uppercase tracking-widest font-mono flex items-center gap-2">
          <span>🐾</span>
          <span>Pantera Encrypted Protocol Active</span>
        </div>

        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser?.uid;
          const senderAvatar = isMe
            ? (currentUser?.avatarUrl || msg.senderAvatar)
            : (msg.senderAvatar || (otherUser && msg.senderId === otherUser.uid ? otherUser.avatarUrl : undefined) || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80');

          const senderName = isMe
            ? (currentUser?.displayName || msg.senderName)
            : msg.senderName;

          // Status calculation: Admin, PRO, or none
          const senderIsAdmin = isMe ? isAdmin : Boolean(msg.senderIsAdmin);
          const senderIsPro = isMe ? isPro : Boolean(msg.senderIsPro);
          const senderBadgeIcon = isMe ? currentUser?.proBadgeIcon : msg.senderProBadge;

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'} w-full group`}
            >
              {/* Other user avatar (Telegram style on left) */}
              {!isMe && (
                <div
                  onClick={() => {
                    if (otherUser && onViewProfile && msg.senderId === otherUser.uid) {
                      onViewProfile(otherUser);
                    }
                  }}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex-shrink-0 border border-zinc-700/80 bg-zinc-800 mb-1 ${
                    otherUser && onViewProfile ? 'cursor-pointer hover:ring-2 hover:ring-purple-400 transition' : ''
                  }`}
                  title={senderName}
                >
                  <img
                    src={senderAvatar}
                    alt={senderName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[82%] sm:max-w-[70%] space-y-1`}
              >
                {/* Header with Sender Name and Subscription Badge (Админ / PRO / ничего) */}
                <div className={`flex items-center gap-1.5 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <span className={`font-semibold text-xs ${isMe ? 'text-purple-200' : 'text-zinc-300'}`}>
                    {senderName}
                  </span>
                  {senderIsAdmin ? (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-[0_0_8px_rgba(225,29,72,0.4)] border border-rose-400/40 flex-shrink-0">
                      🛡️ Админ
                    </span>
                  ) : senderIsPro ? (
                    <span className="text-[9px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 shadow-[0_0_8px_rgba(245,158,11,0.4)] border border-amber-300/80 flex-shrink-0">
                      {senderBadgeIcon || '👑'} PRO
                    </span>
                  ) : null}
                </div>

                {/* Message bubble */}
                <div
                  className={`relative shadow-md ${
                    isMe
                      ? 'p-3.5 rounded-2xl rounded-tr-none bg-purple-600 text-white shadow-xl shadow-purple-900/20'
                      : 'px-4 py-3 rounded-2xl rounded-tl-none bg-zinc-800/80 text-zinc-100 text-sm border border-zinc-700/30'
                  }`}
                >
                  {/* Quoted Reply if any */}
                  {msg.replyTo && (
                    <div className="mb-2 p-2 rounded-xl bg-black/25 border-l-2 border-purple-300 text-xs text-zinc-200">
                      <span className="font-bold text-[10px] text-purple-200 block">
                        {msg.replyTo.senderName}:
                      </span>
                      <span className="truncate block opacity-90">{msg.replyTo.text}</span>
                    </div>
                  )}

                  {/* Photo rendering */}
                  {msg.type === 'image' && msg.photoUrl && (
                    <div
                      onClick={() => setViewingPhotoUrl(msg.photoUrl!)}
                      className="cursor-pointer overflow-hidden rounded-xl mb-1.5 border border-zinc-700/50 max-h-72 group relative"
                    >
                      <img
                        src={msg.photoUrl}
                        alt="Вложение"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                        Нажмите для просмотра
                      </div>
                    </div>
                  )}

                  {/* Sticker rendering */}
                  {msg.type === 'sticker' && (
                    <div className="flex flex-col items-center py-2 px-3">
                      <span className="text-6xl my-1 filter drop-shadow-lg">
                        {msg.stickerEmoji || '🐾'}
                      </span>
                      <span className={`text-xs font-semibold mt-1 ${isMe ? 'text-purple-100' : 'text-zinc-300'}`}>
                        {msg.text}
                      </span>
                    </div>
                  )}

                  {/* Standard text */}
                  {msg.type !== 'sticker' && msg.text && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  )}

                  {/* Call Log representation */}
                  {msg.type === 'call_log' && (
                    <div className="flex items-center gap-2 text-xs font-medium py-1">
                      <Phone className="w-4 h-4 text-purple-300" />
                      <span>{msg.text}</span>
                    </div>
                  )}

                  {/* Timestamp & read status */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMe ? 'text-purple-200/80' : 'text-zinc-500'
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {isMe && <CheckCheck className="w-3.5 h-3.5 text-purple-200" />}
                  </div>
                </div>
              </div>

              {/* My avatar (Telegram style on right) */}
              {isMe && (
                <div
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex-shrink-0 border border-purple-500/50 bg-zinc-800 mb-1 ring-1 ring-purple-500/30"
                  title={`Вы (${currentUser?.displayName || 'Я'})`}
                >
                  <img
                    src={senderAvatar}
                    alt={senderName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Replying banner */}
      {replyingTo && (
        <div className="px-6 py-2 bg-zinc-900/90 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-purple-400">Ответ {replyingTo.senderName}:</span>
            <span className="truncate max-w-xs text-zinc-400">{replyingTo.text}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected photo preview before sending */}
      {selectedPhoto && (
        <div className="px-6 py-2 bg-zinc-900/90 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-purple-500 shadow-md">
              <img src={selectedPhoto} alt="preview" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs text-zinc-200 font-medium">Фото готово к отправке</span>
          </div>
          <button
            onClick={() => setSelectedPhoto(null)}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-red-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sticker Picker Popover */}
      {showStickers && (
        <div className="absolute bottom-24 left-6 z-40">
          <StickerPicker
            onSelectSticker={handleSelectSticker}
            onClose={() => setShowStickers(false)}
          />
        </div>
      )}

      {/* Input area, Blocked Notice, or PRO Restriction */}
      {isBlocked ? (
        <div className="p-5 border-t border-zinc-800/80 bg-[#0c0c0e] flex items-center justify-center gap-2 text-xs text-red-400 font-semibold">
          <ShieldAlert className="w-4 h-4" />
          Пользователь в черном списке (ЧС). Отправка сообщений заблокирована.
        </div>
      ) : isRestrictedByPro ? (
        <div className="p-5 border-t border-purple-900/40 bg-[#0e0c14] flex flex-col items-center justify-center gap-1.5 text-center">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <Lock className="w-4 h-4" />
            <Crown className="w-4 h-4" />
            <span>Сообщения ограничены пользователем</span>
          </div>
          <p className="text-xs text-zinc-400 max-w-md">
            @{otherUser?.username} разрешил(а) писать только пользователям с <strong className="text-amber-300">PRO подпиской</strong> 👑
          </p>
          {onViewProfile && otherUser && (
            <button
              onClick={() => onViewProfile(otherUser)}
              className="mt-1 text-[11px] text-purple-400 hover:text-purple-300 underline font-medium cursor-pointer"
            >
              Посмотреть профиль @{otherUser.username}
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 sm:p-6 bg-gradient-to-t from-[#09090b] via-[#09090b]/90 to-transparent">
          <form
            onSubmit={handleSendMessage}
            className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3 p-2 bg-[#121214] border border-zinc-800 rounded-2xl shadow-2xl"
          >
            {/* Photo attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-zinc-500 hover:text-purple-400 transition-colors cursor-pointer"
              title="Отправить фотографию"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />

            {/* Stickers button */}
            <button
              type="button"
              onClick={() => setShowStickers(!showStickers)}
              className={`p-2.5 transition-colors cursor-pointer ${
                showStickers ? 'text-purple-400' : 'text-zinc-500 hover:text-yellow-400'
              }`}
              title="Стикеры"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Main text input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Напишите сообщение..."
              className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm py-2 px-1 text-zinc-200 placeholder-zinc-600"
            />

            {/* Send message button */}
            <button
              type="submit"
              disabled={!inputText.trim() && !selectedPhoto}
              className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/40 cursor-pointer disabled:opacity-30 flex-shrink-0"
              title="Отправить"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Fullscreen Photo Viewer Modal */}
      {viewingPhotoUrl && (
        <ImageViewerModal
          imageUrl={viewingPhotoUrl}
          senderName={chatTitle}
          onClose={() => setViewingPhotoUrl(null)}
        />
      )}
    </div>
  );
};
