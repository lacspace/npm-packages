/**
 * The canonical Lacspace mark, as lean vector geometry.
 *
 * These coordinates are the single source of truth for the *programmatic* mark —
 * the outer head-profile silhouette plus the 12-node neural network that defines
 * the Lacspace identity. They are pixel-calibrated to the master artwork
 * (the full traced mark ships in `@lacspace/brand/assets/svg/mark.svg`), so the
 * self-contained SVG this package renders is faithful, tiny and dependency-free.
 *
 * viewBox is a 281.25 square.
 */

export const VIEWBOX = 281.25;

/** Outer head-profile silhouette, lifted verbatim from the master mark. */
export const MARK_PATH =
  "M 225.3125 104.605469 L 219.570312 75.960938 C 221.101562 75.199219 222.160156 73.644531 222.210938 71.832031 C 222.285156 69.203125 220.078125 66.925781 217.449219 66.925781 C 216.5 66.925781 215.617188 67.207031 214.875 67.683594 L 195.324219 49.761719 C 195.660156 49.042969 195.824219 48.230469 195.765625 47.371094 C 195.589844 45.03125 193.6875 43.132812 191.347656 42.972656 C 189.859375 42.871094 188.507812 43.453125 187.570312 44.433594 L 163.929688 32.128906 L 118.292969 44.390625 L 88.105469 55.425781 L 111.09375 161.695312 L 111.144531 161.9375 L 144.082031 206.863281 L 109.46875 251.328125 L 158.9375 235.476562 C 159.8125 236.597656 161.167969 237.3125 162.699219 237.3125 C 164.554688 237.3125 166.164062 236.253906 166.953125 234.699219 L 197.929688 239.363281 C 198.15625 241.933594 200.417969 243.914062 203.09375 243.6875 C 205.417969 243.488281 207.277344 241.578125 207.429688 239.25 C 207.609375 236.476562 205.414062 234.167969 202.675781 234.167969 C 202.660156 234.167969 202.640625 234.167969 202.625 234.167969 L 187.707031 187.429688 C 189.035156 186.582031 189.914062 185.09375 189.914062 183.394531 C 189.914062 181.503906 188.828125 179.871094 187.253906 179.101562 L 190.140625 164.816406 C 192.640625 164.699219 194.628906 162.613281 194.628906 160.050781 C 194.628906 159.269531 194.441406 158.53125 194.109375 157.878906 L 211.394531 142.507812 C 212.089844 142.917969 212.902344 143.160156 213.769531 143.160156 C 216.371094 143.160156 218.480469 141.023438 218.480469 138.390625 C 218.480469 136.976562 217.875 135.710938 216.910156 134.835938 L 224.570312 114.101562 C 224.738281 114.117188 224.910156 114.128906 225.082031 114.128906 C 227.714844 114.128906 229.847656 111.992188 229.847656 109.359375 C 229.847656 106.726562 227.835938 104.722656 225.3125 104.597656 Z";

/** The 12 neural nodes — detected as cyan-blob centres in the master artwork. */
export const NODES: readonly [number, number][] = [
  [190.9, 47.7], // 0 crown
  [217.3, 71.6], // 1 top-right
  [172.8, 81.1], // 2 upper hub
  [225.0, 109.3], // 3 far-right
  [189.8, 110.6], // 4 mid hub
  [213.7, 138.3], // 5 right-mid
  [168.0, 138.3], // 6 temple hub
  [189.8, 160.0], // 7 centre
  [147.6, 161.9], // 8 cheek edge
  [185.1, 183.3], // 9 lower centre
  [162.6, 232.5], // 10 jaw
  [202.6, 238.8], // 11 neck
];

/** 15 connectors — every node wired, no orphan. */
export const EDGES: readonly [number, number][] = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6],
  [5, 7], [6, 7], [6, 8], [7, 9], [8, 9], [9, 11], [10, 11],
];

/** The ignition / breathe origin (centre node), as a viewBox fraction. */
export const CENTER: readonly [number, number] = [NODES[7]![0] / VIEWBOX, NODES[7]![1] / VIEWBOX];

/**
 * "Birth order" (breadth-first from the crown) so the network can grow head→neck,
 * and edges oriented parent→child for the signal pulse. Shared by the animator.
 */
export function craftOrder() {
  const adj: number[][] = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  const birth: number[] = NODES.map(() => -1);
  const order: number[] = [];
  const q = [0];
  birth[0] = 0;
  order.push(0);
  while (q.length) {
    const n = q.shift()!;
    for (const m of adj[n]!.slice().sort((x, y) => x - y)) {
      if (birth[m] === -1) {
        birth[m] = order.length;
        order.push(m);
        q.push(m);
      }
    }
  }
  const edges = EDGES.map(([a, b]) => (birth[a]! <= birth[b]! ? [a, b] : [b, a]) as [number, number]);
  edges.sort(
    (e, f) =>
      Math.max(birth[e[0]]!, birth[e[1]]!) - Math.max(birth[f[0]]!, birth[f[1]]!) ||
      Math.min(birth[e[0]]!, birth[e[1]]!) - Math.min(birth[f[0]]!, birth[f[1]]!),
  );
  return { birth, edges };
}
