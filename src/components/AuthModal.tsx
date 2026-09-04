import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_AVATARS } from '../services/chatService';
import { Shield, Sparkles, User, Lock, Mail, AtSign, ArrowRight } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { loginWithEmail, registerWithEmail } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getReadableError = (msg: string): string => {
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
      return 'Неверный email или пароль';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'Этот email уже зарегистрирован. Попробуйте войти';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Пароль должен содержать не менее 6 символов';
    }
    if (msg.includes('auth/invalid-email')) {
      return 'Введите корректный адрес email';
    }
    return msg || 'Ошибка авторизации';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!email.trim() || !password) {
          setError('Заполните email и пароль');
          setLoading(false);
          return;
        }
        await loginWithEmail(email, password);
      } else {
        if (!email.trim() || !password) {
          setError('Заполните email и пароль');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Пароль должен содержать минимум 6 символов');
          setLoading(false);
          return;
        }
        const derivedName = displayName.trim() || email.split('@')[0];
        const cleanUsername = (username.trim() || derivedName)
          .toLowerCase()
          .replace(/^@/, '')
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 20) || 'user_' + Math.random().toString(36).substring(2, 7);

        const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
        await registerWithEmail(email, password, derivedName, cleanUsername, randomAvatar);
      }
    } catch (err: any) {
      setError(getReadableError(err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-screen-container" className="fixed inset-0 z-50 bg-[#09090b] flex items-center justify-center p-4">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#0c0c0e] border border-zinc-800 rounded-3xl p-8 shadow-2xl flex flex-col z-10">
        {/* Logo & Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/30 mb-3">
            <span className="text-3xl">🐆</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            ПАНТЕРА
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/30">
              MESSENGER
            </span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-normal">
            Иммерсивный мессенджер с кристальными звонками и группами
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex rounded-xl bg-[#121214] p-1 border border-zinc-800 mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
              mode === 'login'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Войти в аккаунт
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
              mode === 'register'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Имя
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Алексей Смирнов"
                    className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
                  />
                </div>
              </div>

              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-purple-400 font-mono font-bold text-sm pointer-events-none">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username (необязательно)"
                  className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono transition"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Email
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Пароль
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            id="auth-submit-btn"
            className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-900/30 transition cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Подключение...</span>
            ) : mode === 'login' ? (
              <>
                <span>Войти</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Создать аккаунт</span>
                <Sparkles className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-zinc-800/80 text-center">
          <span className="text-[11px] text-zinc-500 flex items-center justify-center gap-1 font-mono">
            <Shield className="w-3 h-3 text-purple-400" /> Защищенное соединение • Активно
          </span>
        </div>
      </div>
    </div>
  );
};
