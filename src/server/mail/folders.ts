export type Folder = "inbox" | "starred" | "sent" | "drafts" | "trash" | "spam" | "label";
export type Category = "primary" | "social" | "promotions";

export function inFolder(labels: string[], folder: Folder, labelId?: string): boolean {
  const has = (id: string) => labels.includes(id);
  if (folder === "trash") return has("TRASH");
  if (folder === "spam") return has("SPAM") && !has("TRASH");
  if (has("TRASH") || has("SPAM")) return false;
  if (folder === "label") return labelId ? has(labelId) : false;
  if (folder === "starred") return has("STARRED");
  if (folder === "sent") return has("SENT");
  if (folder === "drafts") return has("DRAFT");
  return has("INBOX");
}

export function categoryOf(labels: string[]): Category | "other" {
  if (labels.includes("CATEGORY_SOCIAL")) return "social";
  if (labels.includes("CATEGORY_PROMOTIONS")) return "promotions";
  if (labels.includes("CATEGORY_PERSONAL") || labels.includes("INBOX")) return "primary";
  return "other";
}

export function threadLabelIds(messages: { labelIds: string[] }[]): string[] {
  const live = messages.filter((item) => !item.labelIds.includes("TRASH") && !item.labelIds.includes("SPAM"));
  return [...new Set((live.length ? live : messages).flatMap((item) => item.labelIds))];
}
