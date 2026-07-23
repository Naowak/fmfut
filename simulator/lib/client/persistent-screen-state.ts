"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

const memory = new Map<string, unknown>();

function read<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored === null) return undefined;
    const value = JSON.parse(stored) as T;
    memory.set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

function write<T>(key: string, value: T): void {
  memory.set(key, value);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory copy still preserves large replays while navigating.
  }
}

export function usePersistentScreenState<T>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const stored = read<T>(key);
    if (stored !== undefined) setValue(stored);
  }, [key]);

  const setPersistentValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setValue((previous) => {
      const next = typeof action === "function"
        ? (action as (current: T) => T)(previous)
        : action;
      write(key, next);
      return next;
    });
  }, [key]);

  return [value, setPersistentValue];
}
