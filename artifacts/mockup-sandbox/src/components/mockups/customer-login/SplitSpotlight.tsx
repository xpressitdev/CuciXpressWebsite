import "./_group.css";
import "./SplitSpotlight.css";
import { useState } from "react";
import {
  Phone,
  ArrowLeft,
  Car,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Droplets,
  Star,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SplitSpotlight() {
  const [tab, setTab] = useState<"signin" | "register">("signin");

  return (
    <div className="split-spotlight-bg min-h-screen flex flex-col font-sans">
      {/* slim nav */}
      <nav className="w-full border-b-4 border-black bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <span className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Droplets className="w-6 h-6 text-cuci-secondary fill-cuci-secondary" />
            <span>
              <span className="text-cuci-primary">Cuci</span>
              <span className="text-cuci-secondary">Xpress</span>
            </span>
          </span>
          <div className="hidden sm:flex items-center gap-6 text-base font-bold text-gray-800">
            <span className="hover:text-cuci-primary cursor-pointer transition-colors">Services</span>
            <span className="hover:text-cuci-primary cursor-pointer transition-colors">Branches</span>
            <span className="hover:text-cuci-primary cursor-pointer transition-colors">Queue</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
        <a
          href="#"
          className="text-sm font-bold text-gray-700 hover:text-cuci-primary inline-flex items-center gap-1 mb-6 w-fit border-2 border-transparent hover:border-black hover:bg-white px-3 py-1 rounded-full transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </a>

        <div className="grid lg:grid-cols-2 gap-0 items-stretch cuci-card overflow-hidden bg-white max-w-5xl mx-auto w-full relative z-10">
          
          {/* ===== LEFT — Form panel ===== */}
          <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center relative z-10 bg-white">
            <div className="max-w-md w-full mx-auto">
              
              {/* Tabs */}
              <div className="flex gap-4 mb-8">
                <button
                  type="button"
                  onClick={() => setTab("signin")}
                  className={`flex-1 py-3 px-4 rounded-xl text-base font-black border-2 border-black transition-all ${
                    tab === "signin"
                      ? "bg-cuci-primary text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1 -translate-x-1"
                      : "bg-white text-gray-500 hover:text-black hover:bg-gray-50"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setTab("register")}
                  className={`flex-1 py-3 px-4 rounded-xl text-base font-black border-2 border-black transition-all ${
                    tab === "register"
                      ? "bg-cuci-secondary text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1 -translate-x-1"
                      : "bg-white text-gray-500 hover:text-black hover:bg-gray-50"
                  }`}
                >
                  Register
                </button>
              </div>

              {/* Header */}
              <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-black text-black leading-tight">
                  {tab === "signin" ? (
                    <>Ready for a <br/><span className="text-cuci-primary inline-block mt-1">fresh shine?</span></>
                  ) : (
                    <>Join the <br/><span className="text-cuci-secondary inline-block mt-1">clean club!</span></>
                  )}
                </h1>
                <p className="text-base font-medium text-gray-600 mt-3">
                  {tab === "signin"
                    ? "Enter your details below. We'll send a magic code to get you in."
                    : "One-time setup for endless shines. Let's go!"}
                </p>
              </div>

              {/* Form */}
              {tab === "signin" ? (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold flex items-center gap-2">
                      <Phone className="w-4 h-4 text-cuci-primary" /> Phone or Email
                    </label>
                    <Input
                      defaultValue=""
                      placeholder="+673 7XX XXXX  or  you@example.com"
                      className="border-2 border-black rounded-xl h-14 text-lg focus-visible:ring-cuci-primary focus-visible:ring-offset-2 focus-visible:ring-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all font-medium"
                    />
                  </div>
                  <Button className="cuci-cta w-full bg-cuci-primary hover:bg-cuci-primary-dark text-white text-lg h-14 rounded-xl flex items-center justify-between px-6">
                    <span>Email me a 6-digit code</span>
                    <Sparkles className="w-5 h-5" />
                  </Button>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-bold text-gray-500">
                      No password required.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-bold flex items-center gap-2">
                      <Phone className="w-4 h-4 text-cuci-secondary" /> Phone number
                    </label>
                    <Input
                      defaultValue=""
                      placeholder="+673 7XX XXXX"
                      className="border-2 border-black rounded-xl h-12 text-base focus-visible:ring-cuci-secondary font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold">Full name</label>
                      <Input
                        placeholder="Your name"
                        className="border-2 border-black rounded-xl h-12 focus-visible:ring-cuci-secondary font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold">Email</label>
                      <Input
                        placeholder="you@email.com"
                        className="border-2 border-black rounded-xl h-12 focus-visible:ring-cuci-secondary font-medium"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold flex items-center justify-between">
                      <span className="flex items-center gap-2"><Car className="w-4 h-4 text-cuci-secondary" /> License plate</span>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">links past washes</span>
                    </label>
                    <Input
                      defaultValue=""
                      placeholder="e.g. BBG2629"
                      className="border-2 border-black rounded-xl h-12 text-base focus-visible:ring-cuci-secondary uppercase font-bold tracking-wider"
                    />
                  </div>
                  <Button className="cuci-cta w-full bg-cuci-secondary hover:bg-cuci-secondary-dark text-black text-lg h-14 rounded-xl mt-2 flex items-center justify-between px-6">
                    <span>Email me a 6-digit code</span>
                    <Zap className="w-5 h-5 fill-black" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ===== RIGHT — Brand panel ===== */}
          <div className="sunburst-panel hidden lg:flex flex-col border-l-2 border-black text-white p-12 relative">
            <div className="sunburst"></div>
            
            <div className="relative z-10 h-full flex flex-col justify-between">
              
              <div className="mt-8">
                <div className="sticker sticker-white mb-6 transform -rotate-2 w-fit">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  PERKS AWAIT
                </div>
                <h2 className="text-4xl lg:text-5xl font-black mt-2 leading-[1.1] text-white drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">
                  Your car's <br/>best friend.
                </h2>
              </div>

              <div className="space-y-6 my-12">
                <div className="bg-white/10 backdrop-blur-md border-2 border-black p-5 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform rotate-1">
                  <div className="flex items-start gap-4">
                    <div className="bg-cuci-secondary w-10 h-10 rounded-full border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0_0_#000]">
                      <CheckCircle2 className="w-5 h-5 text-black" />
                    </div>
                    <div>
                      <h4 className="font-black text-xl text-black drop-shadow-[1px_1px_0_#fff]">Digital receipts</h4>
                      <p className="text-sm font-bold text-black/80 mt-1">Every wash, ready on your phone whenever you need it.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md border-2 border-black p-5 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform -rotate-1">
                  <div className="flex items-start gap-4">
                    <div className="bg-[#4ADE80] w-10 h-10 rounded-full border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0_0_#000]">
                      <Car className="w-5 h-5 text-black" />
                    </div>
                    <div>
                      <h4 className="font-black text-xl text-black drop-shadow-[1px_1px_0_#fff]">Wash history</h4>
                      <p className="text-sm font-bold text-black/80 mt-1">Link your plate and see every visit since day one.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md border-2 border-black p-5 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform rotate-1">
                  <div className="flex items-start gap-4">
                    <div className="bg-[#F472B6] w-10 h-10 rounded-full border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0_0_#000]">
                      <Sparkles className="w-5 h-5 text-black" />
                    </div>
                    <div>
                      <h4 className="font-black text-xl text-black drop-shadow-[1px_1px_0_#fff]">Membership & perks</h4>
                      <p className="text-sm font-bold text-black/80 mt-1">Track your wash-pack balance and member benefits.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-sm font-black text-black bg-white border-2 border-black py-3 px-4 rounded-xl text-center shadow-[4px_4px_0_0_#000] transform -rotate-1">
                5 branches across Brunei · trusted by thousands of drivers
              </div>
            </div>

            {/* Floating Stickers */}
            <div className="sticker sticker-orange floating-sticker-1 text-sm">
              <Droplets className="w-4 h-4 fill-black" /> SHINY
            </div>
            <div className="sticker sticker-white floating-sticker-2 text-sm">
              FAST ⚡
            </div>
            <div className="sticker sticker-purple floating-sticker-3 text-sm border-white">
              No Passwords!
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}
