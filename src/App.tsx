import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { CallModal } from './components/CallModal';
import { ProfileModal } from './components/ProfileModal';
import { NewGroupModal } from './components/NewGroupModal';
import { UserProfileModal } from './components/UserProfileModal';
import { AdminModal } from './components/AdminModal';
import { ChatConversation, UserProfile, CallSession } from './types';
import { chatService } from './services/chatService';
import { Phone, Shield, Sparkles, MessageSquare, Flame, Crown, Music, Upload, Play, Square, FileAudio, CheckCircle2 } from 'lucide-react';
import { isUserAdmin, isUserPro, isUserBanned } from './components/UserBadge';
import { soundService, CustomRingtoneMetadata } from './services/audioService';

function MessengerMain() {
  const { currentUser, loading } = useAuth();

  const [activeChat, setActiveChat] = useState<ChatConversation | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [viewUserProfile, setViewUserProfile] = useState<UserProfile | null>(null);
  const [adminSelectedUser, setAdminSelectedUser] = useState<UserProfile | null>(null);
  const [callWarningNotice, setCallWarningNotice] = useState<string | null>(null);
  const [isWindowDragAudio, setIsWindowDragAudio] = useState(false);
  const [ringtoneSuccessToast, setRingtoneSuccessToast] = useState<string | null>(null);
  const [ringtonePreviewPlaying, setRingtonePreviewPlaying] = useState(soundService.getIsPreviewPlaying());
  const [customRingtoneMeta, setCustomRingtoneMeta] = useState<CustomRingtoneMetadata | null>(
    soundService.getCustomRingtoneMeta()
  );
  const quickAudioInputRef = useRef<HTMLInputElement>(null);
  const loggedCallIdsRef = useRef<Set<string>>(new Set());
  const autoSelectedRef = useRef(false);

  // Subscribe to audio preview and custom ringtone changes
  useEffect(() => {
    const unsubPreview = soundService.subscribePreview((playing) => {
      setRingtonePreviewPlaying(playing);
    });
    const unsubMeta = soundService.subscribeCustomRingtone((meta) => {
      setCustomRingtoneMeta(meta);
    });
    return () => {
      unsubPreview();
      unsubMeta();
    };
  }, []);

  // Global window drag & drop handler for quick MP3 file drop anywhere
  useEffect(() => {
    let dragCounter = 0;
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsWindowDragAudio(true);
      }
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        setIsWindowDragAudio(false);
        dragCounter = 0;
      }
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsWindowDragAudio(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (file.type.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) {
          try {
            const meta = await soundService.saveCustomRingtone(file);
            setRingtoneSuccessToast(`Рингтон установлен: "${meta.name}"`);
            setTimeout(() => setRingtoneSuccessToast(null), 5000);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Ошибка при сохранении аудио';
            setCallWarningNotice(msg);
          }
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Auto-open first chat on initial load/login so the user lands straight in the messenger
  useEffect(() => {
    if (!currentUser || autoSelectedRef.current) return;
    const unsub = chatService.subscribeToChats(currentUser.uid, (chats) => {
      if (!autoSelectedRef.current && chats && chats.length > 0) {
        autoSelectedRef.current = true;
        setActiveChat((prev) => prev || chats[0]);
      }
    });
    return () => unsub();
  }, [currentUser?.uid]);

  // Subscribe to real incoming calls from other users in Firestore
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = chatService.subscribeToIncomingCalls(currentUser.uid, async (incoming) => {
      // If receiver is banned
      if (isUserBanned(currentUser)) {
        await chatService.endCall(incoming.id, 'declined');
        return;
      }

      const callerProfile = await chatService.getUserProfile(incoming.callerId);

      // If caller is banned
      if (callerProfile && isUserBanned(callerProfile)) {
        await chatService.endCall(incoming.id, 'declined');
        return;
      }

      // If current user enabled "Принимать звонки только от PRO"
      if (currentUser.onlyProCalls) {
        const isCallerAdmin = callerProfile ? isUserAdmin(callerProfile) : false;
        const isCallerPro = callerProfile ? isUserPro(callerProfile) : false;

        if (!isCallerAdmin && !isCallerPro) {
          // Decline call automatically if caller does not have PRO
          await chatService.endCall(incoming.id, 'declined');
          return;
        }
      }

      setActiveCall((prev) => {
        if (!prev || prev.id === incoming.id) {
          return incoming;
        }
        return prev;
      });
    });

    return () => unsubscribe();
  }, [currentUser?.uid, currentUser?.onlyProCalls]);

  // Initial loader
  if (loading) {
    return (
      <div className="w-screen h-screen bg-[#09090b] flex flex-col items-center justify-center text-zinc-100">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-purple-500/20 glow-purple animate-pulse mb-4">
          <span className="text-3xl">🐆</span>
        </div>
        <div className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
          PANTERA
        </div>
        <div className="text-xs text-zinc-500 mt-1 uppercase tracking-widest font-mono">Безопасное соединение...</div>
      </div>
    );
  }

  // If not authenticated, show Auth modal
  if (!currentUser) {
    return <AuthModal />;
  }

  // Start outgoing call with dial tones ("гудки")
  const handleStartCall = async (targetUser: UserProfile, type: 'audio' | 'video') => {
    if (!currentUser || !activeChat) return;

    if (isUserBanned(currentUser)) {
      setCallWarningNotice('Ваш аккаунт заблокирован (БАН). Вызовы недоступны.');
      return;
    }

    // Check if targetUser has restricted calls to PRO users only
    const freshTarget = (await chatService.getUserProfile(targetUser.uid)) || targetUser;
    const isCallerAdmin = isUserAdmin(currentUser);
    const isCallerPro = isUserPro(currentUser);

    if (freshTarget.onlyProCalls && !isCallerAdmin && !isCallerPro) {
      setCallWarningNotice(`Пользователь @${freshTarget.username} принимает звонки только от PRO пользователей 👑`);
      return;
    }

    const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newCall: CallSession = {
      id: callId,
      callerId: currentUser.uid,
      callerName: currentUser.displayName,
      callerAvatar: currentUser.avatarUrl,
      receiverId: targetUser.uid,
      receiverName: targetUser.displayName,
      receiverAvatar: targetUser.avatarUrl,
      chatId: activeChat.id,
      type,
      status: 'dialing',
      startedAt: Date.now()
    };

    setActiveCall(newCall);
    await chatService.initiateCall(newCall);
  };

  // Test call equipment (mic/camera/sound)
  const handleSelfTestCall = () => {
    if (!currentUser) return;
    const testCaller = {
      uid: 'echo_service',
      displayName: 'Служба проверки связи',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    };

    const newCall: CallSession = {
      id: 'call_test_' + Date.now(),
      callerId: testCaller.uid,
      callerName: testCaller.displayName,
      callerAvatar: testCaller.avatarUrl,
      receiverId: currentUser.uid,
      receiverName: currentUser.displayName,
      receiverAvatar: currentUser.avatarUrl,
      chatId: activeChat?.id || 'direct_test',
      type: 'audio',
      status: 'incoming',
      startedAt: Date.now()
    };

    setActiveCall(newCall);
  };

  const handleEndCall = async (durationSec?: number) => {
    if (!activeCall) return;
    const currentCall = activeCall;
    setActiveCall(null);

    // Guard: Prevent sending multiple messages for the same call
    if (loggedCallIdsRef.current.has(currentCall.id)) {
      return;
    }
    loggedCallIdsRef.current.add(currentCall.id);

    try {
      await chatService.endCall(currentCall.id, 'ended', durationSec);
    } catch (err) {
      console.warn('Call end error:', err);
    }

    const targetChatId = currentCall.chatId || activeChat?.id;
    if (targetChatId && currentUser) {
      const isConnected = durationSec && durationSec > 0;
      const durText = isConnected
        ? `${Math.floor(durationSec / 60)} мин. ${durationSec % 60} сек.`
        : 'Вызов отклонен или пропущен';

      const callTypeRu = currentCall.type === 'video' ? 'Видеозвонок' : 'Голосовой звонок';
      await chatService.sendMessage({
        chatId: targetChatId,
        sender: currentUser,
        text: `📞 ${callTypeRu}: ${durText}`,
        type: 'call_log'
      });
    }
  };

  const handleStartDirectChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    if (isUserBanned(currentUser)) {
      setCallWarningNotice('Ваш аккаунт заблокирован (БАН). Вы не можете начинать новые переписки.');
      return;
    }
    const chat = await chatService.getOrCreateDirectChat(currentUser, targetUser);
    setActiveChat(chat);
  };

  return (
    <div className="w-screen h-screen flex bg-[#09090b] text-zinc-100 font-sans overflow-hidden relative select-none">
      {/* Top Banned Banner if current user is banned */}
      {isUserBanned(currentUser) && (
        <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-r from-red-950 via-red-900 to-rose-950 border-b border-red-500/50 py-2 px-4 flex items-center justify-between text-xs text-white shadow-lg shadow-red-950/50">
          <div className="flex items-center gap-2 font-medium">
            <span className="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
              🚫 БАН
            </span>
            <span>Ваш аккаунт заблокирован. Отправка сообщений, создание групп и звонки отключены.</span>
            {currentUser.banReason && (
              <span className="text-red-200/80 font-normal">({currentUser.banReason})</span>
            )}
          </div>
          {currentUser.bannedUntil && (
            <span className="text-[11px] text-red-200 font-mono">
              до {new Date(currentUser.bannedUntil).toLocaleString('ru')}
            </span>
          )}
        </div>
      )}

      {/* Sidebar navigation */}
      <Sidebar
        activeChat={activeChat}
        onSelectChat={(chat) => setActiveChat(chat)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenNewGroup={() => {
          if (isUserBanned(currentUser)) {
            setCallWarningNotice('Ваш аккаунт заблокирован (БАН). Создание групп недоступно.');
            return;
          }
          setShowNewGroupModal(true);
        }}
        onOpenAdmin={() => setShowAdminModal(true)}
        onViewUserProfile={(user) => setViewUserProfile(user)}
      />

      {/* Main Chat Window or Welcome Screen */}
      <main className={`flex-1 h-full ${activeChat ? 'flex' : 'hidden md:flex'} flex-col relative bg-[radial-gradient(circle_at_center,_rgba(88,28,135,0.06)_0%,_transparent_70%)]`}>
        {activeChat ? (
          <ChatView
            key={activeChat.id}
            chat={activeChat}
            onBack={() => setActiveChat(null)}
            onStartCall={handleStartCall}
            onViewProfile={(user) => setViewUserProfile(user)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none relative">
            {/* Ambient Panther Logo */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-800 flex items-center justify-center shadow-2xl shadow-purple-900/30 glow-purple">
                <span className="text-5xl">🐆</span>
              </div>
              <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-[#121214] border border-purple-500/40 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                Immersive
              </span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400 mb-2">
              Мессенджер «ПАНТЕРА»
            </h2>
            <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
              Быстрый защищенный мессенджер нового поколения: кристальные аудио/видео звонки с живыми гудками, группы, стикеры и поиск по @username.
            </p>

            {/* Quick action cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full mb-4">
              <button
                onClick={() => setShowNewGroupModal(true)}
                className="p-5 rounded-2xl bg-[#121214] hover:bg-[#18181b] border border-zinc-800 hover:border-purple-500/40 text-left transition-all group cursor-pointer shadow-lg"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <span className="text-lg">👥</span>
                </div>
                <div className="font-semibold text-sm text-zinc-100">Создать группу</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Объедините друзей в клан или рабочий чат
                </div>
              </button>

              <button
                onClick={handleSelfTestCall}
                className="p-5 rounded-2xl bg-[#121214] hover:bg-[#18181b] border border-zinc-800 hover:border-purple-500/40 text-left transition-all group cursor-pointer shadow-lg"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Phone className="w-4 h-4 text-purple-400" />
                </div>
                <div className="font-semibold text-sm text-zinc-100">Тест звонка и рингтона</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Проверить работу звонка и звучание вашего рингтона
                </div>
              </button>
            </div>

            {/* Prominent Ringtone Card & Quick Uploader */}
            <div className="max-w-lg w-full bg-[#121214] border border-purple-500/30 rounded-2xl p-4 shadow-xl shadow-purple-950/20 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                    customRingtoneMeta
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  }`}>
                    {customRingtoneMeta ? (
                      <FileAudio className="w-5 h-5 animate-pulse" />
                    ) : (
                      <Music className="w-5 h-5 animate-pulse" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <span>Мелодия вызова (Рингтон)</span>
                      {customRingtoneMeta ? (
                        <span className="text-[9px] bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 px-1.5 py-0.5 rounded font-extrabold flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> ВАШ ФАЙЛ
                        </span>
                      ) : (
                        <span className="text-[9px] bg-purple-900/60 text-purple-300 border border-purple-700/50 px-1.5 py-0.5 rounded font-extrabold">
                          СТАНДАРТНЫЙ
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-purple-300 truncate mt-0.5">
                      {soundService.getRingtoneTitle()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => soundService.togglePreviewRingtone()}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      ringtonePreviewPlaying
                        ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
                        : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                  >
                    {ringtonePreviewPlaying ? (
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

                  <input
                    type="file"
                    ref={quickAudioInputRef}
                    accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const meta = await soundService.saveCustomRingtone(file);
                          setRingtoneSuccessToast(`Рингтон установлен: "${meta.name}"!`);
                          setTimeout(() => setRingtoneSuccessToast(null), 5000);
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : 'Ошибка при сохранении';
                          setCallWarningNotice(msg);
                        }
                      }
                      if (quickAudioInputRef.current) quickAudioInputRef.current.value = '';
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => quickAudioInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 cursor-pointer transition"
                    title="Загрузить свой MP3 файл"
                  >
                    <Upload className="w-3.5 h-3.5 text-purple-400" />
                    <span>Свой MP3</span>
                  </button>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-500 flex items-center justify-between">
                <span>💡 Перетащите любой MP3 файл прямо в окно браузера для быстрой смены</span>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className="text-purple-400 hover:underline cursor-pointer"
                >
                  Настройки звука →
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Global Drag & Drop Overlay for MP3 Audio File */}
      {isWindowDragAudio && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-purple-950/85 backdrop-blur-md border-4 border-dashed border-purple-400 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-purple-600/30 border border-purple-400 text-purple-200 flex items-center justify-center mb-4 shadow-2xl shadow-purple-900/50 animate-bounce">
            <Music className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Отпустите ваш MP3 файл</h2>
          <p className="text-sm text-purple-200 max-w-md">
            Файл будет сохранен и установлен как персональный рингтон для всех входящих и исходящих звонков в «Пантере»
          </p>
        </div>
      )}

      {/* Ringtone success toast notification */}
      {ringtoneSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121214] border border-emerald-500/50 shadow-2xl shadow-emerald-950/50 rounded-2xl p-4 flex items-center gap-3 animate-fade-in text-zinc-100 max-w-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-emerald-400">Рингтон успешно обновлен!</div>
            <div className="text-xs text-zinc-300 truncate mt-0.5">{ringtoneSuccessToast}</div>
          </div>
        </div>
      )}

      {/* Active Call Modal with Dial Tones ("гудки") */}
      {activeCall && (
        <CallModal
          call={activeCall}
          currentUser={currentUser}
          onEndCall={handleEndCall}
          onAcceptCall={() => {
            setActiveCall({
              ...activeCall,
              status: 'connected',
              startedAt: Date.now()
            });
          }}
        />
      )}

      {/* Edit Profile & Blacklist Modal */}
      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {/* New Group Modal */}
      {showNewGroupModal && (
        <NewGroupModal
          onClose={() => setShowNewGroupModal(false)}
          onGroupCreated={(group) => {
            setActiveChat(group);
            setShowNewGroupModal(false);
          }}
        />
      )}

      {/* View Other User Profile Modal */}
      {viewUserProfile && (
        <UserProfileModal
          user={viewUserProfile}
          onClose={() => setViewUserProfile(null)}
          onStartChat={(user) => {
            handleStartDirectChat(user);
            setViewUserProfile(null);
          }}
          onStartCall={(user, type) => {
            handleStartCall(user, type);
            setViewUserProfile(null);
          }}
          onOpenAdminManage={(user) => {
            setAdminSelectedUser(user);
            setShowAdminModal(true);
            setViewUserProfile(null);
          }}
        />
      )}

      {/* Admin Panel Modal */}
      {showAdminModal && (
        <AdminModal
          currentUser={currentUser}
          onClose={() => {
            setShowAdminModal(false);
            setAdminSelectedUser(null);
          }}
          initialSelectedUser={adminSelectedUser}
          onViewUserProfile={(user) => {
            setViewUserProfile(user);
          }}
        />
      )}

      {/* Notice Dialog for restricted calls */}
      {callWarningNotice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#121215] border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3">
              <Crown className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Звонки ограничены</h3>
            <p className="text-xs text-zinc-300 leading-relaxed mb-5">
              {callWarningNotice}
            </p>
            <button
              onClick={() => setCallWarningNotice(null)}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition cursor-pointer"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MessengerMain />
    </AuthProvider>
  );
}
