"use client";

import { FileText, Globe, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { pagePattern } from "../../../routePatterns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function PageSettings() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("Make it Rainey");
  const [description, setDescription] = useState(
    "We are helping Austin home owners save $600 or more on their property taxes.",
  );

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <FileText className="size-5 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight">Page Settings</h1>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-8 px-3">
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 cursor-pointer"
            aria-label="Close drawer"
            onClick={() => router.push(pagePattern.href({ ...params }))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="space-y-8 px-4 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="page-title">Title</Label>
            <Input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:gap-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="page-description">Description</Label>
              <Textarea
                id="page-description"
                className="min-h-[126px] flex-1 resize-y field-sizing-fixed"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Label>Preview</Label>
              {/* Fixed-height SERP mock; description column can grow taller via flex-1 textarea */}
              <Card className="max-h-[126px] max-w-[400px] shrink-0 overflow-hidden py-4 shadow-none">
                <CardContent className="min-w-0 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">makeitrainey.framer.website</span>
                  </div>
                  <a
                    href="#"
                    className="block truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    onClick={(e) => e.preventDefault()}
                  >
                    {title}
                  </a>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="font-medium">Danger Zone</div>
            <p className="text-sm text-muted-foreground">
              Unpublish your website from all domains.
            </p>
          </div>
          <Button type="button" variant="destructive" className="shrink-0">
            Unpublish
          </Button>
        </div>
      </div>
    </div>
  );
}
