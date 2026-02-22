"use client";

import Link from "next/link";
import { useState } from "react";
import { signInWithPopup, signOut } from "firebase/auth";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";

export function UserMenu() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

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
    try {
      await signOut(getFirebaseAuth());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {user ? (
        <>
          <span className="hidden md:inline text-xs text-neutral-400">{user.email}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={handleSignOut}
            className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-full"
          >
            Sign out
          </Button>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
