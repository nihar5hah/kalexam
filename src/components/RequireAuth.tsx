"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave";

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
        <TextShimmerWave className="text-sm [--base-color:#a3a3a3] [--base-gradient-color:#ffffff]" duration={1}>
          Checking your session...
        </TextShimmerWave>
      </div>
    );
  }

  return <>{children}</>;
}
