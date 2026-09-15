"use client";

import { Card, CardContent } from "@/components/ui/card";

export function SearchPreviewCard({
  title,
  url,
  description,
  faviconSrc = "/favicon-light.png",
}: {
  title: string;
  url: string;
  description: string;
  faviconSrc?: string;
}) {
  return (
    // Fixed-height SERP mock; description column can grow taller via flex-1 textarea
    <Card className="max-h-[126px] max-w-[400px] shrink-0 gap-0 overflow-hidden py-3 shadow-none">
      <CardContent className="min-w-0 space-y-2 px-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <img
            src={faviconSrc}
            alt=""
            className="size-3.5 shrink-0 rounded-sm object-cover"
            aria-hidden
          />
          <span className="truncate">{url}</span>
        </div>
        <a
          href="#"
          className="block truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          onClick={(e) => e.preventDefault()}
        >
          {title}
        </a>
        {description.length > 0 ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
