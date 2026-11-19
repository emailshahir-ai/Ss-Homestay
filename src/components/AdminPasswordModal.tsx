import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';
import { deriveBookingAccessKeySync, verifyAdminPasswordSync } from '../lib/adminAuth';

interface AdminPasswordModalProps {
  open: boolean;
  onClose: () => void;
  onUnlockSuccess: (accessKey: string) => void;
}

export function AdminPasswordModal({
  open,
  onClose,
  onUnlockSuccess,
}: AdminPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setShowPassword(false);
    setError(null);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Sila masukkan kata laluan admin.');
      inputRef.current?.focus();
      return;
    }

    const ok = verifyAdminPasswordSync(password);
    if (!ok) {
      setError('Kata laluan admin tidak sah. Sila cuba lagi.');
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    const accessKey = deriveBookingAccessKeySync(password);
    setPassword('');
    onUnlockSuccess(accessKey);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm bg-white border border-[#DDE2DC] rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 bg-[#F8F9F7] border-b border-[#DDE2DC]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#14532D] text-white flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="admin-modal-title"
                className="font-display text-base font-semibold text-[#161B17] leading-tight"
              >
                Log Masuk ADMIN
              </h2>
              <p className="text-[11px] text-[#525C54]">
                Masukkan kata laluan untuk buka panel pengurusan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-[#525C54] hover:text-[#161B17] hover:bg-[#EFF2EE] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="quick-admin-password-input"
              className="block text-xs font-semibold text-[#161B17] mb-1.5"
            >
              Kata Laluan Admin
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#525C54] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                id="quick-admin-password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Masukkan kata laluan..."
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyi kata laluan' : 'Lihat kata laluan'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#525C54] hover:text-[#161B17] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-2.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#DDE2DC] text-xs font-medium text-[#525C54] hover:bg-[#F8F9F7] transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[#14532D] text-white text-xs sm:text-sm font-semibold hover:bg-[#166534] transition-colors cursor-pointer"
            >
              Masuk Admin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
