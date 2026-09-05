import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, ChatConversation, ChatMessage, CallSession, MessageType, RtcCandidate, CallStatus } from '../types';
import { soundService } from './audioService';

// Default avatars
export const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1548802673-380ab8ebc7b7?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1561948955-570b270e7c36?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=200&auto=format&fit=crop&q=80',
];

const FORMER_DEMO_UIDS = ['panther_support_bot', 'alex_cyber_user', 'lisa_night_user'];

// Local state caching key
const LOCAL_STORAGE_KEY_CHATS = 'panther_chats_cache';
const LOCAL_STORAGE_KEY_MESSAGES = 'panther_messages_cache';
const LOCAL_STORAGE_KEY_USERS = 'panther_users_cache';

// Helper to recursively remove undefined properties before sending to Firestore
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null) {
          clean[key] = sanitizeForFirestore(value);
        } else {
          clean[key] = value;
        }
      }
    }
    return clean as T;
  }
  return data;
}

export class ChatService {
  private localUsers: Map<string, UserProfile> = new Map();
  private localChats: Map<string, ChatConversation> = new Map();
  private localMessages: Map<string, ChatMessage[]> = new Map();
  private messageListeners: Map<string, Set<(messages: ChatMessage[]) => void>> = new Map();

  constructor() {
    this.initFromLocalStorage();
  }

  // Notify all UI listeners registered for a specific chat
  private notifyMessageListeners(chatId: string) {
    const listeners = this.messageListeners.get(chatId);
    if (!listeners || listeners.size === 0) return;
    const msgs = this.localMessages.get(chatId) || [];
    const copy = [...msgs];
    listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.warn('Listener callback notification error:', err);
      }
    });
  }

  private initFromLocalStorage() {
    try {
      const savedUsers = localStorage.getItem(LOCAL_STORAGE_KEY_USERS);
      if (savedUsers) {
        const parsed: UserProfile[] = JSON.parse(savedUsers);
        parsed.forEach((u) => {
          if (!FORMER_DEMO_UIDS.includes(u.uid)) {
            this.localUsers.set(u.uid, u);
          }
        });
      }

      const savedChats = localStorage.getItem(LOCAL_STORAGE_KEY_CHATS);
      if (savedChats) {
        const parsed: ChatConversation[] = JSON.parse(savedChats);
        parsed.forEach((c) => {
          // Exclude any chats with former demo bot
          if (!c.participants.includes('panther_support_bot')) {
            this.localChats.set(c.id, c);
          }
        });
      }

      const savedMessages = localStorage.getItem(LOCAL_STORAGE_KEY_MESSAGES);
      if (savedMessages) {
        const parsed: Record<string, ChatMessage[]> = JSON.parse(savedMessages);
        Object.entries(parsed).forEach(([chatId, msgs]) => {
          this.localMessages.set(chatId, msgs);
        });
      }
    } catch {
      // fallback safe
    }
  }

  private saveToLocalStorage() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(Array.from(this.localUsers.values())));
      localStorage.setItem(LOCAL_STORAGE_KEY_CHATS, JSON.stringify(Array.from(this.localChats.values())));
      
      const msgsObj: Record<string, ChatMessage[]> = {};
      this.localMessages.forEach((msgs, chatId) => {
        msgsObj[chatId] = msgs;
      });
      localStorage.setItem(LOCAL_STORAGE_KEY_MESSAGES, JSON.stringify(msgsObj));
    } catch {
      // ignore quota errors
    }
  }

  // Save or update user profile
  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.localUsers.set(profile.uid, profile);
    this.saveToLocalStorage();

    try {
      const userRef = doc(db, 'users', profile.uid);
      await setDoc(userRef, sanitizeForFirestore(profile), { merge: true });
    } catch (err) {
      console.warn('Firestore user save notice:', err);
    }
  }

  // Get user profile
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (this.localUsers.has(uid)) {
      return this.localUsers.get(uid)!;
    }
    try {
      const docRef = doc(db, 'users', uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        this.localUsers.set(uid, data);
        return data;
      }
    } catch {
      // ignore
    }
    return null;
  }

  // Search users by @username or name
  async searchUsers(searchQuery: string, currentUserId: string): Promise<UserProfile[]> {
    const cleanQuery = searchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!cleanQuery) return [];

    const results: UserProfile[] = [];

    // Search local
    this.localUsers.forEach((u) => {
      if (u.uid === currentUserId) return;
      const username = u.username.toLowerCase();
      const displayName = u.displayName.toLowerCase();
      if (username.includes(cleanQuery) || displayName.includes(cleanQuery)) {
        results.push(u);
      }
    });

    // Try Firestore query
    try {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      snap.forEach((docSnap) => {
        const u = docSnap.data() as UserProfile;
        if (u.uid !== currentUserId && !results.some((r) => r.uid === u.uid)) {
          if (
            u.username?.toLowerCase().includes(cleanQuery) ||
            u.displayName?.toLowerCase().includes(cleanQuery)
          ) {
            results.push(u);
            this.localUsers.set(u.uid, u);
          }
        }
      });
    } catch {
      // local search suffices
    }

    return results;
  }

  // Get user profile strictly by @username
  async getUserByUsername(usernameQuery: string): Promise<UserProfile | null> {
    const clean = usernameQuery.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return null;

    // Check local cache first
    for (const user of this.localUsers.values()) {
      if (user.username && user.username.toLowerCase() === clean) {
        return user;
      }
    }

    // Check Firestore
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', clean));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = snap.docs[0].data() as UserProfile;
        this.localUsers.set(found.uid, found);
        return found;
      }

      // Also try fallback scan in case of case-sensitivity
      const allSnap = await getDocs(usersRef);
      for (const d of allSnap.docs) {
        const u = d.data() as UserProfile;
        if (u.username && u.username.toLowerCase() === clean) {
          this.localUsers.set(u.uid, u);
          return u;
        }
      }
    } catch (err) {
      console.warn('getUserByUsername query error:', err);
    }

    return null;
  }

  // Subscribe to all registered users in real-time
  subscribeToAllUsers(currentUserId: string, onUpdate: (users: UserProfile[]) => void): () => void {
    const filterAndSort = () => {
      const list: UserProfile[] = [];
      this.localUsers.forEach((u) => {
        if (u.uid !== currentUserId && !FORMER_DEMO_UIDS.includes(u.uid)) {
          list.push(u);
        }
      });
      list.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return (b.lastSeen || 0) - (a.lastSeen || 0);
      });
      return list;
    };

    onUpdate(filterAndSort());

    let unsubscribe = () => {};
    try {
      const usersRef = collection(db, 'users');
      unsubscribe = onSnapshot(usersRef, (snapshot) => {
        snapshot.forEach((docSnap) => {
          const u = docSnap.data() as UserProfile;
          if (u && u.uid && !FORMER_DEMO_UIDS.includes(u.uid)) {
            this.localUsers.set(u.uid, u);
          }
        });
        this.saveToLocalStorage();
        onUpdate(filterAndSort());
      }, (err) => {
        console.warn('Realtime users subscription note:', err);
        onUpdate(filterAndSort());
      });
    } catch {
      onUpdate(filterAndSort());
    }

    return () => unsubscribe();
  }

  // Ensure username is completely unique across the entire database
  // If taken, appends '1', '2', etc. so that the newest user gets the numerical suffix
  async findUniqueUsername(desiredUsername: string, excludeUid?: string): Promise<string> {
    const rawClean = desiredUsername.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    const base = rawClean.length > 0 ? rawClean : 'user';

    const existingUsernames = new Set<string>();
    this.localUsers.forEach((u) => {
      if (u.uid !== excludeUid && u.username) {
        existingUsernames.add(u.username.toLowerCase());
      }
    });

    try {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.uid !== excludeUid && u.username) {
          existingUsernames.add(u.username.toLowerCase());
        }
      });
    } catch {
      // local fallback
    }

    if (!existingUsernames.has(base)) {
      return base;
    }

    let counter = 1;
    let candidate = `${base}${counter}`;
    while (existingUsernames.has(candidate)) {
      counter++;
      candidate = `${base}${counter}`;
    }
    return candidate;
  }

  // Toggle user in contacts list
  async toggleContact(currentUserUid: string, targetUid: string): Promise<boolean> {
    const current = this.localUsers.get(currentUserUid);
    const contacts = current?.contacts || [];
    const isAlreadyInContacts = contacts.includes(targetUid);
    const newContacts = isAlreadyInContacts
      ? contacts.filter((id) => id !== targetUid)
      : [...contacts, targetUid];

    if (current) {
      current.contacts = newContacts;
      this.localUsers.set(currentUserUid, current);
      this.saveToLocalStorage();
    }

    try {
      const userRef = doc(db, 'users', currentUserUid);
      await updateDoc(userRef, {
        contacts: isAlreadyInContacts ? arrayRemove(targetUid) : arrayUnion(targetUid)
      });
    } catch (err) {
      console.warn('Firestore toggleContact note:', err);
    }

    return !isAlreadyInContacts;
  }

  // Load user contacts
  async getUserContacts(contactUids: string[]): Promise<UserProfile[]> {
    if (!contactUids || contactUids.length === 0) return [];
    const list: UserProfile[] = [];
    for (const uid of contactUids) {
      const prof = await this.getUserProfile(uid);
      if (prof) list.push(prof);
    }
    return list;
  }

  // Admin: update any user's profile
  async adminUpdateUser(targetUid: string, data: Partial<UserProfile>): Promise<void> {
    const existing = this.localUsers.get(targetUid) || (await this.getUserProfile(targetUid));
    if (existing) {
      const updated = { ...existing, ...data };
      this.localUsers.set(targetUid, updated);
      this.saveToLocalStorage();
    }

    try {
      const userRef = doc(db, 'users', targetUid);
      await setDoc(userRef, sanitizeForFirestore(data), { merge: true });
    } catch (err) {
      console.warn('Admin update user note:', err);
    }
  }

  // Admin: Grant or Revoke PRO subscription
  async adminSetPro(
    targetUid: string,
    isPro: boolean,
    durationDays?: number | null,
    badgeIcon?: string
  ): Promise<void> {
    const now = Date.now();
    const proUntil = durationDays && durationDays > 0 ? now + durationDays * 24 * 3600 * 1000 : null;

    const data: Partial<UserProfile> = {
      isPro,
      proUntil: isPro ? proUntil : null,
      proBadgeIcon: isPro ? (badgeIcon || '👑') : undefined,
      proGrantedAt: isPro ? now : undefined
    };

    await this.adminUpdateUser(targetUid, data);
  }

  // Admin: Ban or Unban user
  async adminBanUser(
    targetUid: string,
    isBanned: boolean,
    banDurationHours?: number | null,
    reason?: string
  ): Promise<void> {
    const now = Date.now();
    const bannedUntil =
      banDurationHours && banDurationHours > 0 ? now + banDurationHours * 3600 * 1000 : null;

    const data: Partial<UserProfile> = {
      isBanned,
      bannedUntil: isBanned ? bannedUntil : null,
      banReason: isBanned ? (reason || 'Нарушение правил сообщества') : undefined,
      bannedAt: isBanned ? now : undefined
    };

    await this.adminUpdateUser(targetUid, data);
  }

  // Admin: Freeze or Unfreeze user (temporarily mute)
  async adminFreezeUser(
    targetUid: string,
    isFrozen: boolean,
    freezeDurationMinutes?: number | null,
    reason?: string
  ): Promise<void> {
    const now = Date.now();
    const frozenUntil =
      freezeDurationMinutes && freezeDurationMinutes > 0
        ? now + freezeDurationMinutes * 60 * 1000
        : null;

    const data: Partial<UserProfile> = {
      isFrozen,
      frozenUntil: isFrozen ? frozenUntil : null,
      freezeReason: isFrozen ? (reason || 'Временная заморозка администратором') : undefined,
      frozenAt: isFrozen ? now : undefined
    };

    await this.adminUpdateUser(targetUid, data);
  }

  // Update online presence
  async updatePresence(uid: string, isOnline: boolean): Promise<void> {
    const existing = this.localUsers.get(uid);
    if (existing) {
      existing.isOnline = isOnline;
      existing.lastSeen = Date.now();
      this.saveToLocalStorage();
    }
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        isOnline,
        lastSeen: Date.now()
      });
    } catch {
      // ignore
    }
  }

  // Block or Unblock user
  async toggleBlockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
    const user = this.localUsers.get(currentUserId);
    if (!user) return false;

    const isBlocked = user.blockedUsers.includes(targetUserId);
    if (isBlocked) {
      user.blockedUsers = user.blockedUsers.filter((id) => id !== targetUserId);
    } else {
      user.blockedUsers.push(targetUserId);
    }
    this.saveToLocalStorage();

    try {
      const userRef = doc(db, 'users', currentUserId);
      await updateDoc(userRef, {
        blockedUsers: isBlocked ? arrayRemove(targetUserId) : arrayUnion(targetUserId)
      });
    } catch {
      // ignore
    }

    return !isBlocked;
  }

  // Listen to user chats
  subscribeToChats(currentUserId: string, onUpdate: (chats: ChatConversation[]) => void): () => void {
    // Return cached immediately
    const filterAndSort = () => {
      const chats: ChatConversation[] = [];
      this.localChats.forEach((chat) => {
        if (chat.participants.includes(currentUserId)) {
          chats.push(chat);
        }
      });
      chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return chats;
    };

    onUpdate(filterAndSort());

    // Firestore real-time listener
    let unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', currentUserId)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = { id: change.doc.id, ...change.doc.data() } as ChatConversation;
            if (change.type === 'removed') {
              this.localChats.delete(data.id);
            } else {
              this.localChats.set(data.id, data);
            }
          });
          this.saveToLocalStorage();
          onUpdate(filterAndSort());
        },
        (error) => {
          console.warn('Firestore chats subscription note:', error.message);
          // Keep using local
          onUpdate(filterAndSort());
        }
      );
    } catch {
      onUpdate(filterAndSort());
    }

    return () => {
      unsubscribe();
    };
  }

  // Listen to messages for a chat
  subscribeToMessages(
    chatId: string,
    currentUserId: string,
    onUpdate: (messages: ChatMessage[]) => void
  ): () => void {
    // 1. Register listener in local messageListeners set
    let listeners = this.messageListeners.get(chatId);
    if (!listeners) {
      listeners = new Set();
      this.messageListeners.set(chatId, listeners);
    }
    listeners.add(onUpdate);

    // 2. Immediately deliver whatever is currently cached in memory
    const getLocal = () => this.localMessages.get(chatId) || [];
    onUpdate([...getLocal()]);

    // 3. Real-time Firestore subcollection listener
    let unsubscribe = () => {};
    try {
      const messagesCollection = collection(db, `chats/${chatId}/messages`);

      unsubscribe = onSnapshot(
        messagesCollection,
        (snapshot) => {
          const remoteMsgs: ChatMessage[] = [];
          snapshot.forEach((d) => {
            remoteMsgs.push({ id: d.id, ...d.data() } as ChatMessage);
          });

          // Merge with local messages by id to preserve any local in-flight messages
          const existing = this.localMessages.get(chatId) || [];
          const msgMap = new Map<string, ChatMessage>();
          existing.forEach((m) => msgMap.set(m.id, m));
          remoteMsgs.forEach((m) => msgMap.set(m.id, m));

          const merged = Array.from(msgMap.values()).sort(
            (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
          );

          this.localMessages.set(chatId, merged);
          this.saveToLocalStorage();
          this.notifyMessageListeners(chatId);
        },
        (error) => {
          console.warn('Firestore messages subscription note:', error.message);
          onUpdate([...getLocal()]);
        }
      );
    } catch {
      onUpdate([...getLocal()]);
    }

    return () => {
      listeners?.delete(onUpdate);
      unsubscribe();
    };
  }

  // Send a message
  async sendMessage(params: {
    chatId: string;
    sender: UserProfile;
    text?: string;
    photoUrl?: string;
    stickerUrl?: string;
    stickerEmoji?: string;
    type: MessageType;
    replyTo?: { id: string; text: string; senderName: string };
  }): Promise<ChatMessage> {
    const { chatId, sender, text, photoUrl, stickerUrl, stickerEmoji, type, replyTo } = params;

    const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();

    const sEmail = sender.email?.trim().toLowerCase() || '';
    const sUsername = sender.username?.trim().toLowerCase() || '';
    const isAdmin = (sender.role === 'admin') || (sender.isAdmin === true) || sEmail === 'admin123123@admin.com' || sUsername === 'admin123123';
    const isPro = !isAdmin && Boolean(sender.isPro) && (!sender.proUntil || Date.now() <= sender.proUntil);
    const isBanned = Boolean(sender.isBanned) && (!sender.bannedUntil || Date.now() < sender.bannedUntil);

    if (isBanned) {
      throw new Error('Ваш аккаунт заблокирован (БАН). Отправка сообщений запрещена.');
    }

    const newMsg: ChatMessage = {
      id: messageId,
      chatId,
      senderId: sender.uid,
      senderName: sender.displayName || sender.username,
      senderAvatar: sender.avatarUrl,
      senderIsAdmin: isAdmin,
      senderIsPro: isPro,
      senderIsBanned: isBanned,
      senderProBadge: sender.proBadgeIcon || (isPro ? '👑' : undefined),
      text: text || '',
      type,
      createdAt: now,
      readBy: [sender.uid]
    };

    // Only attach defined optional fields
    if (photoUrl) newMsg.photoUrl = photoUrl;
    if (stickerUrl) newMsg.stickerUrl = stickerUrl;
    if (stickerEmoji) newMsg.stickerEmoji = stickerEmoji;
    if (replyTo) newMsg.replyTo = replyTo;

    // 1. Update local cache immediately
    const currentMsgs = this.localMessages.get(chatId) || [];
    currentMsgs.push(newMsg);
    this.localMessages.set(chatId, currentMsgs);

    // 2. Update local chat lastMessage
    const lastMsgSnippet =
      type === 'image'
        ? '📷 Фотография'
        : type === 'sticker'
        ? `${stickerEmoji || '🐾'} Стикер`
        : text || '';

    const chat = this.localChats.get(chatId);
    if (chat) {
      chat.lastMessage = {
        text: lastMsgSnippet,
        senderId: sender.uid,
        senderName: sender.displayName,
        createdAt: now,
        type
      };
      chat.updatedAt = now;
    }
    this.saveToLocalStorage();

    // 3. IMMEDIATELY notify all UI listeners (0ms optimistic render)
    this.notifyMessageListeners(chatId);

    // 4. Play sent audio sound
    soundService.playMessageSent();

    // 5. Sync to Firestore with sanitization (strips all undefined fields)
    try {
      // Ensure chat doc exists in Firestore with merge: true
      const chatRef = doc(db, 'chats', chatId);
      if (chat) {
        await setDoc(
          chatRef,
          sanitizeForFirestore({
            ...chat,
            lastMessage: chat.lastMessage,
            updatedAt: now
          }),
          { merge: true }
        );
      } else {
        await setDoc(
          chatRef,
          {
            id: chatId,
            lastMessage: {
              text: lastMsgSnippet,
              senderId: sender.uid,
              senderName: sender.displayName,
              createdAt: now,
              type
            },
            updatedAt: now
          },
          { merge: true }
        );
      }

      // Save message in subcollection
      const msgRef = doc(db, `chats/${chatId}/messages`, messageId);
      await setDoc(msgRef, sanitizeForFirestore(newMsg));
    } catch (err) {
      console.warn('Firestore message save note:', err);
    }

    return newMsg;
  }

  // Create or get direct 1-on-1 chat
  async getOrCreateDirectChat(currentUser: UserProfile, targetUser: UserProfile): Promise<ChatConversation> {
    // Check if chat already exists
    let existingChat: ChatConversation | undefined;
    this.localChats.forEach((c) => {
      if (
        c.type === 'direct' &&
        c.participants.includes(currentUser.uid) &&
        c.participants.includes(targetUser.uid)
      ) {
        existingChat = c;
      }
    });

    if (existingChat) {
      return existingChat;
    }

    const chatId = 'direct_' + [currentUser.uid, targetUser.uid].sort().join('_');
    const now = Date.now();

    const newChat: ChatConversation = {
      id: chatId,
      type: 'direct',
      participants: [currentUser.uid, targetUser.uid],
      createdAt: now,
      updatedAt: now
    };

    this.localChats.set(chatId, newChat);
    this.localUsers.set(targetUser.uid, targetUser);
    this.saveToLocalStorage();

    try {
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, newChat, { merge: true });
    } catch {
      // local exists
    }

    return newChat;
  }

  // Create group chat
  async createGroupChat(
    creator: UserProfile,
    name: string,
    avatarUrl: string,
    description: string,
    memberUids: string[]
  ): Promise<ChatConversation> {
    const chatId = 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = Date.now();

    const participants = Array.from(new Set([creator.uid, ...memberUids]));

    const newGroup: ChatConversation = {
      id: chatId,
      type: 'group',
      name: name.trim() || 'Новая группа',
      avatarUrl: avatarUrl || 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&auto=format&fit=crop&q=80',
      description: description.trim(),
      creatorId: creator.uid,
      adminIds: [creator.uid],
      participants,
      createdAt: now,
      updatedAt: now,
      lastMessage: {
        text: `Группа «${name}» создана`,
        senderId: creator.uid,
        senderName: creator.displayName,
        createdAt: now,
        type: 'text'
      }
    };

    this.localChats.set(chatId, newGroup);

    // Initial system greeting message
    const msgId = 'msg_sys_' + now;
    const initialMsg: ChatMessage = {
      id: msgId,
      chatId,
      senderId: creator.uid,
      senderName: 'Система',
      text: `👋 ${creator.displayName} создал(а) группу «${name}». Добро пожаловать!`,
      type: 'text',
      createdAt: now
    };
    this.localMessages.set(chatId, [initialMsg]);
    this.saveToLocalStorage();

    try {
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, newGroup);

      const msgRef = doc(db, `chats/${chatId}/messages`, msgId);
      await setDoc(msgRef, initialMsg);
    } catch {
      // local exists
    }

    return newGroup;
  }

  // WebRTC Call Signaling Methods
  async initiateCall(call: CallSession): Promise<void> {
    try {
      const callRef = doc(db, 'calls', call.id);
      await setDoc(callRef, sanitizeForFirestore({
        ...call,
        callerCandidates: [],
        receiverCandidates: []
      }));
    } catch (err) {
      console.warn('Initiate call notice:', err);
    }
  }

  // Subscribe to incoming calls for the current user
  subscribeToIncomingCalls(currentUserId: string, onIncomingCall: (call: CallSession) => void): () => void {
    let unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'calls'),
        where('receiverId', '==', currentUserId),
        where('status', 'in', ['dialing', 'incoming'])
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const call = { id: change.doc.id, ...change.doc.data() } as CallSession;
            // Only notify if call is active and was created within the last 45 seconds
            const ageMs = Date.now() - (call.startedAt || 0);
            if ((call.status === 'dialing' || call.status === 'incoming') && ageMs < 45000) {
              onIncomingCall(call);
            }
          }
        });
      }, (err) => {
        console.warn('Incoming calls listener notice:', err);
      });
    } catch {
      // safe fallback
    }
    return () => unsubscribe();
  }

  // Subscribe to specific call document updates
  subscribeToCall(callId: string, onUpdate: (call: CallSession | null) => void): () => void {
    let unsubscribe = () => {};
    try {
      const callRef = doc(db, 'calls', callId);
      unsubscribe = onSnapshot(callRef, (docSnap) => {
        if (docSnap.exists()) {
          onUpdate({ id: docSnap.id, ...docSnap.data() } as CallSession);
        } else {
          onUpdate(null);
        }
      }, (err) => {
        console.warn('Call updates listener notice:', err);
      });
    } catch {
      // safe fallback
    }
    return () => unsubscribe();
  }

  // Update call state (e.g. SDP offer/answer, connected status)
  async updateCall(callId: string, data: Partial<CallSession>): Promise<void> {
    try {
      const callRef = doc(db, 'calls', callId);
      await updateDoc(callRef, sanitizeForFirestore(data));
    } catch (err) {
      console.warn('Update call notice:', err);
    }
  }

  // Add ICE Candidate
  async addCallCandidate(callId: string, role: 'caller' | 'receiver', candidate: RtcCandidate): Promise<void> {
    try {
      const callRef = doc(db, 'calls', callId);
      const fieldName = role === 'caller' ? 'callerCandidates' : 'receiverCandidates';
      await updateDoc(callRef, {
        [fieldName]: arrayUnion(candidate)
      });
    } catch (err) {
      console.warn('Add call candidate notice:', err);
    }
  }

  // End or decline call
  async endCall(callId: string, status: CallStatus = 'ended', durationSec?: number): Promise<void> {
    try {
      const callRef = doc(db, 'calls', callId);
      await updateDoc(callRef, {
        status,
        duration: durationSec || 0,
        endedAt: Date.now()
      });
    } catch (err) {
      console.warn('End call notice:', err);
    }
  }

  // Log call in the chat message stream
  async logCallInChat(
    chatId: string,
    caller: UserProfile,
    callType: 'audio' | 'video',
    statusText: string
  ): Promise<void> {
    const text = callType === 'video' ? `📹 Видеовызов (${statusText})` : `📞 Голосовой вызов (${statusText})`;
    await this.sendMessage({
      chatId,
      sender: caller,
      text,
      type: 'call_log'
    });
  }
}

export const chatService = new ChatService();
