import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { chatService, DEFAULT_AVATARS } from '../services/chatService';
import { isUserAdmin, isUserPro, isUserBanned, isUserFrozen } from '../components/UserBadge';

interface AuthContextType {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  isPro: boolean;
  isBanned: boolean;
  isFrozen: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string, username: string, avatarUrl?: string) => Promise<string>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<UserProfile>;
  toggleBlock: (targetUid: string) => Promise<boolean>;
  isUserBlocked: (targetUid: string) => boolean;
  toggleContact: (targetUid: string) => Promise<boolean>;
  isContact: (targetUid: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_USER_STORAGE_KEY = 'panther_current_active_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load initial local session if exists
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_USER_STORAGE_KEY);
      if (saved) {
        const parsed: UserProfile = JSON.parse(saved);
        // Ensure no leftover demo bot users
        if (!['panther_support_bot', 'alex_cyber_user', 'lisa_night_user'].includes(parsed.uid)) {
          setCurrentUser(parsed);
        } else {
          localStorage.removeItem(LOCAL_USER_STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const existingProfile = await chatService.getUserProfile(user.uid);
        if (existingProfile) {
          const updated = {
            ...existingProfile,
            isOnline: true,
            lastSeen: Date.now()
          };
          setCurrentUser(updated);
          localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(updated));
          chatService.updatePresence(user.uid, true);
        } else {
          // New profile for authenticated user
          const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
          const generatedUsername = (user.email ? user.email.split('@')[0] : 'user_' + user.uid.substring(0, 5))
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '');

          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || `${generatedUsername}@messenger.im`,
            displayName: user.displayName || generatedUsername || 'Пользователь',
            username: generatedUsername,
            avatarUrl: user.photoURL || randomAvatar,
            bio: 'Пользуюсь мессенджером 💬',
            isOnline: true,
            lastSeen: Date.now(),
            blockedUsers: [],
            createdAt: Date.now()
          };

          await chatService.saveUserProfile(newProfile);
          setCurrentUser(newProfile);
          localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(newProfile));
        }
      } else {
        const saved = localStorage.getItem(LOCAL_USER_STORAGE_KEY);
        if (!saved) {
          setCurrentUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Heartbeat online presence
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      chatService.updatePresence(currentUser.uid, true);
    }, 45000);

    const handleBeforeUnload = () => {
      chatService.updatePresence(currentUser.uid, false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser?.uid]);

  const loginWithEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    let profile = await chatService.getUserProfile(cred.user.uid);
    if (!profile) {
      const generatedUsername = (cred.user.email ? cred.user.email.split('@')[0] : 'user_' + cred.user.uid.substring(0, 5))
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      profile = {
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: cred.user.displayName || generatedUsername,
        username: generatedUsername,
        avatarUrl: DEFAULT_AVATARS[0],
        bio: 'Пользуюсь мессенджером 💬',
        isOnline: true,
        lastSeen: Date.now(),
        blockedUsers: [],
        createdAt: Date.now()
      };
      await chatService.saveUserProfile(profile);
    }
    setCurrentUser(profile);
    localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(profile));
    chatService.updatePresence(profile.uid, true);
  };

  // Real-time listener for current user's profile document (for instant ban, freeze, pro, or username changes by admin)
  useEffect(() => {
    if (!currentUser?.uid) return;
    let unsub = () => {};
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      unsub = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          const remoteData = snap.data() as UserProfile;
          setCurrentUser((prev) => {
            if (!prev) return remoteData;
            return {
              ...prev,
              ...remoteData
            };
          });
          localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(remoteData));
        }
      });
    } catch {
      // offline fallback
    }
    return () => unsub();
  }, [currentUser?.uid]);

  const registerWithEmail = async (
    email: string,
    pass: string,
    displayName: string,
    username: string,
    avatarUrl?: string
  ): Promise<string> => {
    const rawUsername = username.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    const cleanUsername = await chatService.findUniqueUsername(rawUsername);
    const cleanDisplayName = displayName.trim() || cleanUsername;
    const finalAvatar = avatarUrl || DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];

    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      email: cred.user.email || email.trim(),
      displayName: cleanDisplayName,
      username: cleanUsername,
      avatarUrl: finalAvatar,
      bio: 'Пользуюсь мессенджером 💬',
      isOnline: true,
      lastSeen: Date.now(),
      blockedUsers: [],
      contacts: [],
      createdAt: Date.now()
    };
    await chatService.saveUserProfile(newProfile);
    setCurrentUser(newProfile);
    localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(newProfile));
    chatService.updatePresence(newProfile.uid, true);
    return cleanUsername;
  };

  const logout = async () => {
    if (currentUser) {
      await chatService.updatePresence(currentUser.uid, false);
    }
    localStorage.removeItem(LOCAL_USER_STORAGE_KEY);
    setCurrentUser(null);
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  };

  const updateProfile = async (data: Partial<UserProfile>): Promise<UserProfile> => {
    if (!currentUser) throw new Error('Not authenticated');

    const resolvedData = { ...data };
    if (data.username && data.username.toLowerCase() !== currentUser.username.toLowerCase()) {
      resolvedData.username = await chatService.findUniqueUsername(data.username, currentUser.uid);
    }

    const updated: UserProfile = {
      ...currentUser,
      ...resolvedData
    };
    setCurrentUser(updated);
    localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(updated));
    await chatService.saveUserProfile(updated);
    return updated;
  };

  const toggleBlock = async (targetUid: string): Promise<boolean> => {
    if (!currentUser) return false;
    const isNowBlocked = await chatService.toggleBlockUser(currentUser.uid, targetUid);
    const updatedBlocked = isNowBlocked
      ? [...currentUser.blockedUsers, targetUid]
      : currentUser.blockedUsers.filter((id) => id !== targetUid);

    const updated = {
      ...currentUser,
      blockedUsers: updatedBlocked
    };
    setCurrentUser(updated);
    localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(updated));
    return isNowBlocked;
  };

  const isUserBlocked = (targetUid: string): boolean => {
    if (!currentUser) return false;
    return currentUser.blockedUsers.includes(targetUid);
  };

  const toggleContact = async (targetUid: string): Promise<boolean> => {
    if (!currentUser) return false;
    const isNowContact = await chatService.toggleContact(currentUser.uid, targetUid);
    const currentContacts = currentUser.contacts || [];
    const updatedContacts = isNowContact
      ? (currentContacts.includes(targetUid) ? currentContacts : [...currentContacts, targetUid])
      : currentContacts.filter((id) => id !== targetUid);

    const updated: UserProfile = {
      ...currentUser,
      contacts: updatedContacts
    };
    setCurrentUser(updated);
    localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(updated));
    return isNowContact;
  };

  const isContact = (targetUid: string): boolean => {
    if (!currentUser || !currentUser.contacts) return false;
    return currentUser.contacts.includes(targetUid);
  };

  const isAdmin = isUserAdmin(currentUser);
  const isPro = isUserPro(currentUser);
  const isBanned = isUserBanned(currentUser);
  const isFrozen = isUserFrozen(currentUser);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        loading,
        isAdmin,
        isPro,
        isBanned,
        isFrozen,
        loginWithEmail,
        registerWithEmail,
        logout,
        updateProfile,
        toggleBlock,
        isUserBlocked,
        toggleContact,
        isContact
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
