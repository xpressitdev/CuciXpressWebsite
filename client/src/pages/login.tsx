import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, KeyRound, ArrowLeft, Loader2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Step = "phone" | "code";

const REASON_TEXT: Record<string, string> = {
  invalid_request: "That number doesn't look right. Please try again.",
  invalid_purpose: "Login is temporarily unavailable.",
  invalid_identifier: "That phone number is invalid.",
  no_active_code: "No active code. Please request a new one.",
  expired: "That code has expired. Please request a new one.",
  too_many_attempts: "Too many wrong tries. Request a new code.",
  wrong_code: "That code is incorrect.",
  server_error: "Something went wrong on our side. Please retry.",
};

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // If already signed in, send them straight to /dashboard.
  const { data: who } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/whoami"],
  });
  useEffect(() => {
    if (who?.authenticated) navigate("/dashboard");
  }, [who?.authenticated, navigate]);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/login/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({
          title: "Could not send code",
          description: REASON_TEXT[data.reason] ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Code sent",
        description: "Check your messages for a 6-digit code.",
      });
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone,
          code,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({
          title: "Could not sign in",
          description: REASON_TEXT[data.reason] ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Welcome!", description: "You're signed in." });
      // Refetch whoami before navigating, otherwise the dashboard reads
      // the stale {authenticated: false} from cache and bounces us back.
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/whoami"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/whoami"] });
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cuci-page-bg">
      <Navigation />
      <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1 mb-4"
          data-testid="link-login-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="text-center mb-5">
          <p className="cuci-eyebrow">Customer · CuciXpress</p>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 mt-1">
            Welcome <span className="text-cuci-primary">back</span>
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            Sign in with your phone number to see your washes, memberships
            and saved vehicles.
          </p>
        </div>

        <div className="cuci-card p-6 md:p-7">
          {step === "phone" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="cuci-eyebrow flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone number
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+673 7XX XXXX"
                  inputMode="tel"
                  autoFocus
                  className="border-2 border-black focus-visible:ring-cuci-primary text-base"
                  data-testid="input-login-phone"
                />
              </div>
              <div className="space-y-1">
                <label className="cuci-eyebrow">
                  Name <span className="text-gray-400 normal-case font-normal">(optional, first time only)</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="border-2 border-black focus-visible:ring-cuci-primary"
                  data-testid="input-login-name"
                />
              </div>
              <Button
                onClick={sendCode}
                disabled={busy || !phone.trim()}
                className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base py-6 disabled:opacity-60 disabled:translate-x-0 disabled:translate-y-0"
                data-testid="button-login-send-code"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send 6-digit code →"}
              </Button>
              <p className="text-[11px] text-gray-400 text-center pt-1">
                We'll send a one-time code. No password to remember.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-cuci-primary/5 border border-cuci-primary/20 p-3 text-center">
                <p className="text-sm text-gray-700">
                  Code sent to{" "}
                  <span className="font-bold text-cuci-primary">{phone}</span>
                </p>
              </div>
              <div className="space-y-1">
                <label className="cuci-eyebrow flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> 6-digit code
                </label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoFocus
                  className="border-2 border-black focus-visible:ring-cuci-primary tracking-[0.6em] text-center text-2xl font-mono py-6"
                  data-testid="input-login-code"
                />
              </div>
              <Button
                onClick={verifyCode}
                disabled={busy || code.length !== 6}
                className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base py-6 disabled:opacity-60 disabled:translate-x-0 disabled:translate-y-0"
                data-testid="button-login-verify"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & sign in"}
              </Button>

              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await fetch(
                        `/api/dev/last-otp?phone=${encodeURIComponent(phone.trim().replace(/\s+/g, ""))}`,
                      );
                      const d = await r.json();
                      if (d.ok && /^\d{6}$/.test(d.code)) {
                        setCode(d.code);
                        toast({ title: "Dev code filled", description: `Code: ${d.code}` });
                      } else {
                        toast({
                          title: "No dev code yet",
                          description: "Send a code first — the dev console also prints it.",
                          variant: "destructive",
                        });
                      }
                    } catch {
                      toast({ title: "Could not read dev code", variant: "destructive" });
                    }
                  }}
                  className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-md py-2 hover:bg-amber-100"
                  data-testid="button-login-dev-fill"
                >
                  🔧 Dev only: reveal &amp; auto-fill the OTP
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                }}
                className="w-full text-sm text-gray-500 hover:text-cuci-primary"
                data-testid="button-login-back-to-phone"
              >
                ← Use a different number
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
