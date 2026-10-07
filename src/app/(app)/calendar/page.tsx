"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { CalendarApp } from "@/components/calendar/calendar-app";
import { MailboxSwitch } from "@/components/mail/gmail-sidebar";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";

export default function CalendarPage() {
  const router = useRouter();
  const dateParam = useSearchParams().get("date");
  const selected = useMemo(() => parseDay(dateParam) ?? new Date(), [dateParam]);
  const [month, setMonth] = useState(selected);
  useEffect(() => setMonth(selected), [selected]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f8fc] dark:bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2 pr-3 pl-1">
        <a href="/mail" className="ml-3 flex items-center gap-2">
          <img src="/corsair.png" alt="" width={32} height={32} className="size-8" />
          <span className="text-[22px] font-normal text-[#5f6368]">mail</span>
        </a>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[256px] shrink-0 md:block">
          <div className="py-2">
            <MailboxSwitch />
            <MiniCalendar
              mode="single"
              required
              className="mx-auto bg-transparent"
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                if (!date) return;
                router.replace(`/calendar?date=${format(date, "yyyy-MM-dd")}`, { scroll: false });
              }}
            />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <CalendarApp />
        </div>
      </div>
    </div>
  );
}

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
