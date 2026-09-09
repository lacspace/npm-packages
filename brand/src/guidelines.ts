/**
 * Brand usage guidelines, as data — so a tool, docs page or linter can read them.
 * Mirrors lacspace.com/brand. These are usage rules, not the licence; see LICENSE.
 */

export interface Guideline {
  title: string;
  detail: string;
}

export const CLEARSPACE = "At least half the mark's height on every side.";

export const MIN_SIZE = { favicon: 48, ui: 96, print: 200 } as const;

export const WORDMARK_RULE =
  'One word, capital L — "Lacspace". Never "LacSpace", "Lac Space", or all-caps in body text. Product names keep their own casing.';

export const DO: Guideline[] = [
  { title: "Mark first", detail: "On coloured or busy grounds use the mono marks (white on dark, black/ink on light)." },
  { title: "Full colour on ink or off-white", detail: "The gradient mark needs an ink or off-white ground to breathe." },
  { title: "Keep clear space", detail: CLEARSPACE },
  { title: "Respect minimum sizes", detail: `${MIN_SIZE.favicon}px favicon · ${MIN_SIZE.ui}px UI · ${MIN_SIZE.print}px print.` },
  { title: "Link back", detail: "Use the mark to reference, link to or show integration with Lacspace." },
];

export const DONT: Guideline[] = [
  { title: "Don't recolour the gradient", detail: "Use the provided colour variants instead." },
  { title: "Don't add effects", detail: "No shadows, glows, bevels or outlines beyond what ships here." },
  { title: "Don't distort", detail: "Never stretch, squash, rotate or skew the mark." },
  { title: "Don't box it", detail: "Give it clear space rather than cramming it into a frame." },
  { title: "Don't imply endorsement", detail: "Using the mark implies no endorsement, sponsorship or partnership by Lacspace." },
];

export const GUIDELINES = { CLEARSPACE, MIN_SIZE, WORDMARK_RULE, DO, DONT };
