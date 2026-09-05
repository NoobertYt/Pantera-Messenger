import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { chatService } from '../services/chatService';
import { ChatConversation, UserProfile } from '../types';
import { UserBadge } from './UserBadge';
import {
  Search,
  Plus,
  Users,
  Settings,
  MessageSquare,
  ShieldAlert,
  Circle,
  Clock,
  Sparkles,
  PhoneCall,
  UserPlus,
  UserCheck,
  Shield,
  Crown,
  User
} from 'lucide-react';

interface SidebarProps {
  activeChat: ChatConversation | null;
  onSelectChat: (chat: ChatConversation) => void;
  onOpenProfile: () => void;
  onOpenNewGroup: () => void;
  onOpenAdmin?: () => void;
  onViewUserProfile?: (user: UserProfile) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeChat,
  onSelectChat,
  onOpenProfile,
  onOpenNewGroup,
  onOpenAdmin,
  onViewUserProfile
}) => {
  const { currentUser, isUserBlocked, toggleContact, isContact, isAdmin, isPro } = useAuth();
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'contacts'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [allRegisteredUsers, setAllRegisteredUsers] = useState<UserProfile[]>([]);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, UserProfile>>({});
  const [isSearching, setIsSearching] = useState(false);

  // Saved contacts for current user
  const savedContacts = allRegisteredUsers.filter((u) => currentUser?.contacts?.includes(u.uid));

  // Subscribe to all registered users
  useEffect(() => {
    if (!currentUser) return;
    const unsub = chatService.subscribeToAllUsers(currentUser.uid, (users) => {
      setAllRegisteredUsers(users);
      setParticipantProfiles((prev) => {
        const next = { ...prev };
        users.forEach((u) => {
          next[u.uid] = u;
        });
        return next;
      });
    });
    return () => unsub();
  }, [currentUser?.uid]);

  // Subscribe to real-time chats
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = chatService.subscribeToChats(currentUser.uid, (updatedChats) => {
      setChats(updatedChats);

      // Resolve participant profiles for direct chats
      const uidsToFetch = new Set<string>();
      updatedChats.forEach((c) => {
        c.participants.forEach((uid) => {
          if (uid !== currentUser.uid) {
            uidsToFetch.add(uid);
          }
        });
      });

      uidsToFetch.forEach((uid) => {
        chatService.getUserProfile(uid).then((prof) => {
          if (prof) {
            setParticipantProfiles((prev) => ({ ...prev, [uid]: prof }));
          }
        });
      });
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Handle Search by @username or name
  useEffect(() => {
    if (!currentUser) return;
    const clean = searchQuery.trim();
    if (!clean) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      chatService.searchUsers(clean, currentUser.uid).then((results) => {
        setSearchResults(results);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser]);

  const handleStartDirectChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    const chat = await chatService.getOrCreateDirectChat(currentUser, targetUser);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    onSelectChat(chat);
  };

  const getOtherParticipant = (chat: ChatConversation): UserProfile | undefined => {
    if (!currentUser || chat.type !== 'direct') return undefined;
    const otherUid = chat.participants.find((id) => id !== currentUser.uid);
    return otherUid ? participantProfiles[otherUid] : undefined;
  };

  const formatLastMessageTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredChats = chats.filter((c) => {
    if (activeTab === 'direct') return c.type === 'direct';
    if (activeTab === 'groups') return c.type === 'group';
    return true;
  });

  return (
    <aside id="panther-sidebar" className={`w-full md:w-96 h-full ${activeChat ? 'hidden md:flex' : 'flex'} flex-col bg-[#0c0c0e] border-r border-zinc-800/50 select-none z-20`}>
      {/* App Header */}
      <div className="p-5 border-b border-zinc-800/30 flex items-center justify-between bg-[#0c0c0e]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 glow-purple-sm">
            <span className="text-xl">🐆</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 flex items-center gap-1.5">
              PANTERA
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            </h1>
            <div className="text-[10px] text-zinc-500 font-mono tracking-wider">
              {currentUser ? `@${currentUser.username}` : 'MESSENGER'}
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1.5">
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/40 transition-colors shadow-sm cursor-pointer"
              title="Панель Администратора"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onOpenNewGroup}
            className="p-2 rounded-xl bg-zinc-800/40 hover:bg-purple-600/20 text-zinc-400 hover:text-purple-300 border border-zinc-800 hover:border-purple-500/30 transition-colors cursor-pointer"
            title="Создать группу"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenProfile}
            className="p-2 rounded-xl bg-zinc-800/40 hover:bg-purple-600/20 text-zinc-400 hover:text-purple-300 border border-zinc-800 hover:border-purple-500/30 transition-colors cursor-pointer"
            title="Мой профиль и ЧС"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-zinc-800/30">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по @юзернейму или имени..."
            className="w-full bg-[#141417] border border-zinc-800/80 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-3 pt-2 pb-2 gap-1 border-b border-zinc-800/30">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'all'
              ? 'bg-purple-600/15 text-purple-200 border border-purple-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
          }`}
        >
          Все ({chats.length})
        </button>
        <button
          onClick={() => setActiveTab('direct')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'direct'
              ? 'bg-purple-600/15 text-purple-200 border border-purple-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
          }`}
        >
          Личные
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-purple-600/15 text-purple-200 border border-purple-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
          }`}
        >
          Группы
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'contacts'
              ? 'bg-purple-600/15 text-purple-200 border border-purple-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
          }`}
        >
          Контакты ({savedContacts.length})
        </button>
      </div>

      {/* Search Results Overlay or List */}
      {isSearching && (
        <div className="p-3 border-b border-zinc-800/50 bg-[#121215] max-h-64 overflow-y-auto">
          <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider mb-2">
            Найденные пользователи ({searchResults.length}):
          </div>
          {searchResults.length === 0 ? (
            <div className="text-xs text-zinc-500 py-3 text-center">
              По запросу «{searchQuery}» никого не найдено
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {searchResults.map((user) => {
                const inContacts = isContact(user.uid);
                return (
                  <div
                    key={user.uid}
                    className="flex items-center justify-between p-2 rounded-xl bg-[#18181c] hover:bg-purple-600/20 border border-zinc-800 hover:border-purple-500/30 transition"
                  >
                    <div
                      onClick={() => onViewUserProfile ? onViewUserProfile(user) : handleStartDirectChat(user)}
                      className="flex items-center gap-2.5 min-w-0 pr-2 cursor-pointer flex-1"
                      title="Посмотреть профиль"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-purple-500/40 hover:ring-2 hover:ring-purple-400 transition">
                          <img src={user.avatarUrl} alt={user.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        </div>
                        {user.isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border border-[#0c0c0e]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-bold text-zinc-200 truncate hover:text-purple-300">{user.displayName}</span>
                          <UserBadge user={user} size="sm" />
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">@{user.username}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {onViewUserProfile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewUserProfile(user);
                          }}
                          className="p-1.5 rounded-lg border bg-zinc-850 hover:bg-zinc-700 border-zinc-700/60 text-zinc-300 hover:text-white transition cursor-pointer"
                          title="Открыть профиль"
                        >
                          <User className="w-3.5 h-3.5 text-purple-400" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleContact(user.uid);
                        }}
                        className={`p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                          inContacts
                            ? 'bg-purple-900/40 border-purple-500/50 text-purple-300'
                            : 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700/60 text-zinc-300 hover:text-white'
                        }`}
                        title={inContacts ? 'Удалить из контактов' : 'Добавить в контакты'}
                      >
                        {inContacts ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[10px] font-semibold">В контактах</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5 text-zinc-400" />
                            <span className="text-[10px]">В контакты</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartDirectChat(user);
                        }}
                        className="text-[10px] font-semibold text-purple-300 bg-purple-600/20 hover:bg-purple-600 hover:text-white px-2.5 py-1.5 rounded-lg border border-purple-500/30 transition cursor-pointer"
                      >
                        Написать
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Chat List / Contacts List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {activeTab === 'contacts' ? (
          savedContacts.length === 0 ? (
            <div className="flex-1 flex flex-col p-4 text-center">
              <div className="p-4 rounded-2xl bg-[#141418] border border-zinc-800/80 mb-4">
                <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <div className="text-xs font-bold text-zinc-200">Список контактов пуст</div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  Найдите человека через поиск выше по @юзернейму или имени и нажмите «В контакты», чтобы добавить его.
                </div>
              </div>

              {allRegisteredUsers.length > 0 && (
                <div className="text-left">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Пользователи ({allRegisteredUsers.length}):
                  </div>
                  <div className="space-y-1.5">
                    {allRegisteredUsers.slice(0, 10).map((u) => (
                      <div
                        key={u.uid}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#141418] border border-zinc-800/80 hover:border-purple-500/30 transition"
                      >
                        <div
                          onClick={() => onViewUserProfile && onViewUserProfile(u)}
                          className="flex items-center gap-2 min-w-0 pr-2 cursor-pointer flex-1"
                          title="Посмотреть профиль"
                        >
                          <img src={u.avatarUrl} alt={u.displayName} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-purple-400 transition flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 truncate">
                              <span className="text-xs font-bold text-zinc-200 truncate hover:text-purple-300">{u.displayName}</span>
                              <UserBadge user={u} size="sm" />
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono truncate">@{u.username}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {onViewUserProfile && (
                            <button
                              type="button"
                              onClick={() => onViewUserProfile(u)}
                              className="p-1.5 rounded-lg border bg-zinc-800 hover:bg-zinc-700 border-zinc-700/60 text-zinc-300 hover:text-white transition cursor-pointer"
                              title="Открыть профиль"
                            >
                              <User className="w-3.5 h-3.5 text-purple-400" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleContact(u.uid)}
                            className="text-[10px] font-semibold text-purple-300 hover:text-white bg-purple-600/20 hover:bg-purple-600 px-2.5 py-1.5 rounded-lg border border-purple-500/30 transition flex items-center gap-1 cursor-pointer flex-shrink-0"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>В контакты</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            savedContacts.map((user) => (
              <div
                key={user.uid}
                id={`contact-${user.uid}`}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#141418] hover:bg-purple-600/15 border border-zinc-800/80 hover:border-purple-500/30 transition-all group"
              >
                <div
                  onClick={() => onViewUserProfile ? onViewUserProfile(user) : handleStartDirectChat(user)}
                  className="flex items-center gap-3 min-w-0 pr-2 cursor-pointer flex-1"
                  title="Посмотреть профиль"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-full overflow-hidden border border-purple-500/40 bg-zinc-800 hover:ring-2 hover:ring-purple-400 transition">
                      <img
                        src={user.avatarUrl}
                        alt={user.displayName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0c0c0e] ${
                        user.isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-zinc-600'
                      }`}
                      title={user.isOnline ? 'В сети' : 'Не в сети'}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-zinc-200 group-hover:text-purple-200 transition-colors truncate">
                        {user.displayName}
                      </span>
                      <UserBadge user={user} size="sm" />
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono truncate">
                      @{user.username}
                    </div>
                    {user.bio && (
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5 max-w-[160px]">
                        {user.bio}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {onViewUserProfile && (
                    <button
                      type="button"
                      onClick={() => onViewUserProfile(user)}
                      className="p-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                      title="Посмотреть профиль"
                    >
                      <User className="w-3.5 h-3.5 text-purple-400" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleContact(user.uid);
                    }}
                    className="p-1.5 rounded-lg border border-purple-500/40 bg-purple-900/30 text-purple-300 hover:text-red-400 hover:border-red-500/40 transition cursor-pointer"
                    title="Удалить из контактов"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartDirectChat(user);
                    }}
                    className="text-xs font-semibold text-purple-300 bg-purple-600/20 group-hover:bg-purple-600 group-hover:text-white px-3 py-1.5 rounded-xl border border-purple-500/30 transition-colors cursor-pointer"
                  >
                    Написать
                  </button>
                </div>
              </div>
            ))
          )
        ) : filteredChats.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
            <MessageSquare className="w-10 h-10 text-zinc-800 mb-3" />
            <span className="text-xs font-medium">Нет активных чатов</span>
            <span className="text-[11px] text-zinc-600 mt-1">
              Найдите контакт во вкладке «Контакты» или создайте группу
            </span>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isSelected = activeChat?.id === chat.id;
            const isGroup = chat.type === 'group';
            const otherUser = getOtherParticipant(chat);
            const isBlocked = otherUser ? isUserBlocked(otherUser.uid) : false;

            const chatTitle = isGroup
              ? chat.name || 'Группа'
              : otherUser?.displayName || 'Пользователь';

            const chatAvatar = isGroup
              ? chat.avatarUrl || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80'
              : otherUser?.avatarUrl || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80';

            const isOnline = otherUser?.isOnline;

            return (
              <div
                key={chat.id}
                id={`chat-item-${chat.id}`}
                onClick={() => onSelectChat(chat)}
                className={`flex items-center gap-3.5 p-3 rounded-2xl transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-purple-600/10 border border-purple-500/20 shadow-md shadow-purple-950/20'
                    : 'hover:bg-zinc-800/40 border border-transparent opacity-85 hover:opacity-100'
                }`}
              >
                {/* Avatar with Online/Offline Indicator */}
                <div
                  className={`relative flex-shrink-0 ${!isGroup && otherUser && onViewUserProfile ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                  onClick={(e) => {
                    if (!isGroup && otherUser && onViewUserProfile) {
                      e.stopPropagation();
                      onViewUserProfile(otherUser);
                    }
                  }}
                  title={!isGroup && otherUser ? `Профиль @${otherUser.username}` : undefined}
                >
                  <div className={`w-12 h-12 rounded-full overflow-hidden border bg-zinc-800 ${
                    isSelected ? 'border-purple-500/50' : 'border-zinc-700/60'
                  }`}>
                    <img
                      src={chatAvatar}
                      alt={chatTitle}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Online indicator */}
                  {!isGroup && (
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0c0c0e] ${
                        isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'
                      }`}
                      title={isOnline ? 'В сети' : 'Не в сети'}
                    />
                  )}

                  {isGroup && (
                    <span className="absolute bottom-0 right-0 p-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300">
                      👥
                    </span>
                  )}
                </div>

                {/* Text info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className={`font-semibold text-sm truncate flex items-center gap-1.5 min-w-0 ${
                      isSelected ? 'text-purple-200' : 'text-zinc-200'
                    }`}>
                      <span className="truncate">{chatTitle}</span>
                      {!isGroup && otherUser && <UserBadge user={otherUser} size="sm" />}
                      {isBlocked && (
                        <span className="text-[9px] bg-red-950/80 text-red-400 px-1.5 py-0.2 rounded border border-red-800/60 flex-shrink-0">
                          ЧС
                        </span>
                      )}
                    </div>
                    {isOnline && !isGroup ? (
                      <span className="text-[10px] text-purple-400 font-medium uppercase ml-2 flex-shrink-0">
                        Online
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-mono ml-2 flex-shrink-0">
                        {formatLastMessageTime(chat.lastMessage?.createdAt || chat.updatedAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm text-zinc-400">
                    <span className="truncate pr-2 text-xs text-zinc-400">
                      {chat.lastMessage ? (
                        <span>
                          {chat.lastMessage.senderId === currentUser?.uid ? (
                            <span className="text-purple-400 font-semibold">Вы: </span>
                          ) : isGroup ? (
                            <span className="text-zinc-300 font-medium">{chat.lastMessage.senderName}: </span>
                          ) : null}
                          {chat.lastMessage.text}
                        </span>
                      ) : (
                        <span className="text-zinc-500 italic">Чат создан</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Current User footer card */}
      {currentUser && (
        <div
          onClick={onOpenProfile}
          className="p-4 border-t border-zinc-800/50 bg-[#0a0a0b] flex items-center justify-between hover:bg-zinc-800/30 transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800">
                <img src={currentUser.avatarUrl} alt={currentUser.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0a0a0b]" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-100 uppercase tracking-tight truncate max-w-[130px]">
                {currentUser.displayName}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1.5">
                <span>@{currentUser.username}</span>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0">
            <UserBadge user={currentUser} size="md" />
          </div>
        </div>
      )}
    </aside>
  );
};
