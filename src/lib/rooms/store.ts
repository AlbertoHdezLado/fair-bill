import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ROOM_UPDATED_EVENT,
  roomChannelName,
} from "@/lib/supabase/realtime";
import { EMPTY_EXTRAS } from "@/lib/receipt/editable";
import { normalizeRoomCode } from "./code";
import type { RoomState } from "./types";

interface RoomRow {
  id: string;
  code: string;
  tax_cents: number;
  tip_cents: number;
  service_cents: number;
  discount_cents: number;
  detected_total_cents: number | null;
}

export async function findRoom(
  supabase: SupabaseClient,
  code: string,
): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      "id, code, tax_cents, tip_cents, service_cents, discount_cents, detected_total_cents",
    )
    .eq("code", normalizeRoomCode(code))
    .maybeSingle<RoomRow>();

  if (error) throw new Error(error.message);
  return data;
}

export async function loadRoomState(
  supabase: SupabaseClient,
  room: RoomRow,
): Promise<RoomState> {
  const [participants, items, claims] = await Promise.all([
    supabase
      .from("participants")
      .select("id, name, is_owner")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("items")
      .select("id, name, quantity, unit_price_cents, edited")
      .eq("room_id", room.id)
      .order("position", { ascending: true }),
    supabase
      .from("claims")
      .select("item_id, participant_id, owner_id, units, group_ids")
      .eq("room_id", room.id),
  ]);

  const failure = participants.error ?? items.error ?? claims.error;
  if (failure) throw new Error(failure.message);

  return {
    code: room.code,
    participants: (participants.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      isOwner: row.is_owner as boolean,
    })),
    items: (items.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      quantity: Number(row.quantity),
      unitPriceCents: row.unit_price_cents as number,
      state: (row.edited as boolean) ? "editado" : "leido",
    })),
    extras: {
      ...EMPTY_EXTRAS,
      taxCents: room.tax_cents,
      tipCents: room.tip_cents,
      serviceCents: room.service_cents,
      discountCents: room.discount_cents,
      detectedTotalCents: room.detected_total_cents,
    },
    claims: (claims.data ?? []).map((row) => ({
      itemId: row.item_id as string,
      participantId: row.participant_id as string,
      ownerId: row.owner_id as string,
      units: Number(row.units),
      groupIds: (row.group_ids as string[]) ?? [],
    })),
  };
}

/**
 * Tells everyone in the room that something changed. Clients only listen; the
 * payload is deliberately empty so a stale listener can never inject state.
 */
export async function broadcastRoomUpdate(
  supabase: SupabaseClient,
  code: string,
): Promise<void> {
  const channel = supabase.channel(roomChannelName(code));
  try {
    await channel.send({
      type: "broadcast",
      event: ROOM_UPDATED_EVENT,
      payload: {},
    });
  } finally {
    await supabase.removeChannel(channel);
  }
}
