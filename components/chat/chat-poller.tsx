"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ChatPoller({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
