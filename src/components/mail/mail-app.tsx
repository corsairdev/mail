"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import { Archive, Menu, RefreshCw, Search, Star, Trash2, X } from "lucide-react";
import { useTRPC, useTRPCClient } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailBody } from "./email-body";
import { Composer, type ComposeValue } from "./composer";
import { GmailSidebar, type MailFolder } from "./gmail-sidebar";

const emptyCompose = (): ComposeValue => ({
  to: [],
  cc: [],
  bcc: [],
  subject: "",
  html: "<p></p>",
  mode: "compose",
});

type Folder = MailFolder;

export function MailApp() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const session = useQuery(trpc.session.queryOptions());
  const settings = useQuery(trpc.settings.get.queryOptions());
  const [folder, setFolder] = useState<Folder>("inbox");
  const [labelId, setLabelId] = useState<string>();
  const [category, setCategory] = useState<"primary" | "social" | "promotions">("primary");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [compose, setCompose] = useState<ComposeValue | null>(null);
  const [streamTick, setStreamTick] = useState(0);
  const [attachments, setAttachments] = useState<{ filename: string; mimeType: string; contentBase64: string }[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [eventCursor, setEventCursor] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showMore, setShowMore] = useState(true);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [proposal, setProposal] = useState<{ summary: string; start: string; end: string; timeZone: string; attendees: string[]; meet: boolean; description: string } | null>(null);
  const [limit, setLimit] = useState(80);

  const listInput = { folder, labelId, category: folder === "inbox" ? category : undefined, query, limit };
  const list = useQuery({ ...trpc.mail.list.queryOptions(listInput), refetchInterval: 2000 });
  const labels = useQuery(trpc.mail.labels.queryOptions());
  const contacts = useQuery(trpc.mail.contacts.queryOptions());
  const thread = useQuery({ ...trpc.mail.thread.queryOptions({ id: openId ?? "none" }), enabled: Boolean(openId) });
  const sync = useQuery(trpc.sync.state.queryOptions());

  useEffect(() => {
    const handle = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (session.data?.demo) return;
    let stop = false;
    const run = async () => {
      while (!stop) {
        await client.sync.step.mutate();
        await queryClient.invalidateQueries(trpc.mail.list.queryFilter());
        const result = await queryClient.fetchQuery(trpc.sync.state.queryOptions());
        const gmail = result.find((item) => item.plugin === "gmail");
        if (gmail?.status === "needs_connect" || stop) return;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    };
    void run().catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [client, queryClient, session.data?.demo, trpc.sync.state]);

  const events = useQuery({
    ...trpc.sync.events.queryOptions({ cursor: eventCursor ?? 0 }),
    enabled: eventCursor !== null,
    refetchInterval: 1000,
  });

  useEffect(() => {
    if (eventCursor !== null || !events.data && eventCursor === null) {
      if (eventCursor === null && events.fetchStatus === "idle") {
        void queryClient.fetchQuery(trpc.sync.recent.queryOptions()).then((rows) => {
          setEventCursor(rows[0]?.id ?? 0);
        });
      }
    }
  }, [eventCursor, events.data, events.fetchStatus, queryClient, trpc.sync.recent]);

  useEffect(() => {
    const rows = events.data ?? [];
    if (!rows.length || eventCursor === null) return;
    const max = Math.max(...rows.map((row) => row.id));
    if (max <= eventCursor) return;
    const mail = rows.filter((row) => row.plugin === "gmail" && row.eventType === "messageReceived");
    const ids = mail.map((row) => row.entityId ?? "");
    const timer = setTimeout(() => {
      setEventCursor(max);
      void queryClient.invalidateQueries(trpc.mail.list.queryFilter());
      void queryClient.invalidateQueries(trpc.calendar.events.queryFilter());
      if (mail.length) {
        setFresh((current) => [...current, ...ids]);
        toast("New mail", { description: "Just arrived" });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [eventCursor, events.data, queryClient, trpc.calendar.events, trpc.mail.list]);

  useSubscription(trpc.sync.onEvent.subscriptionOptions(undefined, {
    enabled: eventCursor !== null,
    onData(event) {
      if (event.data.plugin === "gmail") {
        void queryClient.invalidateQueries(trpc.mail.list.queryFilter());
        void queryClient.invalidateQueries(trpc.mail.thread.queryFilter());
      }
      if (event.data.plugin === "googlecalendar") {
        void queryClient.invalidateQueries(trpc.calendar.events.queryFilter());
      }
    },
  }));

  const invalidate = () => queryClient.invalidateQueries(trpc.mail.list.queryFilter());

  const archive = useMutation(trpc.mail.archive.mutationOptions({
    onMutate: async ({ threadId }) => {
      await queryClient.cancelQueries(trpc.mail.list.queryFilter());
      const previous = queryClient.getQueriesData(trpc.mail.list.queryFilter());
      queryClient.setQueriesData(trpc.mail.list.queryFilter(), (current: typeof list.data) => current && { ...current, threads: current.threads.filter((item) => item.id !== threadId) });
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error.message);
    },
    onSettled: invalidate,
  }));
  const trash = useMutation(trpc.mail.trash.mutationOptions({
    onMutate: async ({ threadId }) => {
      const previous = queryClient.getQueriesData(trpc.mail.list.queryFilter());
      queryClient.setQueriesData(trpc.mail.list.queryFilter(), (current: typeof list.data) => current && { ...current, threads: current.threads.filter((item) => item.id !== threadId) });
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error.message);
    },
    onSettled: invalidate,
  }));
  const star = useMutation(trpc.mail.star.mutationOptions({
    onMutate: async ({ threadId, starred }) => {
      await queryClient.cancelQueries(trpc.mail.list.queryFilter());
      const previous = queryClient.getQueriesData(trpc.mail.list.queryFilter());
      queryClient.setQueriesData(trpc.mail.list.queryFilter(), (current: typeof list.data) => current && {
        ...current,
        threads: current.threads.map((item) => item.id === threadId ? { ...item, starred } : item),
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error.message);
    },
    onSettled: invalidate,
  }));
  const markRead = useMutation(trpc.mail.read.mutationOptions({
    onMutate: async ({ threadId, read }) => {
      await queryClient.cancelQueries(trpc.mail.list.queryFilter());
      const previous = queryClient.getQueriesData(trpc.mail.list.queryFilter());
      queryClient.setQueriesData(trpc.mail.list.queryFilter(), (current: typeof list.data) => current && {
        ...current,
        threads: current.threads.map((item) => item.id === threadId ? { ...item, unread: !read } : item),
        unread: read ? Math.max(0, current.unread - (current.threads.find((item) => item.id === threadId)?.unread ? 1 : 0)) : current.unread,
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: invalidate,
  }));
  const send = useMutation(trpc.mail.send.mutationOptions({
    onSuccess: () => {
      toast.success("Sent");
      setCompose(null);
      setAttachments([]);
      void invalidate();
    },
    onError: (error) => toast.error(error.message),
  }));

  const threads = useMemo(() => list.data?.threads ?? [], [list.data]);
  const userLabels = (labels.data ?? []).filter((label) => label.type === "user");

  useEffect(() => {
    if (!compose) return;
    const snapshot = compose;
    const handle = setTimeout(() => {
      void client.mail.saveDraft.mutate({
        mode: snapshot.mode,
        threadId: snapshot.threadId,
        to: snapshot.to,
        cc: snapshot.cc,
        bcc: snapshot.bcc,
        subject: snapshot.subject,
        bodyHtml: snapshot.html,
      });
    }, 800);
    return () => clearTimeout(handle);
  }, [client, compose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.getElementById("mail-search")?.focus();
        return;
      }
      if (event.key === "Escape" && openId) {
        setOpenId(null);
        return;
      }
      if (typing) return;
      if (event.key === "c") setCompose(emptyCompose());
      if (event.key === "j") setCursorIndex((index) => Math.min(threads.length - 1, index + 1));
      if (event.key === "k") setCursorIndex((index) => Math.max(0, index - 1));
      if (event.key === "Enter") {
        const row = threads[cursorIndex];
        if (row) setOpenId(row.id);
      }
      if (event.key === "e") {
        const row = threads[cursorIndex];
        if (row) archive.mutate({ threadId: row.id });
      }
      if (event.key === "#") {
        const row = threads[cursorIndex];
        if (row) trash.mutate({ threadId: row.id });
      }
      if (event.key === "r" && openId) {
        const message = thread.data?.messages.at(-1);
        if (!message) return;
        setCompose({
          ...emptyCompose(),
          mode: "reply",
          to: [message.fromEmail],
          subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`,
          threadId: openId,
          replyToMessageId: message.messageIdHeader,
          references: message.messageIdHeader,
        });
        setStreamTick((tick) => tick + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [archive, cursorIndex, openId, thread.data?.messages, threads, trash]);

  async function streamInto(path: string, body: unknown, intoCompose: boolean) {
    setSummaryLoading(true);
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        if (intoCompose && compose) {
          setCompose({ ...compose, html: `<p>${text.replace(/\n/g, "</p><p>")}</p>` });
          setStreamTick((tick) => tick + 1);
        } else setSummary(text);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI failed");
    } finally {
      setSummaryLoading(false);
    }
  }

  const openCompose = () => {
    setCompose(emptyCompose());
    setStreamTick((tick) => tick + 1);
    setNavOpen(false);
  };

  const sidebarProps = {
    folder,
    labelId,
    unread: list.data?.unread ?? 0,
    labels: userLabels,
    showMore,
    onToggleMore: () => setShowMore((open) => !open),
    onCompose: openCompose,
    onSelect: (next: Exclude<Folder, "label">) => { setFolder(next); setOpenId(null); setLabelId(undefined); setNavOpen(false); },
    onLabel: (id: string) => { setFolder("label"); setLabelId(id); setOpenId(null); setNavOpen(false); },
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f8fc] dark:bg-background" data-testid="inbox">
      <header className="flex h-16 shrink-0 items-center gap-2 pr-3 pl-1">
        <button type="button" aria-label="Main menu" className="grid size-12 place-items-center rounded-full hover:bg-black/5" onClick={() => { if (window.innerWidth < 768) setNavOpen(true); else setCollapsed((value) => !value); }}>
          <Menu className="size-6 text-[#444746]" />
        </button>
        <a href="/mail" className="mr-2 hidden items-center gap-2 sm:flex">
          <img src="/corsair.png" alt="" width={32} height={32} className="size-8" />
          <span className="text-[22px] font-normal text-[#5f6368]">mail</span>
        </a>
        <div className="relative mx-auto w-full max-w-[720px]">
          <Search className="absolute top-3.5 left-4 size-5 text-[#444746]" />
          <Input id="mail-search" aria-label="Search mail" data-testid="mail-search" className="h-12 rounded-lg border-0 bg-[#eaf1fb] pr-12 pl-12 shadow-none focus-visible:bg-background focus-visible:shadow-md" placeholder="Search mail" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" aria-label="Refresh" className="absolute top-3 right-3 text-[#444746]" onClick={() => invalidate()}><RefreshCw className="size-5" /></button>
        </div>
        {session.isPending ? <span data-testid="connection-state" className="sr-only">Loading</span> : session.data?.demo ? <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 sm:inline" data-testid="connection-state">Demo mailbox</span> : <span data-testid="connection-state" className="hidden max-w-40 truncate text-xs text-[#444746] sm:inline">{session.data?.user.email}</span>}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden shrink-0 md:block"><GmailSidebar {...sidebarProps} collapsed={collapsed} /></aside>
        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setNavOpen(false)} />
            <div className="absolute inset-y-0 left-0 z-10 bg-[#f6f8fc] shadow-xl"><GmailSidebar {...sidebarProps} collapsed={false} /></div>
          </div>
        ) : null}
        <section className="mr-2 mb-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background">
        {folder === "inbox" ? (
          <Tabs value={category} onValueChange={(value) => setCategory(value as typeof category)}>
            <TabsList variant="line" className="px-3">
              <TabsTrigger value="primary">Primary</TabsTrigger>
              <TabsTrigger value="social">Social</TabsTrigger>
              <TabsTrigger value="promotions">Promotions</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        {!session.data?.demo && threads.length === 0 && sync.data?.some((item) => item.status === "syncing") ? (
          <p className="px-4 py-2 text-xs text-[#5f6368]">Loading your mail… {sync.data.find((item) => item.plugin === "gmail")?.progress ?? 0}%</p>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div
            className={`${openId ? "hidden w-[400px] min-w-[400px] shrink-0 overflow-y-auto border-r border-[#e8eaed] lg:block" : "w-full overflow-y-auto"}`}
            onScroll={(event) => {
              const el = event.currentTarget;
              if (el.scrollTop + el.clientHeight < el.scrollHeight - 240) return;
              if ((list.data?.nextCursor ?? null) !== null) setLimit((current) => Math.min(current + 80, 2000));
            }}
          >
            {list.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div> : null}
            {list.error ? <p className="p-6 text-sm text-destructive">{list.error.message}</p> : null}
            {!list.isLoading && !list.error && threads.length === 0 ? <p className="p-8 text-sm text-muted-foreground" data-testid="empty-mail">Nothing in this folder.</p> : null}
            {threads.map((item, index) => {
              const active = openId === item.id || cursorIndex === index;
              return (
              <div key={item.id} data-testid="thread-row" className={`group relative grid h-11 cursor-pointer grid-cols-[24px_22px_minmax(0,148px)_minmax(0,1fr)_76px] items-center gap-2 border-b border-[#f1f3f4] px-2 text-[13.5px] ${active ? "bg-[#c2d7ff]" : item.unread ? "bg-white" : "bg-[#f2f6fc]"} ${fresh.includes(item.id) ? "mail-fresh" : ""} hover:z-10 hover:shadow-[0_1px_2px_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)]`} onClick={() => { setOpenId(item.id); setCursorIndex(index); markRead.mutate({ threadId: item.id, read: true }); }}>
                <Checkbox checked={checked.includes(item.id)} onCheckedChange={(value) => setChecked((current) => value ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={`Select ${item.subject}`} onClick={(event) => event.stopPropagation()} />
                <button type="button" aria-label={item.starred ? "Unstar" : "Star"} className="text-[#5f6368]" onClick={(event) => { event.stopPropagation(); star.mutate({ threadId: item.id, starred: !item.starred }); }}>
                  <Star className={`size-[18px] ${item.starred ? "fill-[#f4b400] text-[#f4b400]" : ""}`} />
                </button>
                <span className={`truncate text-[#202124] ${item.unread ? "font-semibold" : ""}`}>{item.fromName}</span>
                <span className="truncate">
                  <span className={item.unread ? "font-semibold text-[#202124]" : "text-[#202124]"}>{item.subject}</span>
                  {item.snippet ? <span className="font-normal text-[#5f6368]"> — {item.snippet}</span> : null}
                </span>
                <span className="relative text-right text-xs whitespace-nowrap tabular-nums">
                  <span className={`group-hover:invisible ${item.unread ? "font-semibold text-[#202124]" : "text-[#5f6368]"}`}>{gmailDate(item.date)}</span>
                  <span className="absolute inset-y-0 right-0 hidden items-center gap-2 group-hover:flex">
                    <button type="button" aria-label="Archive" onClick={(event) => { event.stopPropagation(); archive.mutate({ threadId: item.id }); }}><Archive className="size-4 text-[#5f6368]" /></button>
                    <button type="button" aria-label="Trash" onClick={(event) => { event.stopPropagation(); trash.mutate({ threadId: item.id }); }}><Trash2 className="size-4 text-[#5f6368]" /></button>
                  </span>
                </span>
              </div>
              );
            })}
          </div>
          <div className={`${openId ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-y-auto px-6 py-5`} data-testid="thread-view">
            {!openId ? <p className="m-auto text-sm text-muted-foreground">Select a conversation</p> : null}
            {thread.isLoading && openId ? <Skeleton className="h-40 w-full" /> : null}
            {thread.error && openId ? <p className="text-sm text-destructive">{thread.error.message}</p> : null}
            {openId ? (
              <div className="mb-5 flex items-start gap-2">
                <button type="button" aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[#e8eaed]" onClick={() => setOpenId(null)}>
                  <X className="size-5 text-[#444746]" />
                </button>
                {thread.data?.messages[0] ? <h2 className="pt-1.5 text-[22px] leading-7 font-normal text-[#1f1f1f]">{thread.data.messages[0].subject}</h2> : null}
              </div>
            ) : null}
            {thread.data?.messages.map((message) => (
              <article key={message.id} className="mb-3 rounded-2xl border border-[#e0e0e0] px-5 py-4 shadow-[0_1px_2px_rgba(60,64,67,.08)]">
                <header className="mb-3 flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-sm font-medium text-[#1967d2]">{message.fromName.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#202124]">{message.fromName}</p>
                    <p className="truncate text-xs text-[#5f6368]">to {message.to.join(", ") || "me"}</p>
                  </div>
                  <time className="shrink-0 text-xs text-[#5f6368]">{new Date(message.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                </header>
                <EmailBody html={message.html} blockImages={settings.data?.blockRemoteImages ?? false} />
                {message.attachments.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((file) => (
                      <li key={file.filename}>
                        <a className="rounded-full border px-3 py-1 text-xs" href={`/api/attachment?messageId=${message.id}&filename=${encodeURIComponent(file.filename)}`}>{file.filename}</a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
            {openId && thread.data ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => {
                  const message = thread.data.messages.at(-1);
                  if (!message) return;
                  setCompose({ ...emptyCompose(), mode: "reply", to: [message.fromEmail], subject: `Re: ${message.subject}`, threadId: openId, replyToMessageId: message.messageIdHeader, references: message.messageIdHeader });
                  setStreamTick((tick) => tick + 1);
                }}>Reply</Button>
                <Button variant="outline" onClick={() => {
                  const message = thread.data.messages.at(-1);
                  if (!message) return;
                  setCompose({ ...emptyCompose(), mode: "reply-all", to: [message.fromEmail, ...message.to, ...message.cc].filter((email, index, all) => all.indexOf(email) === index), subject: `Re: ${message.subject}`, threadId: openId, replyToMessageId: message.messageIdHeader, references: message.messageIdHeader });
                  setStreamTick((tick) => tick + 1);
                }}>Reply all</Button>
                <Button variant="outline" onClick={() => {
                  const message = thread.data.messages.at(-1);
                  if (!message) return;
                  setCompose({ ...emptyCompose(), mode: "forward", subject: `Fwd: ${message.subject}`, html: `<p></p><blockquote>${message.html}</blockquote>`, threadId: openId });
                  setStreamTick((tick) => tick + 1);
                }}>Forward</Button>
                <Button variant="outline" disabled={summaryLoading} onClick={() => { setSummary(""); void streamInto("/api/ai/summarize", { threadId: openId }, false); }}>Summarize</Button>
                <Button variant="outline" onClick={() => {
                  setCompose((current) => current ?? { ...emptyCompose(), mode: "reply", to: [thread.data?.messages.at(-1)?.fromEmail ?? ""], subject: `Re: ${thread.data?.messages.at(-1)?.subject ?? ""}`, threadId: openId });
                  void streamInto("/api/ai/draft", { threadId: openId, tone: "friendly" }, true);
                }}>Draft reply</Button>
                <Button variant="outline" onClick={async () => {
                  const response = await fetch("/api/ai/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: openId }) });
                  if (!response.ok) { toast.error("Could not read a meeting from this thread"); return; }
                  setProposal(await response.json());
                }}>Schedule from email</Button>
              </div>
            ) : null}
            {summary ? <pre className="mt-4 rounded-xl bg-muted p-4 text-sm whitespace-pre-wrap" data-testid="ai-summary">{summary}</pre> : null}
            {proposal ? (
              <div className="mt-4 rounded-xl border p-4" data-testid="schedule-card">
                <p className="font-medium">{proposal.summary}</p>
                <p className="text-sm text-muted-foreground">{new Date(proposal.start).toLocaleString()} · {proposal.attendees.join(", ") || "No guests"}</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={async () => {
                    await queryClient.getMutationCache().build(queryClient, trpc.calendar.create.mutationOptions()).execute(proposal);
                    toast.success(session.data?.demo ? "Event created in the demo calendar" : "Invite sent");
                    setProposal(null);
                  }}>Create invite</Button>
                  <Button variant="outline" onClick={() => setProposal(null)}>Dismiss</Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      </div>
      {compose ? (
        <Composer
          value={compose}
          contacts={contacts.data ?? []}
          streamTick={streamTick}
          onChange={setCompose}
          onClose={() => setCompose(null)}
          sending={send.isPending}
          onAttach={(file) => setAttachments((current) => [...current, file])}
          onSend={() => {
            const to = [...compose.to];
            const pending = (document.querySelector<HTMLInputElement>("[aria-label='To']")?.value ?? "").trim();
            if (pending.includes("@")) to.push(pending);
            send.mutate({ ...compose, to, attachments });
          }}
        />
      ) : null}
    </div>
  );
}

function gmailDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return String(date.getFullYear());
}
