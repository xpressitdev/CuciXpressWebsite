import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  Mail,
  KeyRound,
  ArrowLeft,
  Loader2,
  Car,
  User as UserIcon,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Tab = "signin" | "register";
type Step = "form" | "code";

const REASON_TEXT: Record<string, string> = {
  invalid_request: "Please double-check the details and try again.",
  invalid_purpose: "This action is temporarily unavailable.",
  invalid_identifier: "That doesn't look like a valid phone or email.",
  no_account: "Incorrect code or identifier. Please check and try again.",
  no_active_code: "No active code. Please request a new one.",
  expired: "That code has expired. Please request a new one.",
  too_many_attempts: "Too many wrong tries. Request a new code.",
  too_many_requests: "Too many attempts. Please wait a few minutes and try again.",
  wrong_code: "That code is incorrect.",
  conflict:
    "One of the details you entered is already linked to another account. Please sign in or contact us if you need help.",
  server_error: "Something went wrong on our side. Please retry.",
};

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Skip the page entirely if already signed in.
  const { data: who } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/whoami"],
  });
  useEffect(() => {
    if (who?.authenticated) navigate("/dashboard");
  }, [who?.authenticated, navigate]);

  const [tab, setTab] = useState<Tab>("signin");
  const [step, setStep] = useState<Step>("form");

  // Sign-in form state
  const [identifier, setIdentifier] = useState("");

  // Register form state
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plate, setPlate] = useState("");

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset everything when switching tabs.
  const switchTab = (t: Tab) => {
    setTab(t);
    setStep("form");
    setCode("");
  };

  // Send a confused returning customer over to the Sign In tab, carrying
  // over whatever identifier they already typed. This nudge is shown to
  // EVERYONE (never conditioned on whether an account actually exists), so
  // it can't be used by a stranger to detect which emails/phones/plates are
  // already registered.
  const goSignIn = (prefill?: string) => {
    switchTab("signin");
    if (prefill?.trim()) setIdentifier(prefill.trim());
  };


  const handleError = (data: any) => {
    toast({
      title: tab === "signin" ? "Could not send code" : "Could not register",
      description: REASON_TEXT[data?.reason] ?? "Please try again.",
      variant: "destructive",
    });
  };

  // ---- Sign in actions ---------------------------------------
  const startSignin = async () => {
    if (!identifier.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/signin/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return handleError(data);
      // The server always returns 200 whether or not an account exists,
      // so we can't confirm account existence here. Show a generic message.
      toast({
        title: "Code sent",
        description: "If an account exists for that identifier, we've emailed a 6-digit code.",
      });
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const verifySignin = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/signin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: identifier.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return handleError(data);
      toast({ title: "Welcome back!", description: "You're signed in." });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/whoami"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/whoami"] });
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  // ---- Register actions --------------------------------------
  const canStartRegister =
    phone.trim() && name.trim() && email.trim() && plate.trim();

  const startRegister = async () => {
    if (!canStartRegister) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/register/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
          email: email.trim(),
          plate: plate.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return handleError(data);
      toast({
        title: "Check your email",
        description: `If your details are new, we've emailed a 6-digit code to ${email.trim()}. Already have an account? Use Sign in instead.`,
      });
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const verifyRegister = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
          email: email.trim(),
          plate: plate.trim(),
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return handleError(data);
      toast({
        title: "Welcome to Cuci Xpress!",
        description: "Your account is ready.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/whoami"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/whoami"] });
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  // ---- Dev helper: read latest mock OTP code ------------------
  const fetchDevCode = async () => {
    const id =
      tab === "signin"
        ? identifier.trim()
        : email.trim();
    try {
      const r = await fetch(
        `/api/dev/last-otp?phone=${encodeURIComponent(id)}`,
      );
      const d = await r.json();
      if (d.ok && /^\d{6}$/.test(d.code)) {
        setCode(d.code);
        toast({ title: "Dev code filled", description: `Code: ${d.code}` });
      } else {
        toast({
          title: "No dev code yet",
          description: "Send a code first — the server console also prints it.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Could not read dev code", variant: "destructive" });
    }
  };

  // ---- Render -------------------------------------------------
  return (
    <div className="cuci-page-bg min-h-screen">
      <Navigation />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1 mb-4"
          data-testid="link-login-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="grid lg:grid-cols-2 gap-8 items-stretch">
          {/* ===== LEFT — Form panel ===== */}
          <div className="cuci-card p-6 md:p-8">
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-gray-100 rounded-lg border-2 border-black">
              <button
                type="button"
                onClick={() => switchTab("signin")}
                className={`py-2.5 rounded-md text-sm font-bold transition ${
                  tab === "signin"
                    ? "bg-cuci-primary text-white shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                data-testid="tab-signin"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchTab("register")}
                className={`py-2.5 rounded-md text-sm font-bold transition ${
                  tab === "register"
                    ? "bg-cuci-primary text-white shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                data-testid="tab-register"
              >
                Register
              </button>
            </div>

            {/* Header */}
            <div className="mb-5">
              <p className="cuci-eyebrow">Customer · CuciXpress</p>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">
                {tab === "signin" ? (
                  <>
                    Welcome <span className="text-cuci-primary">back</span>
                  </>
                ) : (
                  <>
                    Create your <span className="text-cuci-primary">account</span>
                  </>
                )}
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                {tab === "signin"
                  ? "Enter your phone or email — we'll send you a one-time code."
                  : "Quick one-time setup. We'll email you a 6-digit code to confirm."}
              </p>
            </div>

            {/* Step: form */}
            {step === "form" && tab === "signin" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="cuci-eyebrow flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone or Email
                  </label>
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="+673 7XX XXXX  or  you@example.com"
                    autoFocus
                    className="border-2 border-black focus-visible:ring-cuci-primary text-base"
                    data-testid="input-signin-identifier"
                  />
                </div>
                <Button
                  onClick={startSignin}
                  disabled={busy || !identifier.trim()}
                  className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base py-6 disabled:opacity-60 disabled:translate-x-0 disabled:translate-y-0"
                  data-testid="button-signin-send-code"
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Email me a 6-digit code →"
                  )}
                </Button>
                <p className="text-[11px] text-gray-400 text-center pt-1">
                  No password required. We'll keep you signed in for a year.
                </p>
              </div>
            )}

            {step === "form" && tab === "register" && (
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
                    className="border-2 border-black focus-visible:ring-cuci-primary"
                    data-testid="input-register-phone"
                  />
                </div>
                <div className="space-y-1">
                  <label className="cuci-eyebrow flex items-center gap-1">
                    <UserIcon className="w-3 h-3" /> Full name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="border-2 border-black focus-visible:ring-cuci-primary"
                    data-testid="input-register-name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="cuci-eyebrow flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="border-2 border-black focus-visible:ring-cuci-primary"
                    data-testid="input-register-email"
                  />
                </div>
                <div className="space-y-1 relative">
                  <label className="cuci-eyebrow flex items-center gap-1">
                    <Car className="w-3 h-3" /> License plate
                    <span className="text-gray-400 normal-case font-normal">
                      &nbsp;· links your past washes
                    </span>
                  </label>
                  <Input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. BBG2629"
                    autoComplete="off"
                    className="border-2 border-black focus-visible:ring-cuci-primary uppercase tracking-wider"
                    data-testid="input-register-plate"
                  />
                </div>
                <Button
                  onClick={startRegister}
                  disabled={busy || !canStartRegister}
                  className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base py-6 disabled:opacity-60 disabled:translate-x-0 disabled:translate-y-0"
                  data-testid="button-register-send-code"
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Email me a 6-digit code →"
                  )}
                </Button>
                <p className="text-[11px] text-gray-400 text-center pt-1">
                  By continuing you agree to our Terms and Privacy Policy.
                </p>
                <p className="text-sm text-gray-600 text-center pt-1">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => goSignIn(email || phone)}
                    className="font-bold text-cuci-primary hover:underline"
                    data-testid="link-register-to-signin"
                  >
                    Sign in instead
                  </button>
                </p>
              </div>
            )}

            {/* Step: code */}
            {step === "code" && (
              <div className="space-y-4">
                <div className="rounded-lg bg-cuci-primary/5 border border-cuci-primary/20 p-3 text-center">
                  <p className="text-sm text-gray-700">
                    Code sent to{" "}
                    <span className="font-bold text-cuci-primary">
                      {tab === "signin" ? "your email" : email}
                    </span>
                  </p>
                </div>
                {tab === "register" && (
                  <p className="text-xs text-gray-500 text-center">
                    Didn't get a code? You may already have an account —{" "}
                    <button
                      type="button"
                      onClick={() => goSignIn(email)}
                      className="font-bold text-cuci-primary hover:underline"
                      data-testid="link-code-to-signin"
                    >
                      sign in instead
                    </button>
                    .
                  </p>
                )}
                <div className="space-y-1">
                  <label className="cuci-eyebrow flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> 6-digit code
                  </label>
                  <Input
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    inputMode="numeric"
                    autoFocus
                    className="border-2 border-black focus-visible:ring-cuci-primary tracking-[0.6em] text-center text-2xl font-mono py-6"
                    data-testid="input-otp-code"
                  />
                </div>
                <Button
                  onClick={tab === "signin" ? verifySignin : verifyRegister}
                  disabled={busy || code.length !== 6}
                  className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base py-6 disabled:opacity-60 disabled:translate-x-0 disabled:translate-y-0"
                  data-testid="button-otp-verify"
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : tab === "signin" ? (
                    "Verify & sign in"
                  ) : (
                    "Verify & create account"
                  )}
                </Button>

                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={fetchDevCode}
                    className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-md py-2 hover:bg-amber-100"
                    data-testid="button-dev-fill"
                  >
                    🔧 Dev only: reveal &amp; auto-fill the OTP
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStep("form");
                    setCode("");
                  }}
                  className="w-full text-sm text-gray-500 hover:text-cuci-primary"
                  data-testid="button-back-to-form"
                >
                  ← Use a different {tab === "signin" ? "account" : "email"}
                </button>
              </div>
            )}
          </div>

          {/* ===== RIGHT — Brand panel ===== */}
          <div className="hidden lg:flex flex-col justify-between rounded-2xl border-2 border-black bg-gradient-to-br from-purple-600 via-violet-500 to-orange-500 text-white p-8 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-white/90">Why an account?</p>
              <h2 className="text-3xl font-black mt-2 leading-tight">
                Everything about your car, in one place.
              </h2>
              <p className="text-white/85 mt-3 text-sm">
                No more digging for receipts. Your washes, membership, and
                vehicle history live with your plate.
              </p>
            </div>

            <ul className="space-y-3 my-6">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="text-sm">
                  <strong>Digital receipts</strong> — every wash, ready on
                  your phone whenever you need it.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Car className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="text-sm">
                  <strong>Your wash history</strong> — link your plate and
                  see every visit since day one.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="text-sm">
                  <strong>Membership & perks</strong> — track your wash-pack
                  balance and member benefits.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="text-sm">
                  <strong>One-tap sign-in</strong> — no passwords to
                  remember, just your email.
                </span>
              </li>
            </ul>

            <div className="text-xs text-white/70 border-t border-white/20 pt-4">
              5 branches across Brunei · trusted by thousands of drivers
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
