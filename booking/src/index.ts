/**
 * @lacspace/booking — free meeting slots across IANA time zones, readable
 * proposals and RFC 5545/5546 invites. Zero dependencies, isomorphic.
 */

export { freeSlots, mergeIntervals } from "./slots";
export type { FreeSlotsInput, Interval, WorkingHours } from "./slots";
export { proposeText, zoneLabel, resolveLocale } from "./propose";
export type { ProposeOptions } from "./propose";
export { invite, foldLine, escapeText, icsDate } from "./ics";
export type { Invite, InviteOptions, Person } from "./ics";
export { offsetMinutes, fromLocal, toLocal, isValidTimeZone } from "./tz";
export type { LocalParts } from "./tz";
