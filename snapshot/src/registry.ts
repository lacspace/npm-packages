import type { SerializerPlugin } from "./types";

// Global plugin registry. Most-recently-added plugins are tried first.
const globalSerializers: SerializerPlugin[] = [];

/**
 * Register a global serializer plugin, applied by every {@link serialize} call.
 * The most recently added plugin is tried first. Returns a function that
 * removes the plugin again.
 */
export function addSerializer(plugin: SerializerPlugin): () => void {
  if (!plugin || typeof plugin.test !== "function" || typeof plugin.serialize !== "function") {
    throw new TypeError("addSerializer expects a plugin with test() and serialize() functions");
  }
  globalSerializers.unshift(plugin);
  return () => {
    const i = globalSerializers.indexOf(plugin);
    if (i !== -1) globalSerializers.splice(i, 1);
  };
}

/** Return a copy of the currently registered global plugins (first = highest priority). */
export function getSerializers(): SerializerPlugin[] {
  return globalSerializers.slice();
}

/** Remove all globally registered serializer plugins. Mainly useful in tests. */
export function resetSerializers(): void {
  globalSerializers.length = 0;
}

/** Internal accessor used by the serializer core. */
export function _globalSerializers(): SerializerPlugin[] {
  return globalSerializers;
}
