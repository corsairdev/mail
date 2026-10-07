import DOMPurify from "isomorphic-dompurify";

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

export function blockRemoteImages(html: string): string {
  return html.replace(/\ssrc=(['"])https?:[^'"]+\1/gi, " data-remote-image=$1blocked$1");
}
