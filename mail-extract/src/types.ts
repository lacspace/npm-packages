export type ExtractType = "order" | "invoice" | "receipt" | "flight" | "otp" | "shipment" | "reservation" | "event";

export interface Extraction {
  type: ExtractType;
  fields: Record<string, unknown>;
  /** 0..1. JSON-LD 0.95, microdata 0.9, heuristics lower. */
  confidence: number;
  source: "jsonld" | "microdata" | "heuristic";
}

export interface ExtractInput {
  subject?: string;
  html?: string;
  text?: string;
  /** From header, e.g. "Daraz <no-reply@daraz.com.np>". */
  from?: string;
  /** What a bare "Rs." means. Default "NPR". "₹"/"INR" are always INR. */
  rupee?: "NPR" | "INR";
}
