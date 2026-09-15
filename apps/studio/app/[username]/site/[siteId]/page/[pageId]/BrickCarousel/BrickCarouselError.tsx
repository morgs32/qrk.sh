"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export class BrickCarouselNoBricksError extends Error {
  readonly groupName: string;

  constructor(groupName: string) {
    super(`BrickCarousel: no bricks in group "${groupName}"`);
    this.name = "BrickCarouselNoBricksError";
    this.groupName = groupName;
  }
}

type BrickCarouselErrorProps = {
  children: ReactNode;
};

type BrickCarouselErrorState = {
  error: Error | null;
};

export class BrickCarouselError extends Component<
  BrickCarouselErrorProps,
  BrickCarouselErrorState
> {
  state: BrickCarouselErrorState = { error: null };

  static getDerivedStateFromError(error: Error): BrickCarouselErrorState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("BrickCarouselError:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const message =
        error instanceof BrickCarouselNoBricksError
          ? `This group has no bricks (${error.groupName}).`
          : error.message;
      return (
        <div
          role="alert"
          className="border-b border-border/60 bg-muted/40 px-6 py-4 text-sm text-muted-foreground dark:bg-muted/20"
        >
          {message}
        </div>
      );
    }
    return this.props.children;
  }
}
