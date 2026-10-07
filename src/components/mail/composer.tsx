"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Square, X } from "lucide-react";

export type ComposeValue = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  threadId?: string;
  replyToMessageId?: string;
  references?: string;
  mode: "compose" | "reply" | "reply-all" | "forward";
};

export function Composer({
  value,
  contacts,
  streamTick,
  onChange,
  onClose,
  onSend,
  sending,
  onAttach,
}: {
  value: ComposeValue;
  contacts: { name: string; email: string }[];
  streamTick: number;
  onChange: (value: ComposeValue) => void;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
  onAttach: (file: { filename: string; mimeType: string; contentBase64: string }) => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [showCc, setShowCc] = useState(value.cc.length > 0 || value.bcc.length > 0);
  const [toDraft, setToDraft] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your message" }),
    ],
    content: value.html,
    onUpdate: ({ editor: current }) => onChange({ ...value, html: current.getHTML() }),
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(value.html);
    // Only push streamed or newly opened content into the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamTick, editor]);

  const suggestions = contacts
    .filter((contact) => toDraft && `${contact.name} ${contact.email}`.toLowerCase().includes(toDraft.toLowerCase()))
    .slice(0, 5);

  function addChip(field: "to" | "cc" | "bcc", raw: string) {
    const email = raw.trim().replace(/,$/, "");
    if (!email.includes("@")) return;
    onChange({ ...value, [field]: [...value[field], email] });
  }

  return (
    <section
      data-testid="composer"
      className={`fixed z-40 flex flex-col overflow-hidden rounded-t-lg bg-background shadow-2xl ring-1 ring-foreground/10 ${maximized ? "inset-4" : minimized ? "right-4 bottom-0 h-10 w-80" : "right-4 bottom-0 h-[480px] w-[min(520px,calc(100vw-1.5rem))]"}`}
    >
      <header className="flex h-10 items-center bg-[#404040] px-3 text-sm text-white dark:bg-neutral-800">
        <span className="flex-1 truncate">{value.subject || "New message"}</span>
        <button type="button" aria-label="Minimize" className="rounded p-1 hover:bg-white/10" onClick={() => setMinimized((open) => !open)}>
          <Minus className="size-4" />
        </button>
        <button type="button" aria-label="Maximize" className="rounded p-1 hover:bg-white/10" onClick={() => { setMaximized((open) => !open); setMinimized(false); }}>
          <Square className="size-3.5" />
        </button>
        <button type="button" aria-label="Discard draft" className="rounded p-1 hover:bg-white/10" onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>
      {minimized ? null : (
        <>
          <ChipRow label="To" values={value.to} draft={toDraft} onDraft={setToDraft} onAdd={(raw) => { addChip("to", raw); setToDraft(""); }} onRemove={(email) => onChange({ ...value, to: value.to.filter((item) => item !== email) })} />
          {suggestions.length > 0 ? (
            <ul className="border-b bg-background">
              {suggestions.map((contact) => (
                <li key={contact.email}>
                  <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { onChange({ ...value, to: [...value.to, contact.email] }); setToDraft(""); }}>
                    {contact.name} <span className="text-muted-foreground">{contact.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end px-3">
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setShowCc((open) => !open)}>Cc Bcc</button>
          </div>
          {showCc ? (
            <>
              <ChipRow label="Cc" values={value.cc} onAdd={(raw) => addChip("cc", raw)} onRemove={(email) => onChange({ ...value, cc: value.cc.filter((item) => item !== email) })} />
              <ChipRow label="Bcc" values={value.bcc} onAdd={(raw) => addChip("bcc", raw)} onRemove={(email) => onChange({ ...value, bcc: value.bcc.filter((item) => item !== email) })} />
            </>
          ) : null}
          <Input aria-label="Subject" className="rounded-none border-x-0 border-t-0 shadow-none" placeholder="Subject" value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} />
          <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm [&_.ProseMirror]:min-h-40 [&_.ProseMirror]:outline-none" />
          <footer className="flex items-center gap-2 px-3 py-2">
            <Button data-testid="send-mail" className="rounded-full bg-[#0b57d0] text-white hover:bg-[#0b57d0]/90" disabled={sending} onClick={onSend}>
              Send
            </Button>
            <label className="cursor-pointer text-xs text-muted-foreground">
              Attach
              <input
                type="file"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  let binary = "";
                  for (const byte of bytes) binary += String.fromCharCode(byte);
                  onAttach({ filename: file.name, mimeType: file.type || "application/octet-stream", contentBase64: btoa(binary) });
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </footer>
        </>
      )}
    </section>
  );
}

function ChipRow({
  label,
  values,
  draft,
  onDraft,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  draft?: string;
  onDraft?: (value: string) => void;
  onAdd: (raw: string) => void;
  onRemove: (email: string) => void;
}) {
  const [local, setLocal] = useState("");
  const text = draft ?? local;
  const setText = onDraft ?? setLocal;
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 border-b px-3 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {values.map((email) => (
        <button key={email} type="button" className="rounded-full bg-muted px-2 py-0.5 text-xs" onClick={() => onRemove(email)}>
          {email} ×
        </button>
      ))}
      <input
        aria-label={label}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            onAdd(text);
            setText("");
          }
        }}
        onBlur={() => { if (text.includes("@")) { onAdd(text); setText(""); } }}
      />
    </div>
  );
}
