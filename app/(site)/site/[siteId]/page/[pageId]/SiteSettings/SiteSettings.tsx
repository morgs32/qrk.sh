"use client";

import { Globe, X } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { pagePattern } from "../../../routePatterns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function SiteSettings() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("Make it Rainey");
  const [description, setDescription] = useState(
    "We are helping Austin home owners save $600 or more on their property taxes.",
  );
  const [language, setLanguage] = useState("en");

  const [accessibility, setAccessibility] = useState(true);
  const [navigation, setNavigation] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState(false);
  const [automaticLocale, setAutomaticLocale] = useState(false);
  const [passwordProtect, setPasswordProtect] = useState(false);

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur-sm">
        <Globe className="size-5 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-tight">Site Settings</h1>
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
          <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
            <div className="flex h-full min-h-0 flex-col gap-2">
              <Label htmlFor="site-description">Description</Label>
              <Textarea
                id="site-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex h-full min-h-0 flex-col gap-2">
              <Label>Preview</Label>
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

        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Site Images</h2>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="space-y-1">
              <div className="font-medium">Logo</div>
              <p className="text-sm text-muted-foreground">
                PNG or SVG; height up to 48px recommended
              </p>
            </div>
            <div className="flex flex-col items-start gap-4">
              <Button type="button" variant="outline">
                Upload
              </Button>
              <div className="relative flex w-full max-w-[375px] min-h-16 items-center justify-center overflow-hidden rounded-md border bg-muted">
                <span className="text-sm text-muted-foreground">Logo</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-6 md:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="space-y-1">
                <div className="font-medium">Favicon</div>
                <p className="text-sm text-muted-foreground">64 × 64 pixels</p>
              </div>
              <div className="flex flex-wrap justify-start gap-4">
                <div className="flex flex-col items-start gap-2">
                  <span className="text-xs text-muted-foreground">Light</span>
                  <Button type="button" size="sm" variant="outline">
                    Upload
                  </Button>
                  <div className="flex w-36 flex-col overflow-hidden rounded-md border bg-muted/30">
                    <div className="flex items-center gap-1 border-b bg-background px-2 py-1.5">
                      <div className="size-4 shrink-0 rounded-sm bg-muted" />
                      <div className="h-2 min-w-0 flex-1 rounded bg-muted/80" />
                    </div>
                    <div className="h-16 bg-background" />
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span className="text-xs text-muted-foreground">Dark</span>
                  <Button type="button" size="sm" variant="outline">
                    Upload
                  </Button>
                  <div className="flex w-36 flex-col overflow-hidden rounded-md border bg-muted/30">
                    <div className="flex items-center gap-1 border-b bg-zinc-900 px-2 py-1.5">
                      <div className="size-4 shrink-0 rounded-sm bg-zinc-700" />
                      <div className="h-2 min-w-0 flex-1 rounded bg-zinc-600" />
                    </div>
                    <div className="h-16 bg-zinc-950" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="space-y-1">
                <div className="font-medium">Social Preview</div>
                <p className="text-sm text-muted-foreground">1200 × 630 pixels</p>
              </div>
              <div className="flex flex-col items-start gap-4">
                <Button type="button" variant="outline">
                  Upload
                </Button>
                <div className="relative w-full max-w-[375px] overflow-hidden rounded-md border bg-muted">
                  <div className="relative aspect-[375/197] w-full">
                    <Image
                      src="/site-settings-social-preview.png"
                      alt="Social preview"
                      fill
                      className="object-cover"
                      sizes="(max-width: 767px) 100vw, 375px"
                      priority
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
