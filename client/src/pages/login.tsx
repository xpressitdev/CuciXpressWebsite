import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1 mb-4"
          data-testid="link-login-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] p-6 md:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">
            Enter your phone number and we'll send you a one-time code.
          </p>

          {step === "phone" ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-600 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone number
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+673 7XX XXXX"
                  inputMode="tel"
                  autoFocus
                  data-testid="input-login-phone"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Name (optional, first time only)</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  data-testid="input-login-name"
                />
              </div>
              <Button
                onClick={sendCode}
                disabled={busy || !phone.trim()}
                className="w-full bg-cuci-primary hover:bg-cuci-primary-dark"
                data-testid="button-login-send-code"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send code"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Code sent to <span className="font-semibold">{phone}</span>.
              </p>
              <div className="space-y-1">
                <label className="text-xs text-gray-600 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> 6-digit code
                </label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoFocus
                  className="tracking-[0.5em] text-center text-lg font-mono"
                  data-testid="input-login-code"
                />
              </div>
              <Button
                onClick={verifyCode}
                disabled={busy || code.length !== 6}
                className="w-full bg-cuci-primary hover:bg-cuci-primary-dark"
                data-testid="button-login-verify"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                }}
                className="w-full text-sm text-gray-500 hover:text-cuci-primary"
                data-testid="button-login-back-to-phone"
              >
                Use a different number
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
