'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const EmployeeWorkspaceContext = createContext(null);

function emptyEntry() {
  return { data: null, busy: false, error: '', attempted: false };
}

export function EmployeeWorkspaceProvider({ children }) {
  const [entries, setEntries] = useState({});
  const entriesRef = useRef({});
  const requestsRef = useRef(new Map());

  const updateEntry = useCallback((workspace, update) => {
    setEntries(current => {
      const nextEntry = update(current[workspace] || emptyEntry());
      const next = { ...current, [workspace]: nextEntry };
      entriesRef.current = next;
      return next;
    });
  }, []);

  const loadWorkspace = useCallback((workspace, { force = false } = {}) => {
    const pending = requestsRef.current.get(workspace);
    if (pending) return pending.promise;

    const cached = entriesRef.current[workspace];
    if (!force && cached?.attempted) return Promise.resolve(cached.data);

    const controller = new AbortController();
    updateEntry(workspace, current => ({ ...current, busy: true, error: '', attempted: true }));

    const promise = (async () => {
      try {
        const response = await fetch(`/api/employee/dashboard?workspace=${encodeURIComponent(workspace)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Your work could not be loaded. Please try again.');
        updateEntry(workspace, current => ({ ...current, data: result, busy: false, error: '', attempted: true }));
        return result;
      } catch (failure) {
        if (controller.signal.aborted) return null;
        const message = failure.message === 'Failed to fetch'
          ? 'Connection interrupted. Please try again.'
          : failure.message;
        updateEntry(workspace, current => ({ ...current, data: null, busy: false, error: message, attempted: true }));
        throw failure;
      } finally {
        if (requestsRef.current.get(workspace)?.controller === controller) {
          requestsRef.current.delete(workspace);
        }
      }
    })();

    requestsRef.current.set(workspace, { controller, promise });
    return promise;
  }, [updateEntry]);

  const value = useMemo(() => ({ entries, loadWorkspace }), [entries, loadWorkspace]);
  return <EmployeeWorkspaceContext.Provider value={value}>{children}</EmployeeWorkspaceContext.Provider>;
}

export function useEmployeeWorkspace(workspace, { enabled = true } = {}) {
  const context = useContext(EmployeeWorkspaceContext);
  if (!context) throw new Error('useEmployeeWorkspace must be used inside EmployeeWorkspaceProvider.');

  const entry = context.entries[workspace] || emptyEntry();
  useEffect(() => {
    if (enabled && !entry.attempted && !entry.busy) {
      context.loadWorkspace(workspace).catch(() => null);
    }
  }, [context, enabled, entry.attempted, entry.busy, workspace]);

  return {
    ...entry,
    busy: enabled && !entry.attempted ? true : entry.busy,
    refresh: () => context.loadWorkspace(workspace, { force: true }),
  };
}

export function useEmployeeWorkspaceStore() {
  const context = useContext(EmployeeWorkspaceContext);
  if (!context) throw new Error('useEmployeeWorkspaceStore must be used inside EmployeeWorkspaceProvider.');
  return context;
}
