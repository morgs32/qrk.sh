"use client";

export function HeroCopy() {
  return (
    <div className="fixed left-0 top-16 flex h-[calc(100vh-4rem)] w-1/2 flex-col justify-center bg-background px-6">
      <h1 className="text-[clamp(4rem,15vw,10rem)] font-bold leading-none tracking-tight">Hello</h1>
      <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
        We are a Sydney-based design studio specialising in branding and wayfinding.
      </p>
    </div>
  );
}
