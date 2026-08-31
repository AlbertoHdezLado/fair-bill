// Unified schema returned by the hybrid AI/OCR ticket analysis pipeline.
// Amounts are decimal currency units (e.g. 12.5), not cents, to match the
// AI JSON contract these fields are validated against.

export interface TicketAnalysisItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export type TicketAnalysisSource = "ai" | "fallback_ocr";

export interface TicketAnalysisResult {
  merchant_name: string | null;
  ticket_number: string | null;
  currency: string;
  items: TicketAnalysisItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  detected_at: string;
  confidence: number;
  source: TicketAnalysisSource;
}

/** Reasons a fallback to OCR parsing was triggered, for structured logging. */
export type FallbackReason =
  | "ai_unavailable"
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "json_error"
  | "schema_error"
  | "network_error";
