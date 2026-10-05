# @lacspace/nepal-holidays

Nepal's **official** public holidays by Bikram Sambat year, transcribed from the Ministry of Home Affairs notice published in Nepal Rajpatra. Each entry has:
- BS and AD dates;
- English and Nepali names;
- who the day off applies to.

It is pure JS with no dependencies, and it is safe for React Native.

```ts
import { holidays, holidaysOn, isHoliday, upcoming } from "@lacspace/nepal-holidays";

holidays(2083, { scope: "national" });
// [{ id: "new-year", name: { en: "Nepali New Year", ne: "नव वर्ष" }, kind: "public-holiday", category: "festival",
//    scope: "national", dateBS: "2083-01-01", dateAD: "2026-04-14", days: 1, section: "2.1(क)", source: {…} }, …]

holidaysOn("2026-10-20");            // [Dashain: 2083-06-31 → 2083-07-06, 17–23 Oct 2026, 7 days]
isHoliday("2026-10-24");             // { holiday: true, saturday: true, holidays: [] }
upcoming("2026-10-05", 3);           // Ghatasthapana, Dashain, Tihar
holidays(2083, { district: "Parsa", scope: "regional" }); // Fagu Purnima on Chait 8 (Terai)
```

## What's in it

**Coverage:** BS 2083 (14 Apr 2026 – 13 Apr 2027), from *Nepal Rajpatra, Khanda 75, Sankhya 67, Bhag 5, 2082-11-18*. All 45 entries are included:

| `scope` | Who gets the day off |
|---|---|
| `national` | everyone |
| `regional` | `region: "kathmandu-valley"` (the jatras), Fagu Purnima's `hill` (56 districts) and `terai` (21 districts, listed), or a `districts` list |
| `community` | a community or religion (Newar, Dura, Kirat, Muslim, Sikh) |
| `women` | women employees (Teej, Jitiya) |
| `education` | educational institutions (Vasant Panchami) |
| `disability` | employees with disabilities (3 December) |

`kind: "observance"` marks the three national days when offices stay open: Civil Service Day, Gen Z Martyrs' Day and the day against untouchability.

**Undated entries:** the notice leaves some holidays to the day itself:
- Eid al-Fitr and Bakar Eid;
- Bhoto Jatra;
- Mohammed Jayanti and Guru Nanak Jayanti;
- Sirua Pawani.

These have `dateBS: null` and are never guessed. Filter them out with `{ undated: false }`.

**How every date is verified:**
- Every date matches the weekday printed next to it in the notice.
- Every printed Saturday is a Saturday.
- Every day of the year agrees with `@lacspace/nepali-date`.
- Dates pinned to the Gregorian calendar in the notice match: 25 Dec, 1 May, 8 Mar, 3 Dec.

A new year's list is added when the Ministry publishes it, usually in Falgun.

## API

- **`holidays(year, filter?)`:** the year's entries in date order. Filters:
  - `scope`: one scope or an array;
  - `kind`: public holiday or observance;
  - `district` / `region`: keeps a regional holiday only where it applies;
  - `undated`.
- **`holidaysOn(adDate, filter?)`:** the entries covering a date, including days inside Dashain or Tihar.
- **`isHoliday(adDate, filter = { scope: "national" })`:** returns `{ holiday, saturday, holidays }`. Saturdays count, and observances don't.
- **`upcoming(from?, n = 5, filter?)`:** the next dated entries.
- **`bsToAD(y, m, d)` / `adToBS(ad)`:** conversion for the covered years.
- **`source(year)`:** the gazette reference and the Ministry's URL.
- **`describe()`:** the command schema for an AI conductor.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
