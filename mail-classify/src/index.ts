/**
 * @lacspace/mail-classify — fast, explainable email categoriser (10 categories +
 * priority) from headers only. Zero dependencies, isomorphic.
 */

export {
  classify,
  createClassifier,
  isCategory,
  parseAddress,
  splitAddressList,
  getHeader,
} from "./classify";
export type {
  AddressInput,
  ClassifyInput,
  ClassifyOptions,
  Classification,
  HeaderSource,
  ParsedAddress,
} from "./classify";
export {
  CATEGORIES,
  FOCUSED,
  CATEGORY_META,
  categoryMeta,
  DEFAULT_PATTERNS,
  FREE_MAIL,
  AUTOMATED,
  NOREPLY_LOCAL,
  SOCIAL_DOM,
  NOTIF_DOM,
  FINANCE,
  FINANCE_SNIPPET_CONFIRM,
  CALENDAR,
  CALENDAR_SUBJECT,
  CALENDAR_ICS,
  RECRUIT,
  RECRUIT_SNIPPET_CONFIRM,
  NEWSLETTER,
  PROMO,
  URGENT,
  QUESTION,
} from "./patterns";
export type { Category, Priority, CategoryMeta, ClassifyPatterns } from "./patterns";
