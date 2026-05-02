import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-cuci-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-cuci-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Staff Sign-in
            </CardTitle>
            <p className="text-gray-600 mt-2">
              Sign in with your Cuci Xpress staff account
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-staff-login">
              <div>
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@cucixpress.com"
                  autoComplete="username"
                  required
                  className="mt-2"
                  data-testid="input-staff-email"
                />
              </div>

              <div>
                <Label htmlFor="staff-password">Password</Label>
                <div className="relative mt-2">
                  <Input
                    id="staff-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your staff password"
                    autoComplete="current-password"
                    required
                    minLength={12}
                    className="pr-10"
                    data-testid="input-staff-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !email.trim() || password.length < 12}
                data-testid="button-staff-login-submit"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </div>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <a
            href="/"
            className="text-cuci-primary hover:text-cuci-primary-dark transition-colors text-sm"
          >
            ← Back to Website
          </a>
        </div>
      </motion.div>
    </div>
  );
}
