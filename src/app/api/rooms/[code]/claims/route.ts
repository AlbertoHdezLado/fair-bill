import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidRoomCode } from "@/lib/rooms/code";
import { broadcastRoomUpdate, findRoom, loadRoomState } from "@/lib/rooms/store";

export const runtime = "nodejs";

interface ClaimPayload {
  itemId?: unknown;
  ownerId?: unknown;
  participantIds?: unknown;
  units?: unknown;
  groupIds?: unknown;
}

/**
 * Applies one person's choice on one line. A shared choice is stored once per
 * member of the group, all of them tagged with the same owner, so only its
 * author can later change or drop it. `units` of null removes the choice.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as ClaimPayload | null;
  const itemId = asUuid(body?.itemId);
  const ownerId = asUuid(body?.ownerId);
  const participantIds = asUuidList(body?.participantIds);
  const groupIds = asUuidList(body?.groupIds) ?? [];
  const units =
    body?.units === null
      ? null
      : typeof body?.units === "number" && Number.isFinite(body.units)
        ? Math.max(0, body.units)
        : undefined;

  if (!itemId || !ownerId || !participantIds || units === undefined) {
    return NextResponse.json({ error: "Invalid claim" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const room = await findRoom(supabase, code);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // The owner's previous choice is replaced wholesale, so the group it used to
  // cover is cleared first and only the new members are written back.
  const { error: deleteError } = await supabase
    .from("claims")
    .delete()
    .eq("room_id", room.id)
    .eq("item_id", itemId)
    .eq("owner_id", ownerId);
  if (deleteError) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  if (units !== null && participantIds.length > 0) {
    const { error: insertError } = await supabase.from("claims").insert(
      participantIds.map((participantId) => ({
        room_id: room.id,
        item_id: itemId,
        participant_id: participantId,
        owner_id: ownerId,
        units,
        group_ids: groupIds,
      })),
    );
    if (insertError) {
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
  }

  await broadcastRoomUpdate(supabase, code);
  return NextResponse.json(await loadRoomState(supabase, room));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function asUuidList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const entry of value) {
    const id = asUuid(entry);
    if (!id) return null;
    ids.push(id);
  }
  return ids;
}
