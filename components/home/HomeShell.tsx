'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType
} from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type DropAnimation
} from '@dnd-kit/core';
import { X } from 'lucide-react';
import { BottomToolbar } from '@/components/home/BottomToolbar';
import { PortfolioGrid } from '@/components/home/PortfolioGrid';
import { homepageTiles } from './tiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sizeToDimensions, usePortfolioGridStore } from '@/lib/stores/portfolio-grid-store';

type WorkItem = {
  name: string;
  category: string;
};

type HomeShellProps = {
  workItems: WorkItem[];
};

type HomepageTile = (typeof homepageTiles)[number];
type DrawerHomepageTile = HomepageTile & {
  dims: { w: number; h: number };
};

type DrawerDragState = {
  draggableId: string;
  typeId: string;
  Component: ComponentType;
  dims: { w: number; h: number };
  previewWidth: number;
  previewHeight: number;
  fullWidth: number;
  fullHeight: number;
  pointerOffset: { x: number; y: number };
  outcome: 'dragging' | 'drop-grid' | 'drop-cancel';
  scaleMode: 'preview' | 'full';
};

type DrawerTileDraggableProps = {
  tile: DrawerHomepageTile;
  previewWidth: number;
  previewHeight: number;
};

const DRAWER_PREVIEW_UNIT_PX = 96;
const CANCEL_DROP_ANIMATION_DURATION_MS = 450;
const OVERLAY_GROW_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const OVERLAY_RETURN_EASING = 'cubic-bezier(0.18, 0.67, 0.6, 1.22)';

type GridBridgeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type GridBridgeDetail = {
  clientCoordinates: { x: number; y: number };
  overlayRect: GridBridgeRect;
};

type GridBridgeEvent = MouseEvent & {
  qrkDragOffsetX?: number;
  qrkDragOffsetY?: number;
  qrkDrawerTypeId?: string;
};

function toTransformString({
  x,
  y,
  scaleX,
  scaleY
}: {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}) {
  return `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY})`;
}

const CANCEL_DROP_ANIMATION: DropAnimation = ({
  active,
  dragOverlay,
  transform
}) => {
  if (
    active.rect.width <= 0 ||
    active.rect.height <= 0 ||
    dragOverlay.rect.width <= 0 ||
    dragOverlay.rect.height <= 0
  ) {
    return;
  }

  const deltaX = dragOverlay.rect.left - active.rect.left;
  const deltaY = dragOverlay.rect.top - active.rect.top;
  const finalTransform = {
    x: transform.x - deltaX,
    y: transform.y - deltaY,
    scaleX: (active.rect.width * transform.scaleX) / dragOverlay.rect.width,
    scaleY: (active.rect.height * transform.scaleY) / dragOverlay.rect.height
  };

  const animation = dragOverlay.node.animate(
    [
      {
        transform: toTransformString(transform)
      },
      {
        transform: toTransformString(finalTransform)
      }
    ],
    {
      duration: CANCEL_DROP_ANIMATION_DURATION_MS,
      easing: OVERLAY_RETURN_EASING,
      fill: 'forwards'
    }
  );

  return new Promise<void>((resolve) => {
    animation.onfinish = () => resolve();
  });
};

function getDrawerDraggableId(typeId: string) {
  return `drawer-tile:${typeId}`;
}

function getClientCoordinates(event: Event | null) {
  if (!event) {
    return null;
  }

  const pointerEvent = event as Event & {
    clientX?: number;
    clientY?: number;
    touches?: TouchList;
    changedTouches?: TouchList;
  };

  if (
    typeof pointerEvent.clientX === 'number' &&
    typeof pointerEvent.clientY === 'number'
  ) {
    return { x: pointerEvent.clientX, y: pointerEvent.clientY };
  }

  const touch =
    pointerEvent.changedTouches?.[0] ?? pointerEvent.touches?.[0] ?? null;

  if (!touch) {
    return null;
  }

  return { x: touch.clientX, y: touch.clientY };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectsIntersect(first: GridBridgeRect, second: GridBridgeRect) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

function getPortfolioGridElement() {
  return document.querySelector<HTMLElement>('.portfolio-grid');
}

function getTranslatedRect(
  event: DragMoveEvent | DragEndEvent
): {
  left: number;
  top: number;
} | null {
  const translatedRect =
    event.active.rect.current.translated ?? event.active.rect.current.initial;

  if (!translatedRect) {
    return null;
  }

  return {
    left: translatedRect.left,
    top: translatedRect.top
  };
}

function getGridBridgeDetail(
  drag: DrawerDragState,
  translatedRect: { left: number; top: number }
): GridBridgeDetail {
  return {
    clientCoordinates: {
      x: translatedRect.left + drag.pointerOffset.x,
      y: translatedRect.top + drag.pointerOffset.y
    },
    overlayRect: {
      left: translatedRect.left,
      top: translatedRect.top,
      right: translatedRect.left + drag.fullWidth,
      bottom: translatedRect.top + drag.fullHeight
    }
  };
}

function createGridBridgeEvent(
  type: 'dragenter' | 'dragover' | 'dragleave' | 'drop',
  detail: GridBridgeDetail,
  drag: DrawerDragState
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: detail.clientCoordinates.x,
    clientY: detail.clientCoordinates.y
  }) as GridBridgeEvent;

  Object.defineProperties(event, {
    qrkDragOffsetX: {
      value: drag.fullWidth / 2 - drag.pointerOffset.x
    },
    qrkDragOffsetY: {
      value: drag.fullHeight / 2 - drag.pointerOffset.y
    },
    qrkDrawerTypeId: {
      value: drag.typeId
    }
  });

  return event;
}

function DrawerDragOverlayTile({ drag }: { drag: DrawerDragState }) {
  const scaleX =
    drag.scaleMode === 'full' || drag.fullWidth <= 0
      ? 1
      : drag.previewWidth / drag.fullWidth;
  const scaleY =
    drag.scaleMode === 'full' || drag.fullHeight <= 0
      ? 1
      : drag.previewHeight / drag.fullHeight;
  const transitionMs =
    drag.outcome === 'dragging' ? 180 : 0;

  return (
    <div
      data-testid="drawer-drag-overlay"
      className="pointer-events-none overflow-hidden rounded-md shadow-2xl ring-1 ring-black/5"
      style={{
        width: drag.fullWidth,
        height: drag.fullHeight
      }}
    >
      <div
        className="h-full w-full overflow-hidden rounded-md"
        style={{
          transform: `scale(${scaleX}, ${scaleY})`,
          transformOrigin: 'top left',
          transition:
            transitionMs > 0
              ? `transform ${transitionMs}ms ${OVERLAY_GROW_EASING}`
              : undefined
        }}
      >
        <drag.Component />
      </div>
    </div>
  );
}

function DrawerTileDraggable({
  tile,
  previewWidth,
  previewHeight
}: DrawerTileDraggableProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, isDragging } =
    useDraggable({
      id: getDrawerDraggableId(tile.typeId),
      data: {
        typeId: tile.typeId
      },
      attributes: {
        role: 'button',
        roleDescription: 'draggable tile',
        tabIndex: 0
      }
    });

  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      setActivatorNodeRef(node);
    },
    [setActivatorNodeRef, setNodeRef]
  );

  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <div
        data-drawer-tile-slot
        data-dragging={isDragging ? 'true' : undefined}
        style={{
          width: previewWidth,
          height: previewHeight
        }}
        className="shrink-0 rounded-md bg-muted/20 ring-1 ring-transparent transition-[background-color,box-shadow] data-[dragging=true]:bg-muted/35 data-[dragging=true]:ring-border/50"
      >
        <div
          ref={setRefs}
          data-drawer-tile-type={tile.typeId}
          className="h-full w-full cursor-grab select-none overflow-hidden rounded-md outline-none hover:bg-muted/40 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Drag ${tile.collectionLabel} ${tile.dims.w}×${tile.dims.h}`}
          {...attributes}
          {...listeners}
        >
          <div className="h-full w-full">
            <tile.Component />
          </div>
        </div>
      </div>
      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {tile.dims.w}×{tile.dims.h}
      </span>
    </div>
  );
}

export function HomeShell({ workItems }: HomeShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [drawerDrag, setDrawerDrag] = useState<DrawerDragState | null>(null);
  const [overlayDropMode, setOverlayDropMode] = useState<'cancel' | 'none'>(
    'cancel'
  );
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const drawerDragRef = useRef<DrawerDragState | null>(null);
  const gridExternalDragRef = useRef({ isOver: false });
  const cancelDropCleanupTimeoutRef = useRef<number | null>(null);
  const activeBreakpoint = usePortfolioGridStore((state) => state.activeBreakpoint);
  const addInstanceAt = usePortfolioGridStore((state) => state.addInstanceAt);
  const gridCellHeightPx = usePortfolioGridStore((state) => state.gridCellHeightPx);
  const setExternalDraggingTypeId = usePortfolioGridStore(
    (state) => state.setExternalDraggingTypeId
  );
  const setExternalDropPosition = usePortfolioGridStore(
    (state) => state.setExternalDropPosition
  );

  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  useEffect(() => {
    drawerDragRef.current = drawerDrag;
  }, [drawerDrag]);

  useEffect(() => {
    return () => {
      if (cancelDropCleanupTimeoutRef.current !== null) {
        window.clearTimeout(cancelDropCleanupTimeoutRef.current);
      }

      setExternalDraggingTypeId(null);
      setExternalDropPosition(null);
    };
  }, [setExternalDraggingTypeId, setExternalDropPosition]);

  useEffect(() => {
    if (!drawerDrag || drawerDrag.scaleMode !== 'preview' || drawerDrag.outcome !== 'dragging') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setDrawerDrag((current) => {
        if (
          !current ||
          current.draggableId !== drawerDrag.draggableId ||
          current.outcome !== 'dragging'
        ) {
          return current;
        }

        return {
          ...current,
          scaleMode: 'full'
        };
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [drawerDrag]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen]);

  useEffect(() => {
    const allowBackgroundScroll = (event: Event) => {
      if (!isDrawerOpenRef.current) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const rightColumn = document.querySelector<HTMLElement>('[data-home-right-scroll]');
      if (rightColumn && rightColumn.contains(target)) {
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('wheel', allowBackgroundScroll, { capture: true });
    window.addEventListener('touchmove', allowBackgroundScroll, { capture: true });

    return () => {
      window.removeEventListener('wheel', allowBackgroundScroll, { capture: true } as never);
      window.removeEventListener('touchmove', allowBackgroundScroll, { capture: true } as never);
    };
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 140,
        tolerance: 8
      }
    })
  );

  const clearCancelDropCleanup = useCallback(() => {
    if (cancelDropCleanupTimeoutRef.current !== null) {
      window.clearTimeout(cancelDropCleanupTimeoutRef.current);
      cancelDropCleanupTimeoutRef.current = null;
    }
  }, []);

  const queueCancelDropCleanup = useCallback(() => {
    clearCancelDropCleanup();
    cancelDropCleanupTimeoutRef.current = window.setTimeout(() => {
      drawerDragRef.current = null;
      setDrawerDrag(null);
      cancelDropCleanupTimeoutRef.current = null;
    }, CANCEL_DROP_ANIMATION_DURATION_MS + 40);
  }, [clearCancelDropCleanup]);

  const endGridExternalDrag = useCallback(
    ({
      drag,
      detail,
      mode
    }: {
      drag: DrawerDragState | null;
      detail: GridBridgeDetail | null;
      mode: 'cancel' | 'drop';
    }) => {
      const gridElement = getPortfolioGridElement();

      if (gridExternalDragRef.current.isOver && gridElement && drag && detail) {
        gridElement.dispatchEvent(
          createGridBridgeEvent(mode === 'drop' ? 'drop' : 'dragleave', detail, drag)
        );
      }

      gridExternalDragRef.current.isOver = false;
      setExternalDraggingTypeId(null);
    },
    [setExternalDraggingTypeId]
  );

  const syncGridExternalDrag = useCallback(
    (drag: DrawerDragState, detail: GridBridgeDetail) => {
      const gridElement = getPortfolioGridElement();
      if (!gridElement) {
        gridExternalDragRef.current.isOver = false;
        return false;
      }

      const gridRect = gridElement.getBoundingClientRect();
      const isOverGrid = rectsIntersect(detail.overlayRect, gridRect);

      if (isOverGrid) {
        if (!gridExternalDragRef.current.isOver) {
          gridElement.dispatchEvent(createGridBridgeEvent('dragenter', detail, drag));
        }

        gridElement.dispatchEvent(createGridBridgeEvent('dragover', detail, drag));
      } else if (gridExternalDragRef.current.isOver) {
        gridElement.dispatchEvent(createGridBridgeEvent('dragleave', detail, drag));
      }

      gridExternalDragRef.current.isOver = isOverGrid;
      return isOverGrid;
    },
    []
  );

  const tileByTypeId = useMemo(() => {
    return new Map(homepageTiles.map((tile) => [tile.typeId, tile]));
  }, []);

  const filteredCollections = (() => {
    const q = query.trim().toLowerCase();
    const collections = new Map<
      string,
      { collectionId: string; label: string; tiles: DrawerHomepageTile[] }
    >();

    homepageTiles.forEach((tile) => {
      const entry =
        collections.get(tile.collectionId) ??
        {
          collectionId: tile.collectionId,
          label: tile.collectionLabel,
          tiles: []
        };

      entry.tiles.push({
        ...tile,
        dims: sizeToDimensions(tile.size)
      });
      collections.set(tile.collectionId, entry);
    });

    const ordered = Array.from(collections.values()).map((collection) => ({
      ...collection,
      tiles: [...collection.tiles].sort((a, b) => {
        const order = (size: string) => (size === '1x1' ? 0 : size === '2x2' ? 1 : 2);
        return order(a.size) - order(b.size);
      })
    }));

    if (!q) {
      return ordered;
    }

    return ordered
      .map((collection) => {
        const matchesCollection =
          collection.label.toLowerCase().includes(q) ||
          collection.collectionId.toLowerCase().includes(q);
        const matchingTiles = collection.tiles.filter(
          (tile) => tile.typeId.toLowerCase().includes(q)
        );

        return matchesCollection ? collection : { ...collection, tiles: matchingTiles };
      })
      .filter((collection) => collection.tiles.length > 0);
  })();

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      clearCancelDropCleanup();
      setOverlayDropMode('cancel');
      gridExternalDragRef.current.isOver = false;

      const typeId =
        typeof event.active.data.current?.typeId === 'string'
          ? event.active.data.current.typeId
          : String(event.active.id).replace(/^drawer-tile:/, '');
      const tile = tileByTypeId.get(typeId);

      if (!tile) {
        setDrawerDrag(null);
        return;
      }

      const dims = sizeToDimensions(tile.size);
      const previewWidth = dims.w * DRAWER_PREVIEW_UNIT_PX;
      const previewHeight = dims.h * DRAWER_PREVIEW_UNIT_PX;
      const fullUnitPx =
        gridCellHeightPx && gridCellHeightPx > 0 ? gridCellHeightPx : DRAWER_PREVIEW_UNIT_PX;
      const sourceRect = event.active.rect.current.initial;
      const activatorCoordinates = getClientCoordinates(event.activatorEvent);
      const pointerOffset = sourceRect
        ? {
            x: clamp(
              activatorCoordinates?.x ?? sourceRect.left + sourceRect.width / 2,
              sourceRect.left,
              sourceRect.right
            ) - sourceRect.left,
            y: clamp(
              activatorCoordinates?.y ?? sourceRect.top + sourceRect.height / 2,
              sourceRect.top,
              sourceRect.bottom
            ) - sourceRect.top
          }
        : {
            x: previewWidth / 2,
            y: previewHeight / 2
          };

      const nextDragState: DrawerDragState = {
        draggableId: String(event.active.id),
        typeId,
        Component: tile.Component,
        dims,
        previewWidth,
        previewHeight,
        fullWidth: dims.w * fullUnitPx,
        fullHeight: dims.h * fullUnitPx,
        pointerOffset,
        outcome: 'dragging',
        scaleMode: 'preview'
      };

      setExternalDropPosition(null);
      setExternalDraggingTypeId(typeId);
      drawerDragRef.current = nextDragState;
      setDrawerDrag(nextDragState);
    },
    [
      clearCancelDropCleanup,
      gridCellHeightPx,
      setExternalDraggingTypeId,
      setExternalDropPosition,
      tileByTypeId
    ]
  );

  const handleMissedDrop = useCallback(() => {
    setExternalDropPosition(null);
    setExternalDraggingTypeId(null);
    gridExternalDragRef.current.isOver = false;
    setOverlayDropMode('cancel');
    setDrawerDrag((current) => {
      if (!current) {
        return current;
      }

      const nextDragState: DrawerDragState = {
        ...current,
        outcome: 'drop-cancel',
        scaleMode: 'full'
      };

      drawerDragRef.current = nextDragState;
      return nextDragState;
    });
    queueCancelDropCleanup();
  }, [queueCancelDropCleanup, setExternalDraggingTypeId, setExternalDropPosition]);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const currentDrag = drawerDragRef.current;
      if (!currentDrag) {
        return;
      }

      const translatedRect = getTranslatedRect(event);
      if (!translatedRect) {
        return;
      }

      syncGridExternalDrag(currentDrag, getGridBridgeDetail(currentDrag, translatedRect));
    },
    [syncGridExternalDrag]
  );

  const handleDragCancel = useCallback(
    (event: DragCancelEvent) => {
      const currentDrag = drawerDragRef.current;
      const translatedRect = getTranslatedRect(event);
      endGridExternalDrag({
        drag: currentDrag,
        detail:
          currentDrag && translatedRect
            ? getGridBridgeDetail(currentDrag, translatedRect)
            : null,
        mode: 'cancel'
      });
      handleMissedDrop();
    },
    [endGridExternalDrag, handleMissedDrop]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentDrag = drawerDragRef.current;
      const translatedRect = getTranslatedRect(event);
      const detail =
        currentDrag && translatedRect
          ? getGridBridgeDetail(currentDrag, translatedRect)
          : null;
      const isOverGrid =
        currentDrag && detail ? syncGridExternalDrag(currentDrag, detail) : false;

      if (currentDrag && detail && isOverGrid && currentDrag.outcome === 'dragging') {
        setOverlayDropMode('none');
        clearCancelDropCleanup();
        endGridExternalDrag({
          drag: currentDrag,
          detail,
          mode: 'drop'
        });
        const dropped = usePortfolioGridStore.getState().externalDropPosition;
        if (dropped && dropped.typeId === currentDrag.typeId) {
          addInstanceAt(activeBreakpoint, currentDrag.typeId, dropped.position);
        }
        setExternalDropPosition(null);
        drawerDragRef.current = null;
        setDrawerDrag(null);
        return;
      }

      endGridExternalDrag({
        drag: currentDrag,
        detail,
        mode: 'cancel'
      });
      handleMissedDrop();
    },
    [
      activeBreakpoint,
      addInstanceAt,
      clearCancelDropCleanup,
      endGridExternalDrag,
      handleMissedDrop,
      setExternalDropPosition,
      syncGridExternalDrag
    ]
  );

  const overlay = typeof document !== 'undefined'
    ? createPortal(
        <DragOverlay
          adjustScale={false}
          dropAnimation={overlayDropMode === 'none' ? null : CANCEL_DROP_ANIMATION}
          style={{ pointerEvents: 'none' }}
          zIndex={80}
        >
          {drawerDrag ? <DrawerDragOverlayTile drag={drawerDrag} /> : null}
        </DragOverlay>,
        document.body
      )
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragStart={handleDragStart}
    >
      <>
        <div className="h-screen pt-16">
          <div className="fixed left-0 top-16 flex h-[calc(100vh-4rem)] w-1/2 flex-col justify-center bg-background px-6">
            <h1 className="text-[clamp(4rem,15vw,10rem)] font-bold leading-none tracking-tight">
              Hello
            </h1>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
              We are a Sydney-based design studio specialising in branding and
              wayfinding.
            </p>
          </div>

          <div
            data-home-right-scroll
            className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-1/2 min-w-0 overflow-y-auto"
          >
            <div className="w-full pb-24">
              <PortfolioGrid />
            </div>

            <div className="bg-[#F0EDE8] px-6 py-16">
              <h2 className="mb-12 text-6xl font-bold">Work</h2>
              <div className="space-y-4">
                {workItems.map((item, index) => (
                  <Link
                    key={index}
                    href="#"
                    className="block transition-opacity hover:opacity-70"
                  >
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.category}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="pointer-events-none fixed bottom-6 left-1/2 right-0 z-30 flex justify-center px-4">
            <div className="pointer-events-auto">
              <BottomToolbar onAddClick={() => setIsDrawerOpen(true)} />
            </div>
          </div>
        </div>

        {isDrawerOpen ? (
          <div
            role="dialog"
            aria-label="Workspace drawer"
            className="fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background/95 shadow-2xl backdrop-blur-sm md:w-1/2"
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">Tiles</div>
                    <div className="text-xs text-muted-foreground">
                      Drag a tile onto the grid to add a new instance.
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close drawer"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search tiles…"
                      aria-label="Search tiles"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setQuery('')}
                    disabled={query.trim().length === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-6 px-6 pb-8 pt-4">
                {filteredCollections.length === 0 ? (
                  <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                    No tiles match “{query.trim()}”.
                  </div>
                ) : (
                  filteredCollections.map((collection) => (
                    <div key={collection.collectionId} className="min-w-0 space-y-2">
                      <div className="text-sm font-semibold">{collection.label}</div>
                      <div className="-mx-1 flex flex-row flex-nowrap gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1">
                        {collection.tiles.map((tile) => (
                          <DrawerTileDraggable
                            key={tile.typeId}
                            tile={tile}
                            previewWidth={tile.dims.w * DRAWER_PREVIEW_UNIT_PX}
                            previewHeight={tile.dims.h * DRAWER_PREVIEW_UNIT_PX}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
        {overlay}
      </>
    </DndContext>
  );
}
