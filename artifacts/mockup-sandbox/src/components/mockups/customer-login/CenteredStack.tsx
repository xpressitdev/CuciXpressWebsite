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

export function CenteredStack() {
  return (
    <div className="cuci-page-bg min-h-screen flex flex-col justify-between">
      {/* Top Nav / Back */}
      <div className="w-full max-w-xl mx-auto px-4 pt-8">
        <a
          href="#"
          className="text-sm font-medium text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </a>
      </div>

      <main className="w-full max-w-xl mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        {/* Logo centered */}
        <div className="text-center mb-8">
          <span className="text-4xl font-black tracking-tight drop-shadow-sm">
            <span className="text-cuci-primary">Cuci</span>
            <span className="text-cuci-secondary">Xpress</span>
          </span>
          <p className="mt-2 text-gray-600 font-bold uppercase tracking-wider text-xs">Customer Portal</p>
        </div>

        {/* The Card */}
        <div className="cuci-card p-6 sm:p-10 w-full mb-8">
          {/* Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl border-2 border-black mb-8 relative">
            <button
              type="button"
              className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-cuci-primary text-white shadow-sm transition-all border-2 border-transparent"
            >
              Sign In
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-600 hover:text-gray-900 transition-all border-2 border-transparent"
            >
              Register
            </button>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">
              Welcome back
            </h1>
            <p className="text-sm text-gray-600 mt-2 font-medium">
              Enter your phone or email. No password needed.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider font-bold text-gray-500 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Phone or Email
              </label>
              <Input
                defaultValue=""
                placeholder="+673 7XX XXXX  or  you@example.com"
                className="border-2 border-black text-base h-12 focus-visible:ring-cuci-primary rounded-xl"
              />
            </div>
            
            <Button className="cuci-cta w-full h-14 rounded-xl bg-cuci-primary hover:bg-cuci-primary-dark text-white text-base">
              Email me a 6-digit code →
            </Button>
            
            <p className="text-xs text-gray-500 text-center font-medium">
              We'll keep you signed in for a year.
            </p>
          </div>
        </div>

        {/* Benefits Chips Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-2.5 p-3 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5">
            <CheckCircle2 className="w-5 h-5 text-cuci-primary shrink-0" />
            <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight">Digital receipts</div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5">
            <Car className="w-5 h-5 text-cuci-primary shrink-0" />
            <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight">Wash history</div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5">
            <Sparkles className="w-5 h-5 text-cuci-secondary shrink-0" />
            <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight">Member perks</div>
          </div>
          <div className="flex items-center gap-2.5 p-3 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5">
            <ShieldCheck className="w-5 h-5 text-cuci-secondary shrink-0" />
            <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight">Passwordless</div>
          </div>
        </div>
      </main>

      <footer className="w-full text-center py-6 text-xs font-bold tracking-wide text-gray-500 uppercase">
        5 branches across Brunei · trusted by thousands of drivers
      </footer>
    </div>
  );
}
