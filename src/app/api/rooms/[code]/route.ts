import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidRoomCode } from "@/lib/rooms/code";
import {
  broadcastRoomUpdate,
  findRoom,
  loadRoomState,
} from "@/lib/rooms/store";
import { MAX_PRODUCT_NAME_LENGTH } from "@/lib/input-limits";

export const runtime = "nodejs";

const MAX_ITEMS = 200;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const room = await findRoom(supabase, code);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(await loadRoomState(supabase, room));
}

interface BillPayload {
  items?: unknown;
  extras?: unknown;
}

interface IncomingItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  edited: boolean;
}

/** Replaces the whole bill: used after a scan and on every manual edit. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as BillPayload | null;
  const items = parseItems(body?.items);
  const extras = parseExtras(body?.extras);
  if (!items || !extras) {
    return NextResponse.json({ error: "Invalid bill" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const room = await findRoom(supabase, code);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const saveExtras = async (payload: Record<string, unknown>) =>
    supabase.from("rooms").update(payload).eq("id", room.id);

  const { error: extrasError } = await saveExtras(extras);
  if (extrasError) {
    if (
      // 42703: Postgres undefined_column. PGRST204: PostgREST's schema cache
      // hasn't picked up the column yet (e.g. right after a migration).
      (extrasError.code === "42703" || extrasError.code === "PGRST204") &&
      /(merchant_name|receipt_header)/.test(extrasError.message ?? "")
    ) {
      const fallbackExtras = Object.fromEntries(
        Object.entries(extras).filter(
          ([key]) => key !== "merchant_name" && key !== "receipt_header",
        ),
      );
      const { error: fallbackError } = await saveExtras(fallbackExtras);
      if (fallbackError) {
        return NextResponse.json({ error: "Could not save" }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
  }

  // Claims cascade from items, so replacing the list also clears the shares of
  // any line that no longer exists.
  const { error: deleteError } = await supabase
    .from("items")
    .delete()
    .eq("room_id", room.id);
  if (deleteError) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  if (items.length > 0) {
    const { error: insertError } = await supabase.from("items").insert(
      items.map((item, position) => ({
        room_id: room.id,
        name: item.name,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        edited: item.edited,
        position,
      })),
    );
    if (insertError) {
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
  }

  await broadcastRoomUpdate(supabase, code);
  return NextResponse.json(await loadRoomState(supabase, room));
}

function parseItems(value: unknown): IncomingItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;

  const items: IncomingItem[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : null;
    const quantity = toFiniteNumber(item.quantity);
    const unitPriceCents = toFiniteNumber(item.unitPriceCents);
    if (name === null || quantity === null || unitPriceCents === null) {
      return null;
    }
    items.push({
      name: name.slice(0, MAX_PRODUCT_NAME_LENGTH),
      quantity: Math.max(0, quantity),
      unitPriceCents: Math.max(0, Math.round(unitPriceCents)),
      edited: item.state === "editado",
    });
  }
  return items;
}

function parseExtras(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const extras = value as Record<string, unknown>;

  const taxCents = toFiniteNumber(extras.taxCents);
  const tipCents = toFiniteNumber(extras.tipCents);
  const serviceCents = toFiniteNumber(extras.serviceCents);
  const discountCents = toFiniteNumber(extras.discountCents);
  if (
    taxCents === null ||
    tipCents === null ||
    serviceCents === null ||
    discountCents === null
  ) {
    return null;
  }

  const detectedTotalCents = toFiniteNumber(extras.detectedTotalCents);
  const header = parseHeader(extras.receiptHeader);
  const merchantName = parseMerchantName(extras.merchantName, header);

  return {
    merchant_name: merchantName,
    receipt_header: header,
    tax_cents: Math.round(taxCents),
    tip_cents: Math.round(tipCents),
    service_cents: Math.round(serviceCents),
    discount_cents: Math.round(discountCents),
    detected_total_cents:
      detectedTotalCents === null ? null : Math.round(detectedTotalCents),
  };
}

function parseMerchantName(value: unknown, header: string[]): string {
  const headerValue =
    typeof value === "string" ? value.trim() : header[0]?.trim() ?? "";
  return headerValue.slice(0, 120);
}

function parseHeader(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
