import "./_group.css";
import {
  Phone,
  ArrowLeft,
  Car,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Current() {
  return (
    <div className="cuci-page-bg min-h-screen">
      {/* slim nav */}
      <nav className="w-full border-b-2 border-black bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <span className="text-xl font-black tracking-tight">
            <span className="text-cuci-primary">Cuci</span>
            <span className="text-cuci-secondary">Xpress</span>
          </span>
          <div className="hidden sm:flex items-center gap-6 text-sm font-semibold text-gray-600">
            <span>Services</span>
            <span>Branches</span>
            <span>Queue</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a
          href="#"
          className="text-sm text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </a>

        <div className="grid lg:grid-cols-2 gap-8 items-stretch">
          {/* ===== LEFT — Form panel ===== */}
          <div className="cuci-card p-6 md:p-8">
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-gray-100 rounded-lg border-2 border-black">
              <button
                type="button"
                className="py-2.5 rounded-md text-sm font-bold transition bg-cuci-primary text-white shadow"
              >
                Sign In
              </button>
              <button
                type="button"
                className="py-2.5 rounded-md text-sm font-bold transition text-gray-600 hover:text-gray-900"
              >
                Register
              </button>
            </div>

            {/* Header */}
            <div className="mb-5">
              <p className="cuci-eyebrow">Customer · CuciXpress</p>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">
                Welcome <span className="text-cuci-primary">back</span>
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                Enter your phone or email — we'll send you a one-time code.
              </p>
            </div>

            {/* Step: form (signin) */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="cuci-eyebrow flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone or Email
                </label>
                <Input
                  defaultValue=""
                  placeholder="+673 7XX XXXX  or  you@example.com"
                  className="border-2 border-black text-base"
                />
              </div>
              <Button className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base py-6">
                Email me a 6-digit code →
              </Button>
              <p className="text-[11px] text-gray-400 text-center pt-1">
                No password required. We'll keep you signed in for a year.
              </p>
            </div>
          </div>

          {/* ===== RIGHT — Brand panel ===== */}
          <div className="hidden lg:flex flex-col justify-between rounded-2xl border-2 border-black bg-gradient-to-br from-purple-600 via-violet-500 to-orange-500 text-white p-8 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div>
              <p className="cuci-eyebrow text-white/90">Why an account?</p>
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
                  <strong>Digital receipts</strong> — every wash, ready on your
                  phone whenever you need it.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Car className="w-5 h-5 mt-0.5 shrink-0" />
                <span className="text-sm">
                  <strong>Your wash history</strong> — link your plate and see
                  every visit since day one.
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
                  <strong>One-tap sign-in</strong> — no passwords to remember,
                  just your email.
                </span>
              </li>
            </ul>

            <div className="text-xs text-white/70 border-t border-white/20 pt-4">
              5 branches across Brunei · trusted by thousands of drivers
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
