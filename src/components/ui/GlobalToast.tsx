import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Toast } from './Toast';

export type GlobalToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastPayload {
  id: number;
  message: string;
  type: GlobalToastType;
  duration: number;
}

type ToastListener = (payload: ToastPayload) => void;

let listener: ToastListener | null = null;
// Calls made before <GlobalToast /> mounts (e.g. during a screen transition)
// are buffered here and flushed as soon as the host renders.
let buffer: ToastPayload[] = [];
let nextId = 0;

/**
 * Fire a theme-aware toast from anywhere (no React context needed).
 * Replaces native Alert.alert for one-way confirmations/errors so messages
 * follow the app's light/dark theme and language direction.
 */
export function showToast(
  message: string,
  type: GlobalToastType = 'info',
  duration = 4000,
): void {
  const payload: ToastPayload = { id: ++nextId, message, type, duration };
  if (listener) {
    listener(payload);
  } else {
    buffer.push(payload);
  }
}

/** Mount once in the root layout (inside ThemeProvider) */
export function GlobalToast() {
  const [current, setCurrent] = useState<ToastPayload | null>(null);
  const currentRef = useRef<ToastPayload | null>(null);
  const pendingRef = useRef<ToastPayload[]>([]);

  useEffect(() => {
    const handle: ToastListener = (payload) => {
      if (currentRef.current) {
        pendingRef.current.push(payload);
      } else {
        currentRef.current = payload;
        setCurrent(payload);
      }
    };
    listener = handle;
    const queued = buffer;
    buffer = [];
    queued.forEach(handle);
    return () => {
      listener = null;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    const next = pendingRef.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  if (!current) return null;
  return (
    <Toast
      key={current.id}
      message={current.message}
      type={current.type}
      visible
      onDismiss={handleDismiss}
      duration={current.duration}
    />
  );
}
