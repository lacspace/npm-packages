/**
 * @lacspace/components — a dependency-free React component library.
 *
 * Bring the stylesheet in once, anywhere in your app:
 *   import "@lacspace/components/styles.css";
 * then restyle everything by redefining the --lac-* variables in your own CSS.
 */
export { cx, clamp, percent, useControllable, useStableId } from "./util.js";
export type { Size, Tone } from "./util.js";

export { LacspaceStyles, componentsCss } from "./styles-inject.js";

export { Button, ButtonGroup, IconButton } from "./button.js";
export type { ButtonProps, ButtonGroupProps, ButtonVariant, IconButtonProps } from "./button.js";

export { Spinner, Skeleton, Progress, ProgressRing } from "./feedback.js";
export type { SpinnerProps, SkeletonProps, ProgressProps, ProgressRingProps } from "./feedback.js";

export {
  Card, CardHeader, CardBody, CardFooter, CardTitle, CardDescription,
  Alert, Badge,
} from "./surfaces.js";
export type { CardProps, AlertProps, BadgeProps } from "./surfaces.js";

export {
  Field, Label, Input, Textarea, Select, Checkbox, Radio, Switch,
} from "./input.js";
export type {
  FieldProps, LabelProps, InputProps, TextareaProps, SelectProps, SelectOption,
  CheckboxProps, RadioProps, SwitchProps,
} from "./input.js";

export {
  Backdrop, Modal, ConfirmDialog, Drawer, Popover, Tooltip,
  Toast, ToastProvider, useToast,
  positionFloating, placementFits, oppositePlacement, nextFocusIndex,
  toastReducer, visibleToasts,
} from "./overlay.js";
export type {
  BackdropProps, ModalProps, ModalSize, ConfirmDialogProps, DrawerProps, DrawerSide,
  PopoverProps, TooltipProps, ToastProps, ToastProviderProps, ToastOptions, ToastApi,
  ToastPosition, ToastRecord, ToastState, ToastAction,
  Placement, AnchorRect, FloatingSize, ViewportSize, PositionOptions, PositionResult,
} from "./overlay.js";

export {
  // Tabs
  Tabs, TabList, Tab, TabPanel,
  // Accordion
  Accordion, AccordionItem,
  // Breadcrumbs
  Breadcrumbs,
  // Pagination
  Pagination,
  // Stepper
  Stepper,
  // Menu
  DropdownMenu,
  // Sidebar nav + toolbar
  NavList, NavSection, NavItem, Toolbar, ToolbarGroup, ToolbarSeparator,
  // Pure navigation logic, reusable on its own
  ELLIPSIS, paginationRange, collapseBreadcrumbs, rovingIndex, firstEnabledIndex,
  lastEnabledIndex, typeaheadBuffer, typeaheadMatch, deriveStepStates, toggleAccordionValue,
} from "./navigation.js";
export type {
  TabsProps, TabsVariant, TabListProps, TabProps, TabPanelProps,
  AccordionProps, AccordionVariant, AccordionItemProps,
  BreadcrumbsProps, BreadcrumbItem, BreadcrumbSlot,
  PaginationProps, PaginationLabels, PaginationSlot,
  StepperProps, StepItem, StepState, StepStateOptions,
  DropdownMenuProps, DropdownMenuItem, DropdownMenuAction, DropdownMenuSeparator, DropdownMenuLabel,
  NavListProps, NavSectionProps, NavItemProps,
  ToolbarProps, ToolbarGroupProps, ToolbarSeparatorProps,
} from "./navigation.js";

// Data display -------------------------------------------------------------
export {
  Avatar, AvatarGroup, Stat, Timeline, TimelineItem, DescriptionList, EmptyState,
  Tag, TagInput, Rating, Kbd, Code, Snippet, Divider, Tree, MetricBar,
} from "./display.js";
export type {
  AvatarProps, AvatarGroupProps, AvatarSize, StatProps,
  TimelineProps, TimelineItemProps, DescriptionListProps, DescriptionItem,
  EmptyStateProps, TagProps, TagInputProps, RatingProps, KbdProps, CodeProps,
  SnippetProps, DividerProps, TreeProps, TreeNode, MetricBarProps, MetricItem,
} from "./display.js";
// The rules the data-display components run on, exported so the same initials,
// deltas and breakdowns can be produced outside React.
export {
  AVATAR_COLOR_COUNT, TAG_SEPARATORS, initials, colorIndexFor, splitAvatarOverflow,
  formatDelta, deltaTone, roundToHalf, normalizeRating, splitKeys, splitTagInput,
  mergeTags, normalizeMetrics, flattenTree,
} from "./display.js";
export type {
  AvatarOverflow, DeltaDirection, DeltaInfo, FormatDeltaOptions, MergeTagsOptions,
  MergeTagsResult, NormalizedMetric, FlatTreeNode,
} from "./display.js";

export {
  Stack, HStack, VStack, Grid, GridItem, Container, Section,
  Spacer, Center, AspectRatio, ScrollArea, Sticky, Panel,
  // Pure layout maths, exported so an app can build its own primitives on the
  // same rules instead of re-deriving them.
  spaceToken, lengthToken, gridTemplate, spanValue,
  resolveResponsive, responsiveVars, ratioToPercent, scrollEdges,
} from "./layout.js";
export type {
  StackProps, StackDirection, GridProps, GridItemProps, ContainerProps, ContainerSize,
  SectionProps, SpacerProps, CenterProps, AspectRatioProps, ScrollAreaProps, StickyProps,
  PanelProps, Breakpoint, Responsive, ResponsiveMap, SpaceValue, ScrollEdgeState,
} from "./layout.js";

export {
  Text, Heading, Prose, Blockquote, Highlight, Truncate,
  truncateMiddle, splitHighlight,
} from "./typography.js";
export type {
  TextProps, TextSize, TextTone, TextWeight, HeadingProps, HeadingLevel,
  ProseProps, BlockquoteProps, HighlightProps, TruncateProps, HighlightPart,
} from "./typography.js";

export {
  // Components
  Slider, NumberInput, PinInput, Combobox, MultiSelect, SearchInput, PasswordInput,
  FileDrop, ColorInput, RadioGroup, CheckboxGroup, ToggleGroup, Fieldset,
  // Pure logic — slider
  snapToStep, sliderValueToPercent, percentToSliderValue, orderThumbs, setThumbValue,
  moveThumb, nearestThumb,
  // Pure logic — numbers
  decimalPlaces, roundTo, clampNumber, parseNumericInput, formatNumberValue,
  groupThousands, stepNumber,
  // Pure logic — pin
  pinPattern, padPin, distributePin, firstEmptyPinIndex,
  // Pure logic — combobox
  defaultComboboxFilter, filterOptions, moveHighlight, nextEnabledIndex,
  // Pure logic — password, files, colour, selection, timing
  scorePassword, COMMON_PASSWORDS,
  matchesAccept, validateFiles, formatBytes,
  isValidHex, normalizeHex, hexWithoutAlpha,
  toggleSelection, debounce,
} from "./form-controls.js";
export type {
  SliderProps, SliderValue, SliderMark, SliderScale,
  NumberInputProps, NumberFormatOptions, NumberStepOptions,
  PinInputProps, PinType,
  ComboboxProps, ComboboxOption, MultiSelectProps,
  SearchInputProps, PasswordInputProps, PasswordStrength,
  FileDropProps, FileLike, FileRejection, FileRejectionReason, FileValidationOptions,
  ColorInputProps,
  RadioGroupProps, CheckboxGroupProps, ChoiceOption,
  ToggleGroupProps, ToggleGroupItem, ToggleSelectionOptions,
  FieldsetProps, Debounced,
} from "./form-controls.js";
