export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username: string; // Telegram-style @username without leading @
  avatarUrl: string;
  bio: string;
  isOnline: boolean;
  lastSeen: number; // timestamp ms
  blockedUsers: string[]; // array of UIDs blocked by this user
  contacts?: string[]; // array of UIDs saved in contacts
  createdAt: number;

  // Roles & Admin
  role?: string;
  isAdmin?: boolean;

  // PRO Subscription
  isPro?: boolean;
  proUntil?: number | null; // timestamp ms or null for permanent
  proBadgeIcon?: string; // e.g. '👑', '💎', '⚡', '🔥', '⭐'
  proGrantedAt?: number;
  onlyProCanMessage?: boolean; // When true, only users with isPro (or admin) can send messages in direct chats to this user
  onlyProCalls?: boolean; // When true, only users with isPro (or admin) can initiate audio/video calls to this user

  // Ban System (Account Lockout)
  isBanned?: boolean;
  bannedUntil?: number | null; // timestamp ms or null for permanent
  banReason?: string;
  bannedAt?: number;

  // Freeze System (Read-Only Mode)
  isFrozen?: boolean;
  frozenUntil?: number | null; // timestamp ms or null for permanent
  freezeReason?: string;
  frozenAt?: number;
}

export type MessageType = 'text' | 'image' | 'sticker' | 'call_log';

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderIsPro?: boolean;
  senderIsAdmin?: boolean;
  senderIsBanned?: boolean;
  senderProBadge?: string;
  text?: string;
  photoUrl?: string;
  stickerUrl?: string;
  stickerEmoji?: string;
  type: MessageType;
  createdAt: number;
  readBy?: string[];
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  };
}

export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  name?: string; // for groups
  avatarUrl?: string; // for groups
  description?: string; // for groups
  creatorId?: string; // for groups
  participants: string[]; // array of UIDs
  adminIds?: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    createdAt: number;
    type: MessageType;
  };
  createdAt: number;
  updatedAt: number;
}

export type CallStatus = 'dialing' | 'incoming' | 'connected' | 'ended' | 'declined';

export interface RtcCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string;
  chatId: string;
  type: 'audio' | 'video';
  status: CallStatus;
  offer?: { type: string; sdp: string } | null;
  answer?: { type: string; sdp: string } | null;
  callerCandidates?: RtcCandidate[];
  receiverCandidates?: RtcCandidate[];
  startedAt?: number;
  connectedAt?: number;
  duration?: number;
}

export interface StickerItem {
  id: string;
  category: 'emoji' | 'cats' | 'moods' | 'reactions' | 'vip';
  name: string;
  emoji: string;
  gradient: string;
  quote?: string;
  isVipOnly?: boolean;
}
