"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { Settings, LogOut } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  if (name && name.trim()) {
    return name.trim().split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

export function UserMenu() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleGoogleAuth() {
    setBusy(true);
    try {
      await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setOpen(false);
    try {
      await signOut(getFirebaseAuth());
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={handleGoogleAuth}
          className="rounded-full bg-white text-black hover:bg-neutral-200"
        >
          Continue with Google
        </Button>
        <Button asChild type="button" size="sm" variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10">
          <Link href="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* Avatar button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-orange-500/30 text-orange-200 font-bold text-sm ring-2 ring-white/10 hover:ring-orange-500/40 transition-all focus:outline-none"
        aria-label="Account menu"
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          getInitials(user.displayName, user.email)
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl shadow-black/50 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-xs font-semibold text-white truncate">
              {user.displayName ?? "Account"}
            </p>
            <p className="text-xs text-neutral-500 truncate">{user.email}</p>
          </div>

          {/* Items */}
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              Account Settings
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5 hover:text-white transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
