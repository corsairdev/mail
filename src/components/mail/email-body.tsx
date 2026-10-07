"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

function blockRemoteImages(html: string): string {
  return html.replace(/\ssrc=(['"])https?:[^'"]+\1/gi, " data-remote-image=$1blocked$1");
}

export function EmailBody({ html, blockImages }: { html: string; blockImages: boolean }) {
  const [showImages, setShowImages] = useState(false);
  const hasRemote = /src=(['"])https?:/i.test(html);
  const safe = useMemo(() => (blockImages && !showImages ? blockRemoteImages(html) : html), [blockImages, html, showImages]);
  return (
    <div>
      {blockImages && hasRemote && !showImages ? (
        <Button type="button" variant="outline" size="sm" className="mb-2" onClick={() => setShowImages(true)}>
          Load images
        </Button>
      ) : null}
      <div
        className="max-w-full overflow-x-auto text-sm leading-relaxed break-words text-[#202124] [&_a]:text-[#0b57d0] [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[#dadce0] [&_blockquote]:pl-2.5 [&_blockquote]:text-[#5f6368] [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
        dangerouslySetInnerHTML={{ __html: safe }}
        ref={(node) => {
          node?.querySelectorAll("a").forEach((link) => {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noreferrer");
          });
        }}
      />
    </div>
  );
}
