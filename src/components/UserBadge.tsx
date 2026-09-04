import React from 'react';
import { UserProfile } from '../types';

export const ADMIN_EMAIL = 'admin123123@admin.com';
export const ADMIN_EMAILS = [
  'admin123123@admin.com'
];

export const isUserAdmin = (user?: Partial<UserProfile> | null): boolean => {
  if (!user) return false;
  if ((user as any).role === 'admin' || (user as any).isAdmin === true) return true;
  const email = user.email ? user.email.trim().toLowerCase() : '';
  const username = user.username ? user.username.trim().toLowerCase() : '';

  if (email === ADMIN_EMAIL.toLowerCase()) return true;
  if (username === 'admin123123') return true;
  return false;
};

export const isUserPro = (user?: Partial<UserProfile> | null): boolean => {
  if (!user) return false;
  if (isUserAdmin(user)) return false; // Admin displays admin badge
  if (!user.isPro) return false;
  if (user.proUntil && Date.now() > user.proUntil) return false;
  return true;
};

export const isUserBanned = (user?: Partial<UserProfile> | null): boolean => {
  if (!user || !user.isBanned) return false;
  if (isUserAdmin(user)) return false; // Admin cannot be banned
  if (user.bannedUntil && Date.now() > user.bannedUntil) return false;
  return true;
};

export const isUserFrozen = (user?: Partial<UserProfile> | null): boolean => {
  if (!user || !user.isFrozen) return false;
  if (isUserAdmin(user)) return false; // Admin cannot be frozen
  if (user.frozenUntil && Date.now() > user.frozenUntil) return false;
  return true;
};

interface UserBadgeProps {
  user?: Partial<UserProfile> | null;
  showAdmin?: boolean;
  showPro?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const UserBadge: React.FC<UserBadgeProps> = ({
  user,
  showAdmin = true,
  showPro = true,
  size = 'sm',
  className = ''
}) => {
  if (!user) return null;

  const isAdmin = isUserAdmin(user);
  const isPro = isUserPro(user);

  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5',
    md: 'text-[10px] px-2 py-0.5',
    lg: 'text-xs px-2.5 py-1'
  }[size];

  // If user has admin, ALWAYS show ONLY admin badge
  if (showAdmin && isAdmin) {
    return (
      <span className={`inline-flex items-center align-middle select-none ${className}`}>
        <span
          className={`font-black rounded-full tracking-wider uppercase bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-[0_0_8px_rgba(225,29,72,0.45)] border border-rose-400/40 ${sizeClasses}`}
          title="Администратор мессенджера"
        >
          🛡️ Админ
        </span>
      </span>
    );
  }

  // If user does not have admin, but has PRO, show PRO badge
  if (showPro && isPro) {
    return (
      <span className={`inline-flex items-center align-middle select-none ${className}`}>
        <span
          className={`font-extrabold rounded-full tracking-wide uppercase bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 shadow-[0_0_10px_rgba(245,158,11,0.45)] border border-amber-300/80 ${sizeClasses}`}
          title="PRO Подписка активна"
        >
          {user.proBadgeIcon || '👑'} PRO
        </span>
      </span>
    );
  }

  return null;
};
