"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StoredDraft<T> = {
  version: 1;
  savedAt: string;
  value: T;
};

export type PendingDraft<T> = {
  savedAt: string;
  value: T;
};

type DraftSessionStatus = "active" | "prompting" | "left-route";

type DraftSessionState = {
  version: 1;
  routeKey: string;
  status: DraftSessionStatus;
  updatedAt: string;
};

type ActiveDraftContext = {
  storageKey: string;
  routeKey: string;
};

type InitialDraftDecision<T> = {
  pendingDraft: PendingDraft<T> | null;
  silentDraft: PendingDraft<T> | null;
  ready: boolean;
};

const SESSION_STORAGE_PREFIX = "estudotop:draft-session:";

const activeDraftContexts = new Map<string, ActiveDraftContext>();
const activeDraftPromptGroups = new Map<string, string>();

let navigationWatcherInstalled = false;
let lastKnownRouteKey: string | null = null;

function readStoredDraft<T>(storageKey: string, hasContent: (draft: T) => boolean) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (parsed?.version === 1 && parsed.value && hasContent(parsed.value)) {
      return { savedAt: parsed.savedAt, value: parsed.value };
    }

    window.localStorage.removeItem(storageKey);
  } catch {
    window.localStorage.removeItem(storageKey);
  }

  return null;
}

function getDraftSessionKey(storageKey: string) {
  return `${SESSION_STORAGE_PREFIX}${storageKey}`;
}

function getRouteKeyFromUrl(url: string | URL | null | undefined) {
  if (typeof window === "undefined") return "";

  try {
    const parsedUrl = url ? new URL(String(url), window.location.href) : window.location;
    if (parsedUrl.origin !== window.location.origin) return "";
    return parsedUrl.pathname;
  } catch {
    return "";
  }
}

function getCurrentRouteKey() {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

function readDraftSessionState(storageKey: string): DraftSessionState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getDraftSessionKey(storageKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DraftSessionState;
    if (parsed?.version === 1 && parsed.routeKey && parsed.status) {
      return parsed;
    }
  } catch {
    window.sessionStorage.removeItem(getDraftSessionKey(storageKey));
  }

  return null;
}

function writeDraftSessionState(storageKey: string, routeKey: string, status: DraftSessionStatus) {
  if (typeof window === "undefined" || !routeKey) return;

  try {
    const payload: DraftSessionState = {
      version: 1,
      routeKey,
      status,
      updatedAt: new Date().toISOString(),
    };

    window.sessionStorage.setItem(getDraftSessionKey(storageKey), JSON.stringify(payload));
  } catch {
    // sessionStorage can fail in private mode or when quota is exceeded.
  }
}

function markDraftLeftRoute(storageKey: string, routeKey: string) {
  writeDraftSessionState(storageKey, routeKey, "left-route");
}

function markActiveDraftsLeavingRoute(fromRouteKey: string) {
  if (!fromRouteKey) return;

  activeDraftContexts.forEach((context) => {
    if (context.routeKey === fromRouteKey) {
      markDraftLeftRoute(context.storageKey, context.routeKey);
    }
  });
}

function markNavigationAwayFromCurrentRoute(nextUrl: string | URL | null | undefined) {
  const currentRouteKey = getCurrentRouteKey();
  const nextRouteKey = getRouteKeyFromUrl(nextUrl);

  if (!currentRouteKey || !nextRouteKey || nextRouteKey === currentRouteKey) return;

  markActiveDraftsLeavingRoute(currentRouteKey);
  lastKnownRouteKey = nextRouteKey;
}

function installNavigationWatcher() {
  if (typeof window === "undefined" || navigationWatcherInstalled) return;

  navigationWatcherInstalled = true;
  lastKnownRouteKey = getCurrentRouteKey();

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function patchedPushState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    markNavigationAwayFromCurrentRoute(url);
    const result = originalPushState.apply(window.history, [data, unused, url]);
    lastKnownRouteKey = getCurrentRouteKey();
    return result;
  } as History["pushState"];

  window.history.replaceState = function patchedReplaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    markNavigationAwayFromCurrentRoute(url);
    const result = originalReplaceState.apply(window.history, [data, unused, url]);
    lastKnownRouteKey = getCurrentRouteKey();
    return result;
  } as History["replaceState"];

  window.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      markNavigationAwayFromCurrentRoute(anchor.href);
    },
    true,
  );

  window.addEventListener("popstate", () => {
    const previousRouteKey = lastKnownRouteKey;

    window.setTimeout(() => {
      const nextRouteKey = getCurrentRouteKey();
      if (previousRouteKey && nextRouteKey && previousRouteKey !== nextRouteKey) {
        markActiveDraftsLeavingRoute(previousRouteKey);
      }
      lastKnownRouteKey = nextRouteKey;
    }, 0);
  });
}

function getInitialDraftDecision<T>(
  storageKey: string,
  hasContent: (draft: T) => boolean,
): InitialDraftDecision<T> {
  const storedDraft = readStoredDraft(storageKey, hasContent);

  if (!storedDraft) {
    return { pendingDraft: null, silentDraft: null, ready: true };
  }

  const currentRouteKey = getCurrentRouteKey();
  const sessionState = readDraftSessionState(storageKey);
  const shouldRestoreSilently =
    sessionState?.version === 1 &&
    sessionState.routeKey === currentRouteKey &&
    sessionState.status === "active";

  if (shouldRestoreSilently) {
    return { pendingDraft: null, silentDraft: storedDraft, ready: true };
  }

  return { pendingDraft: storedDraft, silentDraft: null, ready: false };
}

export function useLocalDraft<T>({
  storageKey,
  draft,
  hasContent,
  onRestore,
  debounceMs = 900,
  promptGroupKey,
}: {
  storageKey: string;
  draft: T;
  hasContent: (draft: T) => boolean;
  onRestore: (draft: T) => void;
  debounceMs?: number;
  /**
   * Quando vários editores da mesma tela podem encontrar rascunho ao mesmo
   * tempo, o grupo impede pilhas de modais sobrepostos. Apenas o primeiro
   * rascunho do grupo exibe modal; os demais permanecem salvos no navegador,
   * mas não bloqueiam a tela com confirmações repetidas.
   */
  promptGroupKey?: string;
}) {
  const initialDecisionRef = useRef<InitialDraftDecision<T> | null>(null);

  if (initialDecisionRef.current === null) {
    initialDecisionRef.current = getInitialDraftDecision(storageKey, hasContent);
  }

  const [pendingDraft, setPendingDraft] = useState<PendingDraft<T> | null>(
    initialDecisionRef.current.pendingDraft,
  );
  const [silentDraft, setSilentDraft] = useState<PendingDraft<T> | null>(
    initialDecisionRef.current.silentDraft,
  );
  const [ready, setReady] = useState(initialDecisionRef.current.ready);
  const promptIdRef = useRef(`${storageKey}:${Math.random().toString(36).slice(2)}`);
  const promptGroupRef = useRef(promptGroupKey || storageKey);
  const [isPromptVisible, setIsPromptVisible] = useState(false);

  useEffect(() => {
    promptGroupRef.current = promptGroupKey || storageKey;
  }, [promptGroupKey, storageKey]);

  useEffect(() => {
    if (!pendingDraft) {
      setIsPromptVisible(false);
      return;
    }

    const groupKey = promptGroupRef.current;
    const promptId = promptIdRef.current;
    const currentOwner = activeDraftPromptGroups.get(groupKey);

    if (!currentOwner || currentOwner === promptId) {
      activeDraftPromptGroups.set(groupKey, promptId);
      setIsPromptVisible(true);
      return;
    }

    onRestore(pendingDraft.value);
    setPendingDraft(null);
    setReady(true);
    setIsPromptVisible(false);
    writeDraftSessionState(storageKey, getCurrentRouteKey(), "active");
  }, [onRestore, pendingDraft, storageKey]);

  const releasePromptGroup = useCallback(() => {
    const groupKey = promptGroupRef.current;
    if (activeDraftPromptGroups.get(groupKey) === promptIdRef.current) {
      activeDraftPromptGroups.delete(groupKey);
    }
    setIsPromptVisible(false);
  }, []);

  useEffect(() => () => {
    const groupKey = promptGroupRef.current;
    if (activeDraftPromptGroups.get(groupKey) === promptIdRef.current) {
      activeDraftPromptGroups.delete(groupKey);
    }
  }, []);

  useEffect(() => {
    if (!silentDraft) return;

    onRestore(silentDraft.value);
    setSilentDraft(null);
  }, [onRestore, silentDraft]);

  useEffect(() => {
    const routeKey = getCurrentRouteKey();
    if (!routeKey) return;

    installNavigationWatcher();

    const contextId = `${storageKey}:${Math.random().toString(36).slice(2)}`;
    activeDraftContexts.set(contextId, { storageKey, routeKey });
    writeDraftSessionState(storageKey, routeKey, pendingDraft ? "prompting" : "active");

    return () => {
      activeDraftContexts.delete(contextId);

      const currentRouteKey = getCurrentRouteKey();
      if (currentRouteKey && currentRouteKey !== routeKey) {
        markDraftLeftRoute(storageKey, routeKey);
      }
    };
  }, [pendingDraft, storageKey]);

  useEffect(() => {
    if (!ready) return;

    const timer = window.setTimeout(() => {
      try {
        if (!hasContent(draft)) return;

        const payload: StoredDraft<T> = {
          version: 1,
          savedAt: new Date().toISOString(),
          value: draft,
        };

        window.localStorage.setItem(storageKey, JSON.stringify(payload));
        writeDraftSessionState(storageKey, getCurrentRouteKey(), "active");
      } catch {
        // localStorage can fail in private mode or when quota is exceeded.
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, draft, hasContent, ready, storageKey]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    onRestore(pendingDraft.value);
    setPendingDraft(null);
    setReady(true);
    releasePromptGroup();
    writeDraftSessionState(storageKey, getCurrentRouteKey(), "active");
  }, [onRestore, pendingDraft, releasePromptGroup, storageKey]);

  const discardDraft = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setPendingDraft(null);
    setReady(true);
    releasePromptGroup();
    writeDraftSessionState(storageKey, getCurrentRouteKey(), "active");
  }, [releasePromptGroup, storageKey]);

  const clearDraft = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    writeDraftSessionState(storageKey, getCurrentRouteKey(), "active");
  }, [storageKey]);

  return useMemo(
    () => ({
      pendingDraft: isPromptVisible ? pendingDraft : null,
      restoreDraft,
      discardDraft,
      clearDraft,
      draftReady: ready,
    }),
    [clearDraft, discardDraft, isPromptVisible, pendingDraft, ready, restoreDraft],
  );
}
