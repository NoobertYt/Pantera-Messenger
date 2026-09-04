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
import { Phone, Shield, Sparkles, MessageSquare, Flame, Crown } from 'lucide-react';
import { isUserAdmin, isUserPro } from './components/UserBadge';

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
  const loggedCallIdsRef = useRef<Set<string>>(new Set());
  const autoSelectedRef = useRef(false);

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
      // If current user enabled "Принимать звонки только от PRO"
      if (currentUser.onlyProCalls) {
        const callerProfile = await chatService.getUserProfile(incoming.callerId);
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
    const chat = await chatService.getOrCreateDirectChat(currentUser, targetUser);
    setActiveChat(chat);
  };

  return (
    <div className="w-screen h-screen flex bg-[#09090b] text-zinc-100 font-sans overflow-hidden relative select-none">
      {/* Sidebar navigation */}
      <Sidebar
        activeChat={activeChat}
        onSelectChat={(chat) => setActiveChat(chat)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenNewGroup={() => setShowNewGroupModal(true)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full">
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
                <div className="font-semibold text-sm text-zinc-100">Проверка связи и звонка</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Проверить работу микрофона, камеры и звучание рингтонов
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

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
