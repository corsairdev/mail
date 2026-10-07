"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertOctagon, ChevronDown, ChevronUp, FileText, Inbox, Pencil, Send, Star, Tag, Trash2, type LucideIcon } from "lucide-react";

function GmailMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4 shrink-0" aria-hidden>
      <path fill="#4caf50" d="M45 16.2 40 19l-5 4.7V40h7a3 3 0 0 0 3-3V16.2z" />
      <path fill="#1e88e5" d="M3 16.2 6.6 17.9 13 23.7V40H6a3 3 0 0 1-3-3V16.2z" />
      <path fill="#e53935" d="m35 11.2-11 8.25L13 11.2 12 17l1 6.7L24 32l11-8.3 1-6.7z" />
      <path fill="#c62828" d="M3 12.3V16.2l10 7.5V11.2L9.9 8.9A4.3 4.3 0 0 0 7.3 8C4.9 8 3 9.9 3 12.3z" />
      <path fill="#fbc02d" d="M45 12.3V16.2l-10 7.5V11.2l3.1-2.3c.7-.6 1.6-.9 2.6-.9 2.4 0 4.3 1.9 4.3 4.3z" />
    </svg>
  );
}

function CalendarMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4 shrink-0" aria-hidden>
      <path fill="#fff" d="M12 16h24v24H12z" />
      <path fill="#1a73e8" d="M36 8h-4V4h-4v4H20V4h-4v4h-4a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V12a4 4 0 0 0-4-4zm0 32H12V16h24v24z" />
      <path fill="#1a73e8" d="M18 22h4v4h-4zm6 0h4v4h-4zm6 0h4v4h-4zM18 28h4v4h-4zm6 0h4v4h-4z" />
    </svg>
  );
}

export function MailboxSwitch({ collapsed = false }: { collapsed?: boolean }) {
  const onCalendar = usePathname().startsWith("/calendar");
  return (
    <div className={`mb-2 flex gap-1 ${collapsed ? "flex-col items-center" : "mx-3"}`}>
      <Link href="/mail" scroll={false} title="Gmail" aria-current={onCalendar ? undefined : "page"} className={`flex h-10 items-center justify-center gap-2 rounded-full text-[13px] font-medium ${collapsed ? "size-10" : "flex-1"} ${onCalendar ? "text-[#444746] hover:bg-[#e8eaed]" : "bg-[#d3e3fd] text-[#001d35]"}`}>
        <GmailMark />
        {collapsed ? null : "Gmail"}
      </Link>
      <Link href="/calendar" scroll={false} title="Google Calendar" aria-current={onCalendar ? "page" : undefined} className={`flex h-10 items-center justify-center gap-2 rounded-full text-[13px] font-medium ${collapsed ? "size-10" : "flex-1"} ${onCalendar ? "bg-[#d3e3fd] text-[#001d35]" : "text-[#444746] hover:bg-[#e8eaed]"}`}>
        <CalendarMark />
        {collapsed ? null : "Calendar"}
      </Link>
    </div>
  );
}

export type MailFolder = "inbox" | "starred" | "sent" | "drafts" | "trash" | "spam" | "label";

const NAV: { id: Exclude<MailFolder, "label">; label: string; icon: LucideIcon; group: "main" | "more" }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox, group: "main" },
  { id: "starred", label: "Starred", icon: Star, group: "main" },
  { id: "sent", label: "Sent", icon: Send, group: "main" },
  { id: "drafts", label: "Drafts", icon: FileText, group: "main" },
  { id: "spam", label: "Spam", icon: AlertOctagon, group: "more" },
  { id: "trash", label: "Trash", icon: Trash2, group: "more" },
];

export function GmailSidebar({
  folder,
  labelId,
  unread,
  labels,
  collapsed,
  showMore,
  onToggleMore,
  onCompose,
  onSelect,
  onLabel,
}: {
  folder: MailFolder;
  labelId?: string;
  unread: number;
  labels: { id: string; name: string }[];
  collapsed: boolean;
  showMore: boolean;
  onToggleMore: () => void;
  onCompose: () => void;
  onSelect: (folder: Exclude<MailFolder, "label">) => void;
  onLabel: (id: string) => void;
}) {
  const items = NAV.filter((item) => item.group === "main" || (showMore && !collapsed));
  return (
    <nav aria-label="Mailbox" className={`flex h-full flex-col bg-[#f6f8fc] py-2 text-[#1f1f1f] ${collapsed ? "w-[72px] items-center" : "w-[256px]"}`}>
      <MailboxSwitch collapsed={collapsed} />
      <button
        type="button"
        data-testid="compose"
        className={`mb-3 flex items-center bg-[#c2e7ff] text-[#001d35] shadow-[0_1px_2px_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] hover:shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)] ${collapsed ? "size-14 justify-center rounded-2xl" : "ml-2 h-14 w-[148px] gap-3 rounded-2xl px-4"}`}
        onClick={onCompose}
      >
        <Pencil className="size-5" />
        {collapsed ? null : <span className="text-[14px] font-medium">Compose</span>}
      </button>
      {items.map((item) => {
        const active = folder === item.id;
        const Icon = item.icon;
        const count = item.id === "inbox" ? unread : 0;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`folder-${item.id}`}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={`flex h-8 items-center text-left text-[14px] ${collapsed ? "w-12 justify-center rounded-full" : "mr-3 rounded-r-full pr-3 pl-6"} ${active ? "bg-[#d3e3fd] font-bold text-[#001d35]" : "hover:bg-[#e8eaed]"}`}
            onClick={() => onSelect(item.id)}
          >
            <Icon className={`size-5 ${active ? "text-[#001d35]" : "text-[#444746]"}`} />
            {collapsed ? null : <span className="ml-4 flex-1 truncate">{item.label}</span>}
            {!collapsed && count > 0 ? <span className="text-[13px]">{count}</span> : null}
          </button>
        );
      })}
      {collapsed ? null : (
        <button
          type="button"
          aria-expanded={showMore}
          className="mr-3 mt-1 flex h-8 w-[calc(100%-12px)] cursor-pointer items-center rounded-r-full pr-3 pl-6 text-left text-[14px] text-[#202124] hover:bg-[#e8eaed] active:bg-[#dadce0]"
          onClick={onToggleMore}
        >
          {showMore ? <ChevronUp className="size-5 text-[#444746]" /> : <ChevronDown className="size-5 text-[#444746]" />}
          <span className="ml-4">{showMore ? "Less" : "More"}</span>
        </button>
      )}
      {collapsed || labels.length === 0 ? null : (
        <div className="mt-4">
          <p className="px-6 py-2 text-[14px] font-medium">Labels</p>
          {labels.map((label) => (
            <button
              key={label.id}
              type="button"
              className={`mr-3 flex h-8 w-[calc(100%-12px)] items-center gap-4 rounded-r-full pr-3 pl-6 text-left text-[14px] ${folder === "label" && labelId === label.id ? "bg-[#d3e3fd] font-bold" : "hover:bg-[#e8eaed]"}`}
              onClick={() => onLabel(label.id)}
            >
              <Tag className="size-5 text-[#444746]" />
              <span className="truncate">{label.name}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
