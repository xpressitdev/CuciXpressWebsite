import React from "react";
import "./BoldBlocks.css";
import { Phone, CheckCircle2, Car, Sparkles, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BoldBlocks() {
  return (
    <div className="bb-container bb-bg-grid min-h-screen flex flex-col font-['Outfit']">
      {/* Header */}
      <header className="bb-border border-b-4 bg-white border-t-0 border-l-0 border-r-0 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#FF9500] bb-border bb-shadow-sm flex items-center justify-center rotate-3">
              <Sparkles className="w-6 h-6 text-black fill-white" />
            </div>
            <span className="bb-title text-3xl font-black uppercase tracking-tighter ml-2">
              Cuci<span className="text-[#9D76FE]">Xpress</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6 font-bold text-lg uppercase tracking-wide">
            <span className="hover:text-[#9D76FE] cursor-pointer transition-colors">Services</span>
            <span className="hover:text-[#9D76FE] cursor-pointer transition-colors">Branches</span>
            <span className="hover:text-[#9D76FE] cursor-pointer transition-colors">Queue</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex flex-col">
        <a href="#" className="inline-flex items-center gap-2 text-black font-bold uppercase tracking-widest text-sm hover:translate-x-[-4px] transition-transform w-max mb-8">
          <ArrowLeft className="w-5 h-5 bb-border p-0.5 rounded-full" /> Back to home
        </a>

        <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-stretch flex-1">
          {/* LEFT: Form Panel */}
          <div className="bg-white bb-border bb-shadow p-6 md:p-10 flex flex-col">
            
            {/* Massive Toggle */}
            <div className="flex mb-10 bb-border p-1 bg-gray-100 bb-shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bb-bg-dots opacity-30"></div>
              <button className="flex-1 py-4 bg-[#9D76FE] bb-border text-white bb-title text-xl md:text-2xl font-black uppercase tracking-tight shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-10 hover:translate-y-[-2px] transition-transform">
                Sign In
              </button>
              <button className="flex-1 py-4 bg-transparent text-black bb-title text-xl md:text-2xl font-black uppercase tracking-tight z-10 hover:bg-white border-2 border-transparent hover:border-black transition-all">
                Register
              </button>
            </div>

            <div className="mb-8">
              <h1 className="bb-title text-4xl md:text-5xl font-black uppercase leading-none tracking-tighter mb-4">
                Let's get <br/><span className="text-[#FF9500] inline-block -rotate-2 bg-black px-2 text-white">rolling.</span>
              </h1>
              <p className="text-lg font-bold text-gray-600">
                Enter your phone or email. No passwords, no nonsense.
              </p>
            </div>

            <div className="space-y-6 flex-1">
              <div className="space-y-2">
                <label className="uppercase tracking-widest font-black text-sm flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Phone or Email
                </label>
                <Input
                  defaultValue=""
                  placeholder="+673 7XX XXXX   or   you@example.com"
                  className="bb-border bb-shadow-sm h-16 text-lg font-bold placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-[#9D76FE]/10 transition-colors rounded-none"
                />
              </div>

              <button className="w-full h-20 bg-[#FF9500] text-black bb-border bb-button bb-title text-2xl font-black uppercase tracking-tighter flex items-center justify-center gap-3 rounded-none mt-8">
                Send 6-digit code <ArrowLeft className="w-8 h-8 rotate-180" />
              </button>
              
              <div className="bg-gray-100 bb-border p-4 mt-6 transform rotate-1 text-center font-bold text-sm">
                NO PASSWORD REQUIRED. We keep you signed in for a year.
              </div>
            </div>
          </div>

          {/* RIGHT: Benefits Panel */}
          <div className="bg-[#9D76FE] bb-border bb-shadow p-6 md:p-10 flex flex-col relative overflow-hidden text-black">
            <div className="absolute inset-0 bb-bg-dots opacity-20"></div>
            
            <div className="relative z-10 mb-10">
              <div className="inline-block bg-black text-white px-3 py-1 font-black uppercase tracking-widest text-sm mb-6 -rotate-2 bb-shadow-sm">
                Why join?
              </div>
              <h2 className="bb-title text-5xl md:text-6xl font-black uppercase leading-[0.9] tracking-tighter mb-6 bg-white p-4 bb-border bb-shadow inline-block transform rotate-1">
                Everything<br/>about your<br/>car. <span className="text-[#9D76FE]">Sorted.</span>
              </h2>
            </div>

            <div className="space-y-4 relative z-10 flex-1">
              <div className="bg-white bb-border p-4 flex items-start gap-4 bb-shadow-sm hover:-translate-y-1 transition-transform">
                <div className="bg-[#FF9500] bb-border p-2 mt-1">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="bb-title text-xl font-black uppercase tracking-tight">Digital Receipts</h3>
                  <p className="font-semibold text-gray-700">Every wash, on your phone.</p>
                </div>
              </div>

              <div className="bg-white bb-border p-4 flex items-start gap-4 bb-shadow-sm hover:-translate-y-1 transition-transform">
                <div className="bg-[#FF9500] bb-border p-2 mt-1">
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="bb-title text-xl font-black uppercase tracking-tight">Wash History</h3>
                  <p className="font-semibold text-gray-700">Link your plate, see every visit.</p>
                </div>
              </div>

              <div className="bg-white bb-border p-4 flex items-start gap-4 bb-shadow-sm hover:-translate-y-1 transition-transform">
                <div className="bg-[#FF9500] bb-border p-2 mt-1">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="bb-title text-xl font-black uppercase tracking-tight">Perks & Wash Packs</h3>
                  <p className="font-semibold text-gray-700">Track your balance easily.</p>
                </div>
              </div>

              <div className="bg-white bb-border p-4 flex items-start gap-4 bb-shadow-sm hover:-translate-y-1 transition-transform">
                <div className="bg-[#FF9500] bb-border p-2 mt-1">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="bb-title text-xl font-black uppercase tracking-tight">1-Tap Sign-in</h3>
                  <p className="font-semibold text-gray-700">No passwords to remember.</p>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-12 bg-black text-white p-4 font-bold uppercase tracking-widest text-sm text-center bb-border">
              5 Branches · Trusted by 10,000+ Drivers
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
