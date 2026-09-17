"use client";

import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { OrderedBodyHeading } from "./OrderedBody";

export type OrderedDocSection = {
  label: string;
  tone: string;
  children?: Array<OrderedDocSection>;
};

type OrderedDocEntry = {
  id: string;
  parentId: string | null;
  label: string;
  tone: string;
  order: number;
};

export type OrderedDocStore = {
  register: (id: string, parentId: string | null, label: string, tone: string) => void;
  unregister: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Array<OrderedDocSection>;
};

const OrderedDocStoreContext = createContext<OrderedDocStore | null>(null);
const OrderedSectionParentContext = createContext<string | null>(null);

const emptySections: Array<OrderedDocSection> = [];

function subscribeNoop() {
  return () => {};
}

function getEmptySections() {
  return emptySections;
}

function buildSectionTree(entries: Map<string, OrderedDocEntry>): Array<OrderedDocSection> {
  const byParent = new Map<string | null, Array<OrderedDocEntry>>();
  for (const entry of entries.values()) {
    const siblings = byParent.get(entry.parentId);
    if (siblings === undefined) {
      byParent.set(entry.parentId, [entry]);
    } else {
      siblings.push(entry);
    }
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.order - right.order);
  }

  function walk(parentId: string | null): Array<OrderedDocSection> {
    const siblings = byParent.get(parentId);
    if (siblings === undefined) {
      return [];
    }
    return siblings.map((entry) => {
      const children = walk(entry.id);
      if (children.length === 0) {
        return { label: entry.label, tone: entry.tone };
      }
      return { label: entry.label, tone: entry.tone, children };
    });
  }

  return walk(null);
}

function createOrderedDocStore(): OrderedDocStore {
  const entries = new Map<string, OrderedDocEntry>();
  const listeners = new Set<() => void>();
  let orderCounter = 0;
  let snapshot: Array<OrderedDocSection> = emptySections;
  let notifyScheduled = false;

  function rebuildSnapshot() {
    snapshot = buildSectionTree(entries);
    if (snapshot.length === 0) {
      snapshot = emptySections;
    }
  }

  function scheduleNotify() {
    if (notifyScheduled) {
      return;
    }
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      for (const listener of listeners) {
        listener();
      }
    });
  }

  return {
    register(id, parentId, label, tone) {
      const existing = entries.get(id);
      if (
        existing !== undefined &&
        existing.parentId === parentId &&
        existing.label === label &&
        existing.tone === tone
      ) {
        return;
      }
      entries.set(id, {
        id,
        parentId,
        label,
        tone,
        order: existing?.order ?? orderCounter++,
      });
      rebuildSnapshot();
      scheduleNotify();
    },
    unregister(id) {
      if (!entries.delete(id)) {
        return;
      }
      rebuildSnapshot();
      scheduleNotify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
  };
}

export function OrderedDoc(props: { children: ReactNode }) {
  const storeRef = useRef<OrderedDocStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createOrderedDocStore();
  }

  return (
    <OrderedDocStoreContext value={storeRef.current}>{props.children}</OrderedDocStoreContext>
  );
}

export function useOrderedDocSections(): Array<OrderedDocSection> {
  const store = useContext(OrderedDocStoreContext);
  return useSyncExternalStore(
    store === null ? subscribeNoop : store.subscribe,
    store === null ? getEmptySections : store.getSnapshot,
    store === null ? getEmptySections : store.getSnapshot,
  );
}

export function OrderedSection(props: {
  label: string;
  tone?: string;
  className?: string;
  headingClassName?: string;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  const store = useContext(OrderedDocStoreContext);
  const parentId = useContext(OrderedSectionParentContext);
  const id = useId();
  const tone = props.tone ?? "active";

  useLayoutEffect(() => {
    if (store === null) {
      return;
    }
    store.register(id, parentId, props.label, tone);
    return () => {
      store.unregister(id);
    };
  }, [store, id, parentId, props.label, tone]);

  return (
    <OrderedSectionParentContext value={id}>
      <li className={props.className} data-testid={props["data-testid"]}>
        <OrderedBodyHeading className={props.headingClassName}>{props.label}</OrderedBodyHeading>
        {props.children}
      </li>
    </OrderedSectionParentContext>
  );
}
