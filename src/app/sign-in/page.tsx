"use client";

import dynamic from "next/dynamic";
import Image from "next/image";

const SignInGate = dynamic(() => import("./gate").then((mod) => mod.SignInGate), { ssr: false });

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#f6f8fc] px-6 dark:bg-background">
      <Image src="/corsair.png" alt="" width={56} height={56} className="size-14" />
      <h1 className="mt-4 text-[28px] font-normal tracking-normal text-[#202124] dark:text-foreground">Inbox</h1>
      <p className="mt-2 text-center text-sm text-[#5f6368]">Connect Gmail and Calendar to open your mailbox.</p>
      <SignInGate />
    </main>
  );
}
