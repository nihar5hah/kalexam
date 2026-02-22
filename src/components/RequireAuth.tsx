"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";

export function RequireAuth({
  children,
  redirectTo,
}: {
  children: React.ReactNode;
  redirectTo: string;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/auth?next=${encodeURIComponent(redirectTo)}`);
    }
  }, [loading, redirectTo, router, user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <p className="text-neutral-400">Checking your session...</p>
      </div>
    );
  }

  return <>{children}</>;
}
