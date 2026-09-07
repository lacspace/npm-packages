/**
 * Endpoint registry — subscribe endpoints to event types and compute which
 * endpoints should receive a given event. All routing is pure and synchronous;
 * the registry is a thin, optional convenience over it.
 */
import type { Secret } from "./index";

/** A webhook subscription: where to deliver, which events, and the signing secret. */
export interface Endpoint {
  id: string;
  url: string;
  /** Per-endpoint signing secret (used when you deliver to this endpoint). */
  secret?: Secret;
  /**
   * Event-type patterns this endpoint is subscribed to. Supports exact names
   * (`"invoice.paid"`), the wildcard `"*"` (all events) and a trailing prefix
   * wildcard (`"invoice.*"` → any `invoice.` event). Empty/omitted = all events.
   */
  events?: string[];
  /** When `true`, the endpoint receives nothing. */
  disabled?: boolean;
}

/**
 * Does a single subscription `pattern` match an event `type`?
 * Rules: `"*"` matches everything; `"foo.*"` matches any `foo.` event; otherwise
 * an exact match is required.
 */
export function matchesEventType(pattern: string, type: string): boolean {
  if (pattern === "*") return true;
  if (pattern === type) return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1)); // "foo.*" → startsWith "foo."
  return false;
}

/** Should this endpoint receive an event of `type`? Pure; respects `disabled`. */
export function endpointSubscribes(endpoint: Endpoint, type: string): boolean {
  if (endpoint.disabled) return false;
  const patterns = endpoint.events;
  if (!patterns || patterns.length === 0) return true; // no filter = subscribed to all
  return patterns.some((p) => matchesEventType(p, type));
}

/**
 * From a list of endpoints, return those subscribed to an event `type`.
 * Pure — does not mutate the input and preserves its order.
 *
 * @example
 * const targets = routeEvent(endpoints, "invoice.paid");
 * await Promise.all(targets.map((e) => deliver(e.url, event, { secret: e.secret })));
 */
export function routeEvent<E extends Endpoint>(endpoints: readonly E[], type: string): E[] {
  return endpoints.filter((endpoint) => endpointSubscribes(endpoint, type));
}

/**
 * A tiny in-memory registry of endpoints keyed by id. Optional sugar over the
 * pure {@link routeEvent} — bring your own persistence in production.
 */
export class EndpointRegistry {
  private readonly endpoints = new Map<string, Endpoint>();

  /** Add (or replace, by id) an endpoint. Returns the stored endpoint. */
  add(endpoint: Endpoint): Endpoint {
    this.endpoints.set(endpoint.id, endpoint);
    return endpoint;
  }

  /** Subscribe an endpoint to a set of event-type patterns. Returns the endpoint. */
  subscribe(id: string, url: string, events: string[], secret?: Secret): Endpoint {
    return this.add({ id, url, events, secret });
  }

  /** Remove an endpoint by id. Returns `true` if one was removed. */
  remove(id: string): boolean {
    return this.endpoints.delete(id);
  }

  get(id: string): Endpoint | undefined {
    return this.endpoints.get(id);
  }

  list(): Endpoint[] {
    return [...this.endpoints.values()];
  }

  /** Endpoints subscribed to an event `type`. */
  route(type: string): Endpoint[] {
    return routeEvent(this.list(), type);
  }

  /** Endpoints that should receive a given event envelope (routes on `event.type`). */
  endpointsFor(event: { type: string }): Endpoint[] {
    return this.route(event.type);
  }
}
