import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { StaffLoginResult } from '@/hooks/useStaffAuth';

interface AdminLoginProps {
  onLogin: (email: string, password: string) => Promise<StaffLoginResult>;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    const result = await onLogin(email.trim(), password);

    if (!result.success) {
      let title = 'Sign-in failed';
      let description = 'Check your email and password and try again.';
      if (result.error === 'account_locked') {
        const mins = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 0) / 60));
        title = 'Account temporarily locked';
        description = `Too many failed attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`;
      } else if (result.error === 'account_inactive') {
        title = 'Account inactive';
        description = 'This staff account is disabled. Ask the owner to re-enable it.';
      } else if (result.error === 'network') {
        title = 'Network error';
        description = "Couldn't reach the server. Check your connection and try again.";
      }
      toast({ title, description, variant: 'destructive' });
      setPassword('');
    }

    setIsLoading(false);
  };

  return (
    <div className="cuci-page-bg flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Eyebrow + duotone headline mirrors the customer /login surface
            so the brand stays consistent across staff & customer entry points. */}
        <div className="text-center mb-6">
          <div className="cuci-eyebrow mb-3">Staff · Cuci Xpress</div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">
            Sign <span className="text-cuci-primary">in</span>
          </h1>
          <p className="text-gray-600 mt-3 text-sm">
            Use your Cuci Xpress staff email and password.
          </p>
        </div>

        <div className="cuci-card p-6">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full border-2 border-black bg-cuci-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-cuci-primary" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-staff-login">
            <div>
              <label htmlFor="staff-email" className="cuci-eyebrow block mb-1.5">
                Email
              </label>
              <input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@cucixpress.com"
                autoComplete="username"
                required
                className="w-full border-2 border-black rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                data-testid="input-staff-email"
              />
            </div>

            <div>
              <label htmlFor="staff-password" className="cuci-eyebrow block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="staff-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your staff password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                  className="w-full border-2 border-black rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                  data-testid="input-staff-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-800"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="cuci-cta bg-cuci-primary text-white w-full rounded-lg px-4 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !email.trim() || password.length < 12}
              data-testid="button-staff-login-submit"
            >
              {isLoading ? (
                <span className="inline-flex items-center justify-center">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Signing in…
                </span>
              ) : (
                'Sign in →'
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <a
            href="/"
            className="text-cuci-primary hover:text-cuci-primary-dark transition-colors text-sm font-semibold"
          >
            ← Back to website
          </a>
        </div>
      </motion.div>
    </div>
  );
}
