"use client";
/**
 * @lacspace/sse/react — subscribe to a live stream from a component.
 *
 * `useSSE(url)` connects on mount, cleans up on unmount, and gives you the latest
 * message plus the connection status. React is a peer dependency.
 */
import { useEffect, useRef, useState } from "react";
import { connectSSE, type ConnectOptions } from "./client";

export type SSEStatus = "connecting" | "open" | "error" | "closed";

export interface UseSSEResult<T> {
  /** The most recent default-message payload (parsed). */
  data: T | null;
  status: SSEStatus;
}

/**
 * Subscribe to an SSE endpoint. Pass `null` as the url to stay disconnected
 * (e.g. until the user is authenticated).
 *
 * @example
 * const { data, status } = useSSE<Notice>("/events", {
 *   onEvent: { notice: (n) => setNotices((prev) => [n, ...prev]) },
 * });
 */
export function useSSE<T = unknown>(url: string | null, options?: ConnectOptions): UseSSEResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<SSEStatus>("connecting");
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!url) {
      setStatus("closed");
      return;
    }
    setStatus("connecting");
    const conn = connectSSE(url, {
      ...optionsRef.current,
      onOpen: () => {
        setStatus("open");
        optionsRef.current?.onOpen?.();
      },
      onError: (event) => {
        setStatus("error");
        optionsRef.current?.onError?.(event);
      },
      onMessage: (payload, event) => {
        setData(payload as T);
        optionsRef.current?.onMessage?.(payload, event);
      },
    });
    return () => {
      conn.close();
      setStatus("closed");
    };
  }, [url]);

  return { data, status };
}
