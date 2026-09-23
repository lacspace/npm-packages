/**
 * Overlays: everything that floats above the page.
 *
 * Modal, ConfirmDialog, Drawer, Popover, Tooltip, Toast and the Backdrop they
 * share. The hard parts — focus trapping, scroll locking, returning focus to
 * the trigger, escaping, and keeping a floating panel inside the viewport —
 * live in small pure helpers at the top of this file so they can be tested and
 * reused rather than re-discovered in every component.
 *
 * Nothing here touches the DOM at module scope or during render: the portal is
 * only created inside an effect, so the whole family is safe to import from a
 * server component.
 */
import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  HTMLAttributes,
  MutableRefObject,
  ReactElement,
  ReactNode,
  Ref,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { classes, clamp, useControllable, useStableId, type Tone } from "./util.js";
import { Button } from "./button.js";

/* ==========================================================================
   Pure helpers — no DOM, no React. These are what the tests exercise.
   ========================================================================== */

/** Which side of its anchor a floating panel prefers to sit on. */
export type Placement = "top" | "bottom" | "left" | "right";

/** A rectangle in viewport coordinates — the shape `getBoundingClientRect()` gives you. */
export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The measured size of a floating panel. */
export interface FloatingSize {
  width: number;
  height: number;
}

/** The visible area a panel has to stay inside. */
export interface ViewportSize {
  width: number;
  height: number;
}

/** Knobs for {@link positionFloating}. */
export interface PositionOptions {
  /** Preferred side. Default `bottom`. */
  placement?: Placement;
  /** Distance between anchor and panel, in pixels. Default 8. */
  gap?: number;
  /** Minimum distance kept from each viewport edge, in pixels. Default 8. */
  padding?: number;
}

/** Where a floating panel ended up, and whether it had to flip to get there. */
export interface PositionResult {
  /** Viewport-relative left offset, for `position: fixed`. */
  x: number;
  /** Viewport-relative top offset, for `position: fixed`. */
  y: number;
  /** The side actually used — may differ from the one you asked for. */
  placement: Placement;
  /** True when the preferred side did not fit and the opposite one was used. */
  flipped: boolean;
}

/** The side directly across the anchor from `placement`. */
export function oppositePlacement(placement: Placement): Placement {
  switch (placement) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    default:
      return "left";
  }
}

/**
 * Whether a panel of this size fits on this side of the anchor without leaving
 * the viewport. Only the main axis is checked — the cross axis is solved by
 * shifting, not flipping, which is what users expect from a dropdown that
 * nudges sideways instead of jumping to the other side of its button.
 */
export function placementFits(
  placement: Placement,
  anchor: AnchorRect,
  floating: FloatingSize,
  viewport: ViewportSize,
  gap = 8,
  padding = 8,
): boolean {
  switch (placement) {
    case "top":
      return anchor.top - gap - floating.height >= padding;
    case "bottom":
      return anchor.top + anchor.height + gap + floating.height <= viewport.height - padding;
    case "left":
      return anchor.left - gap - floating.width >= padding;
    default:
      return anchor.left + anchor.width + gap + floating.width <= viewport.width - padding;
  }
}

/**
 * Place a floating panel next to its anchor.
 *
 * The preferred side wins whenever it fits. When it does not and the opposite
 * side does, the panel flips — the behaviour that keeps a dropdown near the
 * bottom of the screen from opening off-screen. If neither side fits (a panel
 * taller than the viewport) the preferred side is kept and the result is simply
 * clamped, because flipping into an equally bad position only looks like a bug.
 *
 * The result is in viewport coordinates, ready for `position: fixed`.
 */
export function positionFloating(
  anchor: AnchorRect,
  floating: FloatingSize,
  viewport: ViewportSize,
  options: PositionOptions = {},
): PositionResult {
  const { placement: preferred = "bottom", gap = 8, padding = 8 } = options;

  let placement = preferred;
  let flipped = false;
  if (!placementFits(preferred, anchor, floating, viewport, gap, padding)) {
    const other = oppositePlacement(preferred);
    if (placementFits(other, anchor, floating, viewport, gap, padding)) {
      placement = other;
      flipped = true;
    }
  }

  let x: number;
  let y: number;
  if (placement === "top" || placement === "bottom") {
    x = anchor.left + anchor.width / 2 - floating.width / 2;
    y =
      placement === "top"
        ? anchor.top - gap - floating.height
        : anchor.top + anchor.height + gap;
  } else {
    y = anchor.top + anchor.height / 2 - floating.height / 2;
    x =
      placement === "left"
        ? anchor.left - gap - floating.width
        : anchor.left + anchor.width + gap;
  }

  return {
    x: clamp(x, padding, viewport.width - floating.width - padding),
    y: clamp(y, padding, viewport.height - floating.height - padding),
    placement,
    flipped,
  };
}

/**
 * The next index in a focus ring, wrapping at both ends.
 *
 * `current` may be `-1` (or anything out of range) to mean "focus is not in the
 * ring yet", in which case moving forward lands on the first item and moving
 * backward on the last. Returns `-1` for an empty ring so the caller can tell
 * "nothing to focus" apart from "focus index 0".
 */
export function nextFocusIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

/** One toast in the queue. Plain data, so the reducer stays testable. */
export interface ToastRecord {
  id: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Colour intent. Default `default`. */
  tone: Tone;
  /** Milliseconds before it auto-dismisses. `0` means "stays until dismissed". */
  duration: number;
  /** An inline action, e.g. an Undo button. */
  action?: ReactNode;
  /** Whether the close button is rendered. */
  dismissible: boolean;
}

/** The whole queue: everything requested, plus how many may be on screen. */
export interface ToastState {
  items: ToastRecord[];
  /** How many toasts are shown at once; the rest wait their turn. */
  maxVisible: number;
}

/** Everything that can happen to the toast queue. */
export type ToastAction =
  | { type: "add"; toast: ToastRecord }
  | { type: "update"; id: string; patch: Partial<Omit<ToastRecord, "id">> }
  | { type: "dismiss"; id: string }
  | { type: "expire"; id: string }
  | { type: "clear" }
  | { type: "configure"; maxVisible: number };

/** The first `maxVisible` toasts — the ones actually rendered. */
export function visibleToasts(state: ToastState): ToastRecord[] {
  if (state.maxVisible <= 0) return [];
  return state.items.slice(0, state.maxVisible);
}

/**
 * The toast queue, as a pure reducer.
 *
 * Two decisions worth knowing about. Adding an id that already exists updates
 * that toast in place instead of stacking a duplicate, so a progress toast can
 * be promoted to a success toast without flicker. And `expire` — the timer
 * firing — is ignored for a toast that is still queued rather than visible,
 * because a toast nobody has seen yet must not time out before its turn.
 */
export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "add": {
      const index = state.items.findIndex((t) => t.id === action.toast.id);
      if (index === -1) return { ...state, items: [...state.items, action.toast] };
      const items = state.items.slice();
      items[index] = action.toast;
      return { ...state, items };
    }
    case "update": {
      const index = state.items.findIndex((t) => t.id === action.id);
      const existing = state.items[index];
      if (!existing) return state;
      const items = state.items.slice();
      items[index] = { ...existing, ...action.patch };
      return { ...state, items };
    }
    case "dismiss": {
      const items = state.items.filter((t) => t.id !== action.id);
      return items.length === state.items.length ? state : { ...state, items };
    }
    case "expire": {
      const onScreen = visibleToasts(state).some((t) => t.id === action.id);
      if (!onScreen) return state;
      return { ...state, items: state.items.filter((t) => t.id !== action.id) };
    }
    case "clear":
      return state.items.length === 0 ? state : { ...state, items: [] };
    case "configure":
      return state.maxVisible === action.maxVisible
        ? state
        : { ...state, maxVisible: action.maxVisible };
    default:
      return state;
  }
}

/* ==========================================================================
   DOM plumbing — all of it inside effects, none of it at module scope.
   ========================================================================== */

/** Everything the browser will let a user Tab to. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Tabbable elements inside `root`, in DOM order, skipping anything not rendered. */
function getFocusable(root: HTMLElement): HTMLElement[] {
  const found = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return found.filter(
    (el) => el.getClientRects().length > 0 && el.getAttribute("aria-hidden") !== "true",
  );
}

// Nested overlays each ask for the scroll lock; only the outermost may release it.
let scrollLockCount = 0;
let scrollLockPrevious = "";

function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => undefined;
  if (scrollLockCount === 0) {
    scrollLockPrevious = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) document.body.style.overflow = scrollLockPrevious;
  };
}

/**
 * Hide everything except the overlay from assistive technology, and put it all
 * back exactly as it was — including elements that were already `aria-hidden`
 * for their own reasons. Live regions are left alone so a toast announced while
 * a dialog is open still reaches the user.
 */
function hideSiblings(el: HTMLElement): () => void {
  if (typeof document === "undefined") return () => undefined;
  const parent = el.parentElement ?? document.body;
  const restore: Array<[Element, string | null]> = [];
  for (const child of Array.from(parent.children)) {
    if (child === el) continue;
    if (child.hasAttribute("aria-live")) continue;
    restore.push([child, child.getAttribute("aria-hidden")]);
    child.setAttribute("aria-hidden", "true");
  }
  return () => {
    for (const entry of restore) {
      const [child, previous] = entry;
      if (previous === null) child.removeAttribute("aria-hidden");
      else child.setAttribute("aria-hidden", previous);
    }
  };
}

/**
 * The node a portal renders into, resolved in an effect so the first render is
 * identical on the server and the client. Returns `null` until mounted, which
 * is the signal to render nothing.
 */
function usePortalNode(container?: HTMLElement | null): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    setNode(container ?? document.body);
  }, [container]);
  return node;
}

interface OverlayBehaviourOptions {
  open: boolean;
  /** The element that gets the focus trap. */
  panelRef: RefObject<HTMLElement>;
  /** The portal root — everything outside it is hidden from screen readers. */
  rootRef: RefObject<HTMLElement>;
  onClose: () => void;
  closeOnEscape: boolean;
  lockScroll: boolean;
  /** Focus this instead of the first focusable child — a Cancel button, usually. */
  initialFocusRef?: RefObject<HTMLElement>;
}

/**
 * The four things a dialog owes its user: focus goes in, focus stays in, Escape
 * closes it, and focus comes back to whatever opened it. Scroll locking and
 * hiding the rest of the page come along for the ride.
 */
function useOverlayBehaviour({
  open,
  panelRef,
  rootRef,
  onClose,
  closeOnEscape,
  lockScroll,
  initialFocusRef,
}: OverlayBehaviourOptions): void {
  // Read the latest callback without re-running the whole effect on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockScroll ? lockBodyScroll() : () => undefined;
    const releaseHidden = hideSiblings(rootRef.current ?? panel);

    const first = initialFocusRef?.current ?? getFocusable(panel)[0] ?? panel;
    first.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && closeOnEscape) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const current = items.findIndex((node) => node === document.activeElement);
      const target = items[nextFocusIndex(current, items.length, event.shiftKey ? -1 : 1)];
      if (!target) return;
      event.preventDefault();
      target.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      releaseHidden();
      releaseScroll();
      // Returning focus is what makes a dialog usable from the keyboard twice.
      previouslyFocused?.focus();
    };
  }, [open, panelRef, rootRef, closeOnEscape, lockScroll, initialFocusRef]);
}

/* ==========================================================================
   Backdrop
   ========================================================================== */

export interface BackdropProps extends HTMLAttributes<HTMLDivElement> {
  /** Blur what is behind it. Costs a compositor layer, so it is opt-in. */
  blur?: boolean;
}

/**
 * The dimmed layer under a modal or drawer. Exported on its own because custom
 * overlays should dim the page the same way the built-in ones do.
 *
 * It is `aria-hidden` and carries no role: it is decoration, and the click it
 * handles is a convenience, never the only way to close something.
 */
export const Backdrop = forwardRef<HTMLDivElement, BackdropProps>(function Backdrop(
  { blur = false, className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      aria-hidden
      className={classes("lac-backdrop", className)}
      data-blur={blur || undefined}
    />
  );
});

/* ==========================================================================
   Modal
   ========================================================================== */

/** Modal widths. `full` fills the viewport, for editors and media. */
export type ModalSize = "sm" | "md" | "lg" | "full";

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Controlled open state. */
  open?: boolean;
  /** Starting state when uncontrolled. */
  defaultOpen?: boolean;
  /** Fires whenever the modal wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /** Convenience callback for the close half of `onOpenChange`. */
  onClose?: () => void;
  /** Panel width. Default `md`. */
  size?: ModalSize;
  /** Heading. Becomes the dialog's accessible name. */
  title?: ReactNode;
  /** Supporting line under the title, wired up as `aria-describedby`. */
  description?: ReactNode;
  /** Footer content — put your action buttons here. */
  footer?: ReactNode;
  /** Clicking the dimmed area closes the modal. Default `true`. */
  closeOnOverlayClick?: boolean;
  /** Escape closes the modal. Default `true`. Turn it off for unsaved-work guards. */
  closeOnEscape?: boolean;
  /** Render the ✕ in the header. Default `true` when there is a title. */
  showCloseButton?: boolean;
  /** Accessible name for the ✕ button. */
  closeLabel?: string;
  /** Stop the page behind from scrolling while open. Default `true`. */
  lockScroll?: boolean;
  /** Focus this on open instead of the first focusable child. */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Portal target. Defaults to `document.body`. */
  container?: HTMLElement | null;
  /** Extra class for the dimmed layer. */
  backdropClassName?: string;
  /** Blur the page behind the modal. */
  blurBackdrop?: boolean;
}

/**
 * A dialog: dimmed page, trapped focus, Escape to close, focus handed back to
 * whatever opened it.
 *
 * It renders through a portal into `document.body`, created inside an effect so
 * server rendering produces nothing at all rather than mismatching markup. The
 * rest of the page is marked `aria-hidden` while it is open, which is the part
 * that turns a styled div into an actual dialog for a screen-reader user.
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(function Modal(
  {
    open,
    defaultOpen = false,
    onOpenChange,
    onClose,
    size = "md",
    title,
    description,
    footer,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    showCloseButton,
    closeLabel = "Close",
    lockScroll = true,
    initialFocusRef,
    container,
    backdropClassName,
    blurBackdrop = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const portal = usePortalNode(container);
  const id = useStableId(undefined, "modal");
  const titleId = `${id}-title`;
  const descriptionId = `${id}-desc`;

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [setOpen, onClose]);

  useOverlayBehaviour({
    open: isOpen,
    panelRef,
    rootRef,
    onClose: close,
    closeOnEscape,
    lockScroll,
    initialFocusRef,
  });

  if (!isOpen || !portal) return null;

  const withClose = showCloseButton ?? Boolean(title);

  return createPortal(
    <div ref={rootRef} className="lac lac-overlay-root" data-overlay="modal">
      <Backdrop
        blur={blurBackdrop}
        className={backdropClassName}
        onClick={closeOnOverlayClick ? close : undefined}
      />
      <div className="lac lac-modal-viewport">
        <div
          {...rest}
          ref={mergeRefs(ref, panelRef)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : rest["aria-labelledby"]}
          aria-describedby={description ? descriptionId : rest["aria-describedby"]}
          tabIndex={-1}
          className={classes("lac-modal", className)}
          data-size={size}
        >
          {(title || withClose) && (
            <div className="lac lac-modal-header">
              <div className="lac lac-modal-heading">
                {title && (
                  <h2 className="lac lac-modal-title" id={titleId}>
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="lac lac-modal-desc" id={descriptionId}>
                    {description}
                  </p>
                )}
              </div>
              {withClose && (
                <button
                  type="button"
                  className="lac lac-overlay-close"
                  aria-label={closeLabel}
                  onClick={close}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          )}
          <div className="lac lac-modal-body">{children}</div>
          {footer && <div className="lac lac-modal-footer">{footer}</div>}
        </div>
      </div>
    </div>,
    portal,
  );
});

/** The ✕ every overlay closes with. Inline so the package stays icon-free. */
function CloseIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable="false">
      <path
        d="M1 1l12 12M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Point a forwarded ref and a local ref at the same node. */
function mergeRefs<T>(
  forwarded: Ref<T> | undefined,
  local: MutableRefObject<T | null>,
): (node: T | null) => void {
  return (node: T | null) => {
    local.current = node;
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) (forwarded as { current: T | null }).current = node;
  };
}

/* ==========================================================================
   ConfirmDialog
   ========================================================================== */

export interface ConfirmDialogProps
  extends Omit<ModalProps, "footer" | "children" | "size"> {
  /** The question. Keep it specific: name the thing being deleted. */
  message?: ReactNode;
  /** Confirm button label. Default `Confirm`. */
  confirmLabel?: string;
  /** Cancel button label. Default `Cancel`. */
  cancelLabel?: string;
  /** `danger` paints the confirm button red — use it for anything destructive. */
  tone?: "default" | "danger";
  /**
   * Runs when the user confirms. Return a promise and the button shows a
   * spinner and blocks further clicks until it settles; the dialog closes only
   * when the promise resolves, so a failed delete leaves the dialog open.
   */
  onConfirm?: () => void | Promise<void>;
  /** Runs when the user cancels or dismisses. */
  onCancel?: () => void;
  /** Panel width. Default `sm` — a confirmation is not a form. */
  size?: ModalSize;
}

/**
 * The "are you sure?" dialog, with the async case handled.
 *
 * Most hand-rolled confirms close optimistically and leave the user guessing
 * when the request fails. This one waits: the confirm button is busy until
 * `onConfirm` settles, and the dialog stays open if it rejects.
 */
export function ConfirmDialog({
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
  onClose,
  open,
  defaultOpen = false,
  onOpenChange,
  initialFocusRef,
  size = "sm",
  closeOnOverlayClick = false,
  ...rest
}: ConfirmDialogProps): JSX.Element {
  // The dialog owns its open state and drives the Modal as a controlled one, so
  // the buttons close it whether or not the caller passed `open`.
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [setOpen, onClose]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    onCancel?.();
    finish();
  }, [busy, onCancel, finish]);

  const handleConfirm = useCallback(() => {
    const result = onConfirm?.();
    if (!(result instanceof Promise)) {
      finish();
      return;
    }
    setBusy(true);
    result.then(
      () => {
        if (aliveRef.current) setBusy(false);
        finish();
      },
      () => {
        // Keep the dialog open on failure — the user still has a decision to make.
        if (aliveRef.current) setBusy(false);
      },
    );
  }, [onConfirm, finish]);

  return (
    <Modal
      {...rest}
      open={isOpen}
      onOpenChange={setOpen}
      size={size}
      closeOnOverlayClick={closeOnOverlayClick}
      onClose={handleCancel}
      initialFocusRef={initialFocusRef ?? cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="outline" onClick={handleCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="solid"
            tone={tone === "danger" ? "danger" : "default"}
            loading={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}

/* ==========================================================================
   Drawer
   ========================================================================== */

/** Which edge a drawer slides in from. */
export type DrawerSide = "left" | "right" | "top" | "bottom";

export interface DrawerProps extends Omit<ModalProps, "size"> {
  /** Edge to slide from. Default `right`. */
  side?: DrawerSide;
  /**
   * Width for a left/right drawer, height for a top/bottom one. A number is
   * pixels; a string is any CSS length, so `40vw` and `min(420px, 90vw)` work.
   */
  size?: number | string;
}

/**
 * A panel that slides in from an edge — filters, details, a mobile nav.
 *
 * Identical focus, escape and scroll rules to `Modal`, because from the
 * keyboard they are the same thing; only the geometry differs.
 */
export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(function Drawer(
  {
    open,
    defaultOpen = false,
    onOpenChange,
    onClose,
    side = "right",
    size = 360,
    title,
    description,
    footer,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    showCloseButton,
    closeLabel = "Close",
    lockScroll = true,
    initialFocusRef,
    container,
    backdropClassName,
    blurBackdrop = false,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const portal = usePortalNode(container);
  const id = useStableId(undefined, "drawer");
  const titleId = `${id}-title`;
  const descriptionId = `${id}-desc`;

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [setOpen, onClose]);

  useOverlayBehaviour({
    open: isOpen,
    panelRef,
    rootRef,
    onClose: close,
    closeOnEscape,
    lockScroll,
    initialFocusRef,
  });

  if (!isOpen || !portal) return null;

  const withClose = showCloseButton ?? true;
  const extent = typeof size === "number" ? `${size}px` : size;

  return createPortal(
    <div ref={rootRef} className="lac lac-overlay-root" data-overlay="drawer">
      <Backdrop
        blur={blurBackdrop}
        className={backdropClassName}
        onClick={closeOnOverlayClick ? close : undefined}
      />
      <div
        {...rest}
        ref={mergeRefs(ref, panelRef)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : rest["aria-labelledby"]}
        aria-describedby={description ? descriptionId : rest["aria-describedby"]}
        tabIndex={-1}
        className={classes("lac-drawer", className)}
        data-side={side}
        style={{ ["--lac-drawer-size" as string]: extent, ...style }}
      >
        {(title || withClose) && (
          <div className="lac lac-modal-header">
            <div className="lac lac-modal-heading">
              {title && (
                <h2 className="lac lac-modal-title" id={titleId}>
                  {title}
                </h2>
              )}
              {description && (
                <p className="lac lac-modal-desc" id={descriptionId}>
                  {description}
                </p>
              )}
            </div>
            {withClose && (
              <button
                type="button"
                className="lac lac-overlay-close"
                aria-label={closeLabel}
                onClick={close}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        )}
        <div className="lac lac-drawer-body">{children}</div>
        {footer && <div className="lac lac-modal-footer">{footer}</div>}
      </div>
    </div>,
    portal,
  );
});

/* ==========================================================================
   Popover
   ========================================================================== */

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, "content"> {
  /** What the user clicks. Rendered inside the popover's own button. */
  trigger: ReactNode;
  /** Preferred side. Flips automatically when it would leave the viewport. */
  placement?: Placement;
  /** Distance from the trigger, in pixels. Default 8. */
  gap?: number;
  /** Controlled open state. */
  open?: boolean;
  /** Starting state when uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Clicking outside closes it. Default `true`. */
  closeOnOutsideClick?: boolean;
  /** Portal target. Defaults to `document.body`. */
  container?: HTMLElement | null;
  /** Extra class for the floating panel. */
  panelClassName?: string;
  /** Class for the trigger button. */
  triggerClassName?: string;
}

/**
 * A panel anchored to a button: menus, filter forms, colour pickers.
 *
 * It is portalled and `position: fixed`, so it is never clipped by an ancestor
 * with `overflow: hidden` — the reason most in-place dropdowns break inside
 * tables and cards. Placement is computed by {@link positionFloating}, which
 * flips the panel to the other side of the trigger when the preferred side
 * would run off screen.
 *
 * Unlike a modal it does not trap focus: a popover is part of the page, not a
 * mode. Escape and outside clicks close it, and focus returns to the trigger.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  {
    trigger,
    placement = "bottom",
    gap = 8,
    open,
    defaultOpen = false,
    onOpenChange,
    closeOnOutsideClick = true,
    container,
    panelClassName,
    triggerClassName,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const portal = usePortalNode(container);
  const id = useStableId(undefined, "popover");
  const [position, setPosition] = useState<PositionResult>({
    x: 0,
    y: 0,
    placement,
    flipped: false,
  });

  // Measure after paint, then follow scroll and resize while open.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;

    const measure = (): void => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      setPosition(
        positionFloating(
          { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
          { placement, gap },
        ),
      );
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen, placement, gap]);

  // Escape and outside clicks close it; focus goes back to the trigger.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === "undefined") return;

    const close = (): void => {
      setOpen(false);
      anchorRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    const onPointerDown = (event: MouseEvent): void => {
      if (!closeOnOutsideClick) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [isOpen, closeOnOutsideClick, setOpen]);

  // Move focus into the panel so the keyboard follows the pointer.
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    (getFocusable(panel)[0] ?? panel).focus();
  }, [isOpen]);

  return (
    <span className={classes("lac-popover-anchor", className)}>
      <button
        type="button"
        ref={anchorRef}
        className={classes("lac-popover-trigger", triggerClassName)}
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(!isOpen)}
      >
        {trigger}
      </button>
      {isOpen &&
        portal &&
        createPortal(
          <div
            {...rest}
            id={id}
            ref={mergeRefs(ref, panelRef)}
            role="dialog"
            tabIndex={-1}
            className={classes("lac-popover", panelClassName)}
            data-placement={position.placement}
            data-flipped={position.flipped || undefined}
            style={{ left: `${position.x}px`, top: `${position.y}px`, ...rest.style }}
          >
            {children}
          </div>,
          portal,
        )}
    </span>
  );
});

/* ==========================================================================
   Tooltip
   ========================================================================== */

export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "content"> {
  /** The tip text. Keep it short — a tooltip is a hint, never the only copy. */
  content: ReactNode;
  /** Preferred side, flipped automatically when it would leave the viewport. */
  placement?: Placement;
  /** Milliseconds of hover before it appears. Default 250. */
  delay?: number;
  /** Distance from the trigger, in pixels. Default 6. */
  gap?: number;
  /** Never show it — handy for disabling a tip conditionally. */
  disabled?: boolean;
  /** Portal target. Defaults to `document.body`. */
  container?: HTMLElement | null;
}

/**
 * A hint that appears on hover *and* on keyboard focus.
 *
 * Focus is the half everyone forgets: a tooltip only reachable with a mouse is
 * invisible to keyboard users. The tip itself is `pointer-events: none` and
 * never takes focus, so it can never sit between the cursor and the control it
 * describes.
 */
export const Tooltip = forwardRef<HTMLSpanElement, TooltipProps>(function Tooltip(
  {
    content,
    placement = "top",
    delay = 250,
    gap = 6,
    disabled = false,
    container,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [shown, setShown] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portal = usePortalNode(container);
  const id = useStableId(undefined, "tooltip");
  const [position, setPosition] = useState<PositionResult>({
    x: 0,
    y: 0,
    placement,
    flipped: false,
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimer();
    if (delay <= 0) {
      setShown(true);
      return;
    }
    timerRef.current = setTimeout(() => setShown(true), delay);
  }, [disabled, delay, clearTimer]);

  const hide = useCallback(() => {
    clearTimer();
    setShown(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Escape hides a tip without moving focus — required by WCAG 1.4.13.
  useEffect(() => {
    if (!shown) return;
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [shown, hide]);

  useEffect(() => {
    if (!shown) return;
    if (typeof window === "undefined") return;
    const measure = (): void => {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;
      const rect = anchor.getBoundingClientRect();
      setPosition(
        positionFloating(
          { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          { width: tip.offsetWidth, height: tip.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
          { placement, gap },
        ),
      );
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [shown, placement, gap]);

  const visible = shown && !disabled;
  const describedBy = visible ? id : undefined;

  // `aria-describedby` belongs on the control itself, not on the wrapper: a
  // screen reader announces the description of the element that has focus, and
  // the wrapper is never the thing that gets focused. Only a non-element child
  // (bare text) falls back to describing the wrapper.
  const described = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <span
      {...rest}
      ref={mergeRefs(ref, anchorRef)}
      className={classes("lac-tooltip-anchor", className)}
      // focusin/focusout bubble, so this catches focus on the wrapped control.
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={isValidElement(children) ? undefined : describedBy}
    >
      {described}
      {visible &&
        portal &&
        createPortal(
          <div
            id={id}
            ref={tipRef}
            role="tooltip"
            className="lac lac-tooltip"
            data-placement={position.placement}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
          >
            {content}
          </div>,
          portal,
        )}
    </span>
  );
});

/* ==========================================================================
   Toast
   ========================================================================== */

/** The six corners a toast stack can live in. */
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /** Colour intent. */
  tone?: Tone;
  /** Inline action, e.g. an Undo button. */
  action?: ReactNode;
  /** Renders the close button when provided. */
  onDismiss?: () => void;
  /** Accessible name for the close button. */
  dismissLabel?: string;
}

/**
 * One toast, as a plain presentational component. `ToastProvider` renders these
 * for you, but it is exported so you can drop a static one into a page or a
 * storybook without standing up the queue.
 */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { title, description, tone = "default", action, onDismiss, dismissLabel = "Dismiss", className, children, ...rest },
  ref,
) {
  return (
    <div {...rest} ref={ref} className={classes("lac-toast", className)} data-tone={tone}>
      <div className="lac lac-toast-content">
        {title && <div className="lac lac-toast-title">{title}</div>}
        {description && <div className="lac lac-toast-desc">{description}</div>}
        {children}
      </div>
      {action && <div className="lac lac-toast-action">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          className="lac lac-overlay-close"
          aria-label={dismissLabel}
          onClick={onDismiss}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
});

/** What you hand to `toast()`. Everything but the content is optional. */
export interface ToastOptions {
  /** Pass your own id to update an existing toast instead of stacking a new one. */
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  tone?: Tone;
  /** Milliseconds on screen. `0` keeps it until the user dismisses it. */
  duration?: number;
  action?: ReactNode;
  /** Show the close button. Default `true`. */
  dismissible?: boolean;
}

/** The handle `useToast()` gives you. */
export interface ToastApi {
  /** Queue a toast. Pass a string for the simple case. Returns its id. */
  toast: (options: ToastOptions | string) => string;
  /** Remove one toast now. */
  dismiss: (id: string) => void;
  /** Remove every toast, queued ones included. */
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children?: ReactNode;
  /** How many toasts are on screen at once. The rest queue. Default 3. */
  maxVisible?: number;
  /** Corner of the screen. Default `bottom-right`. */
  position?: ToastPosition;
  /** Default milliseconds on screen. Default 5000. `0` disables auto-dismiss. */
  duration?: number;
  /** Portal target. Defaults to `document.body`. */
  container?: HTMLElement | null;
  /** Accessible name for the toast region. */
  label?: string;
}

/**
 * Holds the toast queue and renders the stack.
 *
 * `maxVisible` is a queue, not a cap: extra toasts wait for a slot instead of
 * being dropped, and their timers do not start until they are actually on
 * screen. Hovering the stack pauses every countdown, because a notification
 * that vanishes while you are reading it is worse than no notification.
 */
export function ToastProvider({
  children,
  maxVisible = 3,
  position = "bottom-right",
  duration = 5000,
  container,
  label = "Notifications",
}: ToastProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(toastReducer, { items: [], maxVisible });
  const [paused, setPaused] = useState(false);
  const portal = usePortalNode(container);
  const counter = useRef(0);
  const idPrefix = useStableId(undefined, "toast");

  // Keep the reducer's copy of maxVisible in step with the prop — `expire`
  // needs it to know whether a toast is on screen or still waiting.
  useEffect(() => {
    dispatch({ type: "configure", maxVisible });
  }, [maxVisible]);

  const api = useMemo<ToastApi>(
    () => ({
      toast: (options) => {
        const input: ToastOptions = typeof options === "string" ? { title: options } : options;
        counter.current += 1;
        const id = input.id ?? `${idPrefix}-${counter.current}`;
        dispatch({
          type: "add",
          toast: {
            id,
            title: input.title,
            description: input.description,
            tone: input.tone ?? "default",
            duration: input.duration ?? duration,
            action: input.action,
            dismissible: input.dismissible ?? true,
          },
        });
        return id;
      },
      dismiss: (id) => dispatch({ type: "dismiss", id }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [duration, idPrefix],
  );

  const expire = useCallback((id: string) => dispatch({ type: "expire", id }), []);
  const dismiss = useCallback((id: string) => dispatch({ type: "dismiss", id }), []);

  const shown = visibleToasts({ items: state.items, maxVisible });

  return (
    <ToastContext.Provider value={api}>
      {children}
      {portal &&
        createPortal(
          <div
            className="lac lac-toast-viewport"
            data-position={position}
            role="region"
            aria-label={label}
            aria-live="polite"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            {shown.map((item) => (
              <ToastRow
                key={item.id}
                record={item}
                paused={paused}
                onExpire={expire}
                onDismiss={dismiss}
              />
            ))}
          </div>,
          portal,
        )}
    </ToastContext.Provider>
  );
}

/** One queued toast plus its countdown. Split out so the timer is per-toast. */
function ToastRow({
  record,
  paused,
  onExpire,
  onDismiss,
}: {
  record: ToastRecord;
  paused: boolean;
  onExpire: (id: string) => void;
  onDismiss: (id: string) => void;
}): JSX.Element {
  // Remaining time survives pauses, so hovering does not restart the countdown.
  const remaining = useRef(record.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused || record.duration <= 0 || remaining.current <= 0) return;
    startedAt.current = Date.now();
    const id = record.id;
    const timer = setTimeout(() => onExpire(id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, record.duration, record.id, onExpire]);

  return (
    <Toast
      title={record.title}
      description={record.description}
      tone={record.tone}
      action={record.action}
      onDismiss={record.dismissible ? () => onDismiss(record.id) : undefined}
    />
  );
}

/**
 * The toast handle. Must be called under a `ToastProvider` — the throw is
 * deliberate, because a silently no-op `toast()` is a bug you find in
 * production rather than in development.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast() must be used inside a <ToastProvider>.");
  }
  return api;
}
