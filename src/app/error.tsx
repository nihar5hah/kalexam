"use client";

import { useEffect } from "react";

import { NotFound } from "@/components/ui/not-found-2";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <NotFound />;
}
