/**
 * @lacspace/next
 * Next.js App Router integration for the Lacspace SDK.
 *
 * The server-side companion to @lacspace/react — an authenticated SDK client
 * that reads the session cookie, Route Handler & Server Action wrappers, cookie
 * helpers and a middleware auth guard.
 *
 * Requires Next.js 14+ (App Router). Server-side.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { LacspaceSDK, type LacspaceSDKOptions } from "@lacspace/sdk";

const DEFAULT_COOKIE = "lacspace_token";

export interface ServerClientOptions extends LacspaceSDKOptions {
  /** Cookie the auth token is stored in. Default "lacspace_token". */
  tokenCookie?: string;
}

/**
 * Create a Lacspace SDK client for a Server Component, Route Handler or Server
 * Action, with the auth token applied from the request's cookie.
 */
export async function createServerClient(opts: ServerClientOptions = {}): Promise<LacspaceSDK> {
  const { tokenCookie = DEFAULT_COOKIE, ...sdkOptions } = opts;
  const sdk = new LacspaceSDK(sdkOptions);
  try {
    const store = await cookies();
    const token = store.get(tokenCookie)?.value;
    if (token) sdk.api.setToken(token);
  } catch {
    /* called outside a request scope — return an unauthenticated client */
  }
  return sdk;
}

/** Alias of {@link createServerClient} — reads nicely inside Server Actions. */
export const serverActionClient = createServerClient;

/** Read the raw auth token from the request cookie, if present. */
export async function getAuthToken(tokenCookie = DEFAULT_COOKIE): Promise<string | undefined> {
  try {
    return (await cookies()).get(tokenCookie)?.value;
  } catch {
    return undefined;
  }
}

export interface AuthCookieOptions {
  tokenCookie?: string;
  /** Cookie lifetime in seconds. Default 30 days. */
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
}

/** Set the httpOnly auth cookie (call from a Route Handler or Server Action). */
export async function setAuthCookie(token: string, opts: AuthCookieOptions = {}): Promise<void> {
  const store = await cookies();
  store.set(opts.tokenCookie ?? DEFAULT_COOKIE, token, {
    httpOnly: true,
    secure: opts.secure ?? true,
    sameSite: opts.sameSite ?? "lax",
    path: opts.path ?? "/",
    maxAge: opts.maxAge ?? 60 * 60 * 24 * 30,
  });
}

/** Clear the auth cookie (sign-out). */
export async function clearAuthCookie(tokenCookie = DEFAULT_COOKIE): Promise<void> {
  (await cookies()).delete(tokenCookie);
}

export interface RouteContext {
  params?: Record<string, string | string[]>;
}

type Handler<T> = (req: NextRequest, ctx: RouteContext) => Promise<T> | T;

/**
 * Wrap a Route Handler: JSON-serialize the return value and turn thrown errors
 * into JSON error responses (honouring an error's `status`/`statusCode`).
 */
export function routeHandler<T>(fn: Handler<T>) {
  return async (req: NextRequest, ctx: RouteContext = {}): Promise<Response> => {
    try {
      const data = await fn(req, ctx);
      if (data instanceof Response) return data;
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      const err = e as { status?: number; statusCode?: number; message?: string };
      return NextResponse.json(
        { error: err.message ?? "Internal Server Error" },
        { status: err.status ?? err.statusCode ?? 500 },
      );
    }
  };
}

/** Like {@link routeHandler}, but 401s unless a valid auth cookie is present; passes the token through. */
export function withAuth<T>(
  fn: (req: NextRequest, ctx: RouteContext, token: string) => Promise<T> | T,
  opts: { tokenCookie?: string } = {},
) {
  const tokenCookie = opts.tokenCookie ?? DEFAULT_COOKIE;
  return routeHandler<T | Response>(async (req, ctx) => {
    const token = (await cookies()).get(tokenCookie)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return fn(req, ctx, token);
  });
}

export interface GuardOptions {
  tokenCookie?: string;
  /** Where to send unauthenticated users. Default "/login". */
  loginPath?: string;
  /** Paths that never require auth (string prefix match or RegExp). */
  publicPaths?: (string | RegExp)[];
}

/**
 * Use inside `middleware.ts`. Returns a redirect `NextResponse` for
 * unauthenticated requests to protected paths, or `undefined` to allow through.
 * @example
 * export function middleware(req: NextRequest) {
 *   return authGuard(req, { publicPaths: ["/login", "/api/public"] }) ?? NextResponse.next();
 * }
 */
export function authGuard(req: NextRequest, opts: GuardOptions = {}): NextResponse | undefined {
  const { tokenCookie = DEFAULT_COOKIE, loginPath = "/login", publicPaths = [] } = opts;
  const path = req.nextUrl.pathname;
  const isPublic = publicPaths.some((p) =>
    typeof p === "string" ? path === p || path.startsWith(p) : p.test(path),
  );
  if (isPublic || path === loginPath) return undefined;

  if (!req.cookies.get(tokenCookie)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return undefined;
}
