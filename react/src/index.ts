"use client";

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
  useReducer,
  useRef,
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
import {
  asyncReducer,
  deriveAuthStatus,
  initialAsyncState,
  selectAsyncFlags,
  type AsyncState,
  type AuthStatus,
} from "./core";

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
  const [user, setUser] = useState<LacspaceUser | null>(() => sdk.auth.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Reflect shared SDK auth state: sync to the current user on mount and stay
  // subscribed so login/logout/refresh done elsewhere are seen here too.
  useEffect(() => {
    setUser(sdk.auth.user);
    return sdk.auth.subscribe(setUser);
  }, [sdk]);

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

/**
 * The current auth status as a single value: `"loading" | "authenticated" |
 * "unauthenticated"`. A convenience over {@link useAuth} for gating routes.
 *
 * ```ts
 * const status = useAuthStatus();
 * if (status === "loading") return <Spinner />;
 * if (status === "unauthenticated") return <Redirect to="/login" />;
 * ```
 */
export function useAuthStatus(): AuthStatus {
  const { user, loading } = useAuth();
  return deriveAuthStatus({ user, loading });
}

export interface UseMutationResult<T, V> {
  data: T | undefined;
  error: Error | null;
  status: AsyncState<T>["status"];
  isIdle: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  /** Run the mutation. Resolves with the result and never rejects (read `error`). */
  mutate: (variables: V) => Promise<T | undefined>;
  /** Run the mutation and re-throw on failure, for `try/catch` call sites. */
  mutateAsync: (variables: V) => Promise<T>;
  /** Return to the idle state, clearing `data` and `error`. */
  reset: () => void;
}

/**
 * Run a one-off write against the SDK (login side-effects, checkout, tracking, …)
 * with managed `status`/`error`/`data`. A thin wrapper over the pure
 * {@link asyncReducer} state machine.
 *
 * ```ts
 * const checkout = useMutation((sdk, cartId: string) => sdk.ecommerce.checkout(cartId));
 * <button disabled={checkout.isLoading} onClick={() => checkout.mutate(cartId)}>Buy</button>
 * ```
 */
export function useMutation<T, V = void>(
  mutator: (sdk: LacspaceSDK, variables: V) => Promise<T>,
): UseMutationResult<T, V> {
  const sdk = useLacspace();
  const [state, dispatch] = useReducer(asyncReducer<T>, undefined, () => initialAsyncState<T>());

  // Keep the latest mutator without re-creating the callbacks on every render.
  const mutatorRef = useRef(mutator);
  useEffect(() => {
    mutatorRef.current = mutator;
  });

  const mutateAsync = useCallback(
    async (variables: V): Promise<T> => {
      dispatch({ type: "start" });
      try {
        const data = await mutatorRef.current(sdk, variables);
        dispatch({ type: "success", data });
        return data;
      } catch (error) {
        dispatch({ type: "error", error });
        throw error;
      }
    },
    [sdk],
  );

  const mutate = useCallback(
    (variables: V): Promise<T | undefined> => mutateAsync(variables).catch(() => undefined),
    [mutateAsync],
  );

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    ...selectAsyncFlags(state),
    mutate,
    mutateAsync,
    reset,
  };
}

export { LacspaceApiError };
export type { LacspaceSDK, LacspaceUser, LacspaceSDKOptions };

// Pure, framework-agnostic core (safe to import and test under plain Node).
export {
  asyncReducer,
  initialAsyncState,
  selectAsyncFlags,
  toError,
  isAuthenticated,
  deriveAuthStatus,
  computeBackoff,
  runWithRetry,
  resolveRefetchInterval,
  serializeDeps,
} from "./core";
export type {
  AsyncStatus,
  AsyncState,
  AsyncAction,
  AsyncFlags,
  AuthStatus,
  BackoffOptions,
  RetryOptions,
  RefetchInterval,
  ResolveIntervalOptions,
} from "./core";
