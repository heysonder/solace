"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@/components/layout/UserProfile";
import { useImmersive } from "@/contexts/ImmersiveContext";

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const { isImmersiveMode } = useImmersive();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/watch/${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="border-b border-white/5 bg-surface/60 backdrop-blur mb-8 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="grid grid-cols-3 items-center gap-4">
          <Link href="/" className="font-semibold tracking-tight text-xl justify-self-start">
            {isImmersiveMode ? "Twitch" : "solace."}
          </Link>

          {!isImmersiveMode && (
            <form onSubmit={handleSearch} className="justify-self-center max-w-48 sm:max-w-64 w-full">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="go to channel…"
                className="w-full rounded-xl bg-bg px-3 py-2 text-sm outline-none ring-purple-500/30 focus:ring-2 border border-white/10 focus:border-purple-500/50 focus:shadow-[0_0_12px_rgba(147,51,234,0.15)] transition-all duration-250"
              />
            </form>
          )}

          <div className="justify-self-end">
            <UserProfile />
          </div>
        </div>
      </div>
    </header>
  );
}
