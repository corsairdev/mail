"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/trpc/react";
import { CorsairGate } from "@/components/corsair-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TRPCReactProvider>
        <TooltipProvider>
          <CorsairGate>{children}</CorsairGate>
          <Toaster position="bottom-left" />
        </TooltipProvider>
      </TRPCReactProvider>
    </ThemeProvider>
  );
}
