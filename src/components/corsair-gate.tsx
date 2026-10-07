"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type CorsairProps = {
  children: ReactNode;
  appearance?: "auto" | "light" | "dark";
  onConnected?: () => void;
};

export function CorsairGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [Provider, setProvider] = useState<ComponentType<CorsairProps> | null>(null);

  useEffect(() => {
    let alive = true;
    void import("corsair/client/react").then((mod) => {
      if (alive) setProvider(() => mod.CorsairProvider);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!Provider) return children;
  return (
    <Provider appearance="auto" onConnected={() => router.refresh()}>
      {children}
    </Provider>
  );
}
