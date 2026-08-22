/**
 * @lacspace/react — React hooks and a provider for the Lacspace SDK.
 * Wrap your app in <LacspaceProvider>, then use `useAuth`, `useQuery`, and
 * `useLacspace` anywhere.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  LacspaceSDK,
  LacspaceApiError,
  type LacspaceSDKOptions,
  type LacspaceUser,
  type LoginCredentials,
  type RegisterData,
} from "@lacspace/sdk";

const LacspaceContext = createContext<LacspaceSDK | null>(null);

export interface LacspaceProviderProps {
  /** Bring your own SDK instance… */
  client?: LacspaceSDK;
  /** …or let the provider create one from options. */
  options?: LacspaceSDKOptions;
  children: ReactNode;
}

/** Provides a single shared `LacspaceSDK` instance to the React tree. */
export function LacspaceProvider({ client, options, children }: LacspaceProviderProps) {
  const [sdk] = useState(() => client ?? new LacspaceSDK(options ?? {}));
  return createElement(LacspaceContext.Provider, { value: sdk }, children);
}

/** Access the shared SDK instance. Throws if used outside `<LacspaceProvider>`. */
export function useLacspace(): LacspaceSDK {
  const sdk = useContext(LacspaceContext);
  if (!sdk) throw new Error("useLacspace must be used within a <LacspaceProvider>.");
  return sdk;
}

export interface UseAuthResult {
  user: LacspaceUser | null;
  loading: boolean;
  error: Error | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

/** Authentication state and actions backed by the shared SDK. */
export function useAuth(): UseAuthResult {
  const sdk = useLacspace();
  const [user, setUser] = useState<LacspaceUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const res = await run(() => sdk.auth.login(credentials));
      setUser(res.user);
    },
    [sdk, run],
  );

  const register = useCallback(
    async (data: RegisterData) => {
      const res = await run(() => sdk.auth.register(data));
      setUser(res.user);
    },
    [sdk, run],
  );

  const logout = useCallback(async () => {
    await run(() => sdk.auth.logout());
    setUser(null);
  }, [sdk, run]);

  return { user, loading, error, login, register, logout };
}

export interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch any data from the SDK with loading/error state and refetch.
 *
 * ```ts
 * const { data, loading } = useQuery((sdk) => sdk.ecommerce.getProducts());
 * ```
 */
export function useQuery<T>(
  fetcher: (sdk: LacspaceSDK) => Promise<T>,
  deps: unknown[] = [],
): UseQueryResult<T> {
  const sdk = useLacspace();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher(sdk)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e as Error))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refetch };
}

export { LacspaceApiError };
export type { LacspaceSDK, LacspaceUser, LacspaceSDKOptions };
