/**
 * Locale data tables. `en` (default) is generic English/US-ish; `ne` is
 * Nepal-aware (romanized Nepali names, districts, provinces, NPR, +977 phones).
 * Everything here is a plain constant so generators stay pure functions of the
 * RNG plus a locale table.
 */

export type Locale = "en" | "ne";

export interface LocaleData {
  firstNamesMale: string[];
  firstNamesFemale: string[];
  lastNames: string[];
  cities: string[];
  states: string[];
  country: string;
  countryCode: string;
  streetNames: string[];
  streetSuffixes: string[];
  /** How to build a postal/ZIP code for this locale. */
  zip: (r: { digits: (n: number) => string }) => string;
  currency: { code: string; symbol: string };
  /** E.164 phone (with +country) and a local-format phone. */
  phone: (r: { digits: (n: number) => string; pick: <T>(a: readonly T[]) => T }) => { e164: string; local: string };
}

const LOREM =
  ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor " +
    "incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud " +
    "exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute " +
    "irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur " +
    "excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt " +
    "mollit anim id est laborum").split(" ");

export const LOREM_WORDS: string[] = LOREM;

export const EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "proton.me", "icloud.com"];
export const URL_TLDS = ["com", "net", "org", "io", "dev", "co", "app", "xyz"];

export const COMPANY_SUFFIXES = ["Inc", "LLC", "Ltd", "Group", "Labs", "Technologies", "Systems", "Solutions", "Holdings", "Partners"];
export const COMPANY_PREFIXES = ["Blue", "Green", "Bright", "Silver", "North", "Peak", "Core", "Nova", "Prime", "Vertex", "Quantum", "Apex", "Cloud", "Iron", "Golden"];
export const COMPANY_ROOTS = ["wave", "byte", "forge", "sphere", "logic", "sync", "grid", "flux", "scale", "stack", "pulse", "bloom", "shift", "orbit", "loop"];

export const BUZZ_ADJ = ["synergistic", "scalable", "frictionless", "customer-centric", "cutting-edge", "cloud-native", "next-generation", "end-to-end", "data-driven", "seamless", "robust", "agile"];
export const BUZZ_NOUN = ["solutions", "paradigms", "platforms", "architectures", "ecosystems", "workflows", "insights", "experiences", "pipelines", "frameworks", "channels", "networks"];
export const BUZZ_VERB = ["engineer", "empower", "streamline", "orchestrate", "harness", "leverage", "optimize", "accelerate", "transform", "unlock", "scale", "deliver"];

export const JOB_LEVELS = ["Junior", "Senior", "Lead", "Principal", "Staff", "Chief", "Head of", "Associate"];
export const JOB_ROLES = ["Engineer", "Developer", "Designer", "Manager", "Analyst", "Consultant", "Architect", "Specialist", "Officer", "Strategist", "Scientist", "Administrator"];
export const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "Finance", "Human Resources", "Operations", "Support", "Product", "Design", "Legal", "Research", "IT"];

export const PRODUCT_ADJ = ["Ergonomic", "Rustic", "Handcrafted", "Sleek", "Refined", "Intelligent", "Modern", "Premium", "Compact", "Elegant", "Durable", "Lightweight"];
export const PRODUCT_MATERIAL = ["Steel", "Wooden", "Cotton", "Leather", "Bamboo", "Ceramic", "Plastic", "Concrete", "Glass", "Copper"];
export const PRODUCT_NOUN = ["Chair", "Table", "Keyboard", "Bottle", "Backpack", "Lamp", "Shoes", "Watch", "Headphones", "Jacket", "Mug", "Gloves", "Wallet", "Speaker"];
export const PRODUCT_CATEGORIES = ["Electronics", "Books", "Clothing", "Home", "Toys", "Sports", "Beauty", "Grocery", "Automotive", "Garden", "Health", "Office"];
export const COLORS = ["red", "green", "blue", "yellow", "orange", "purple", "teal", "black", "white", "gray", "pink", "brown"];

const EN: LocaleData = {
  firstNamesMale: ["James", "John", "Michael", "David", "Robert", "William", "Daniel", "Thomas", "Joseph", "Ethan", "Liam", "Noah", "Lucas", "Henry", "Alexander"],
  firstNamesFemale: ["Mary", "Emma", "Olivia", "Sophia", "Isabella", "Ava", "Charlotte", "Amelia", "Emily", "Grace", "Chloe", "Zoe", "Hannah", "Lily", "Nora"],
  lastNames: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Taylor", "Thomas", "Moore"],
  cities: ["New York", "London", "San Francisco", "Berlin", "Toronto", "Sydney", "Singapore", "Tokyo", "Paris", "Amsterdam", "Austin", "Seattle", "Boston", "Chicago", "Denver"],
  states: ["California", "Texas", "New York", "Florida", "Washington", "Illinois", "Ohio", "Georgia", "Colorado", "Oregon", "Arizona", "Nevada"],
  country: "United States",
  countryCode: "US",
  streetNames: ["Maple", "Oak", "Pine", "Cedar", "Elm", "Washington", "Lake", "Hill", "Sunset", "River", "Park", "Main", "Highland", "Franklin", "Union"],
  streetSuffixes: ["Street", "Avenue", "Boulevard", "Lane", "Road", "Drive", "Court", "Way", "Terrace", "Place"],
  zip: (r) => r.digits(5),
  currency: { code: "USD", symbol: "$" },
  phone: (r) => {
    const area = r.digits(3);
    const rest = `${r.digits(3)}${r.digits(4)}`;
    return { e164: `+1${area}${rest}`, local: `(${area}) ${rest.slice(0, 3)}-${rest.slice(3)}` };
  },
};

// Nepal (romanized). Provinces and common districts, Nepali names, +977 mobiles.
const NE: LocaleData = {
  firstNamesMale: ["Aarav", "Aayush", "Anish", "Bibek", "Prakash", "Rajesh", "Sujan", "Kiran", "Nabin", "Suman", "Dipesh", "Hari", "Krishna", "Bishal", "Rohit", "Manish", "Saroj", "Sandesh"],
  firstNamesFemale: ["Anjali", "Sita", "Gita", "Puja", "Sunita", "Rita", "Sarita", "Nisha", "Priya", "Laxmi", "Sabina", "Muna", "Rekha", "Asha", "Deepa", "Sushmita", "Manisha", "Pratima"],
  lastNames: ["Sharma", "Shrestha", "Adhikari", "Karki", "Thapa", "Gurung", "Magar", "Rai", "Limbu", "Tamang", "Bhattarai", "Poudel", "Koirala", "Acharya", "Dahal", "Bhandari", "Pandey", "Khadka", "Basnet", "Maharjan"],
  cities: ["Kathmandu", "Lalitpur", "Bhaktapur", "Pokhara", "Biratnagar", "Birgunj", "Dharan", "Butwal", "Hetauda", "Nepalgunj", "Dhangadhi", "Janakpur", "Itahari", "Bharatpur", "Damak"],
  states: ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"],
  country: "Nepal",
  countryCode: "NP",
  streetNames: ["New Road", "Durbar Marg", "Lakeside", "Putalisadak", "Baneshwor", "Thamel", "Kupondole", "Jawalakhel", "Maitighar", "Baluwatar", "Sanepa", "Boudha"],
  streetSuffixes: ["Marg", "Chowk", "Tole", "Path", "Road", "Sadak"],
  zip: (r) => r.digits(5),
  currency: { code: "NPR", symbol: "Rs." },
  phone: (r) => {
    const prefix = r.pick(["98", "97"]);
    const carrier = r.pick(["4", "5", "6", "0", "1", "8"]);
    const rest = r.digits(7);
    const local = `${prefix}${carrier}${rest}`; // 10 digits
    return { e164: `+977${local}`, local: `${local.slice(0, 3)}-${local.slice(3)}` };
  },
};

export const LOCALES: Record<Locale, LocaleData> = { en: EN, ne: NE };

export function isLocale(v: string): v is Locale {
  return v === "en" || v === "ne";
}
