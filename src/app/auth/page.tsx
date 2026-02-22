"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

import { useAuth } from "@/components/AuthProvider";
import { SignInCard2 } from "@/components/ui/sign-in-card-2";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";

type AuthMode = "signin" | "signup";

function mapAuthErrorMessage(caughtError: unknown, mode: AuthMode): string {
  const code =
    typeof caughtError === "object" && caughtError !== null && "code" in caughtError
      ? String((caughtError as { code?: unknown }).code)
      : "";

  if (mode === "signin") {
    if (
      code.includes("auth/invalid-credential") ||
      code.includes("auth/wrong-password") ||
      code.includes("auth/user-not-found") ||
      code.includes("auth/invalid-email")
    ) {
      return "Login credentials are not valid. Please check your email and password.";
    }

    if (code.includes("auth/too-many-requests")) {
      return "Too many attempts. Please wait a bit and try again.";
    }
  }

  if (mode === "signup") {
    if (code.includes("auth/email-already-in-use")) {
      return "This email is already registered. Please sign in instead.";
    }

    if (code.includes("auth/weak-password")) {
      return "Password is too weak. Please use at least 6 characters.";
    }
  }

  return mode === "signin"
    ? "Unable to sign in. Please check your credentials and try again."
    : "Unable to create account right now. Please try again.";
}

function mapGoogleAuthErrorMessage(caughtError: unknown): string {
  const code =
    typeof caughtError === "object" && caughtError !== null && "code" in caughtError
      ? String((caughtError as { code?: unknown }).code)
      : "";

  if (code.includes("auth/popup-closed-by-user")) {
    return "Google sign-in was canceled. Please try again.";
  }

  if (code.includes("auth/popup-blocked")) {
    return "Popup was blocked. Please allow popups and try Google sign-in again.";
  }

  return "Google sign-in failed. Please try again.";
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
          <p className="text-neutral-400">Loading sign in...</p>
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);

  const nextPath = useMemo(() => searchParams.get("next") ?? "/upload", [searchParams]);

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [loading, nextPath, router, user]);

  useEffect(() => {
    setError(null);
    setHelperMessage(null);
  }, [mode]);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
      router.replace(nextPath);
    } catch (caughtError) {
      setError(mapGoogleAuthErrorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailAuth() {
    setError(null);
    setHelperMessage(null);

    if (!email.trim()) {
      setHelperMessage("Enter your email address.");
      return;
    }

    if (!password.trim()) {
      setHelperMessage("Enter your password.");
      return;
    }

    if (mode === "signup" && password.length < 6) {
      setHelperMessage("Password must be at least 6 characters for sign up.");
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      router.replace(nextPath);
    } catch (caughtError) {
      setError(mapAuthErrorMessage(caughtError, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SignInCard2
      mode={mode}
      onModeChange={setMode}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      onEmailSubmit={handleEmailAuth}
      onGoogleSubmit={handleGoogle}
      isLoading={busy}
      error={error}
      helperMessage={helperMessage}
    />
  );
}
