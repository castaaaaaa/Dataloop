import React, { useState } from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';
import { BILLING_ENABLED } from '../../lib/billing/config';

interface LoginPageProps {
  onNavigateToSignup: () => void;
  onSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToSignup, onSuccess }) => {
  const { signInWithPassword, signInWithGoogle, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { user, error } = await signInWithPassword(email, password);
    setLoading(false);

    if (error) {
      setErrorMessage(error);
    } else if (user) {
      onSuccess();
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      setErrorMessage(error);
    } else {
      onSuccess();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    const { error } = await resetPassword(resetEmail);
    setResetLoading(false);
    if (error) {
      setErrorMessage(error);
    } else {
      setResetSent(true);
      setTimeout(() => {
        setResetSent(false);
        setResetModalOpen(false);
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="dropdown" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-2.5 mb-2">
          <div className="w-7 h-7 bg-[var(--accent)] rounded-[4px] flex items-center justify-center text-white font-bold text-[14px]">
            D
          </div>
          <span className="text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">Dataloop</span>
        </div>
        <h2 className="text-center text-[16px] font-semibold text-[var(--text-primary)]">
          Sign in to your account
        </h2>
        <p className="mt-1 text-center text-[12px] text-[var(--text-muted)]">
          Or{' '}
          <button
            type="button"
            onClick={onNavigateToSignup}
            className="font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            {BILLING_ENABLED ? 'create a new account with a 14-day Pro trial' : 'create a new account'}
          </button>
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[var(--bg-card)] py-6 px-6 border border-[var(--border-main)] sm:rounded-[6px] shadow-xs space-y-5">
          {errorMessage && (
            <div className="p-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] flex items-start gap-2.5 text-[12px] text-[var(--text-primary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-danger)] shrink-0 mt-1.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Google OAuth Button */}
          <div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full h-8 flex justify-center items-center gap-2 border border-[var(--border-main)] rounded-[6px] bg-[var(--bg-raised)] hover:bg-[var(--border-main)] text-[12px] font-medium text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{googleLoading ? 'Connecting...' : 'Continue with Google'}</span>
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-subtle)]" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-[var(--bg-card)] px-2 text-[var(--text-muted)] font-medium">
                Or with email
              </span>
            </div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-8 pl-8 pr-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[12px] font-medium text-[var(--text-secondary)]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetModalOpen(true);
                  }}
                  className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-8 pl-8 pr-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-8 flex items-center justify-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-medium rounded-[6px] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span>{loading ? 'Signing in...' : 'Sign in'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-card)] rounded-[6px] border border-[var(--border-main)] shadow-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Reset your password</h3>
            <p className="text-[12px] text-[var(--text-muted)]">
              Enter your account email and we will send a password reset link via Supabase Auth.
            </p>

            {resetSent ? (
              <div className="p-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
                <span>Password reset link sent. Check your inbox.</span>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-8 px-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="h-8 px-3 border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] rounded-[6px] text-[12px] font-medium cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {resetLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
