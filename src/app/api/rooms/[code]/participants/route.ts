import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidRoomCode } from "@/lib/rooms/code";
import { broadcastRoomUpdate, findRoom, loadRoomState } from "@/lib/rooms/store";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 40;
const MAX_PARTICIPANTS = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  const name =
    typeof body?.name === "string"
      ? body.name.trim().slice(0, MAX_NAME_LENGTH)
      : "";
  if (name === "") {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const room = await findRoom(supabase, code);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { count, error: countError } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);
  if (countError) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_PARTICIPANTS) {
    return NextResponse.json({ error: "Room is full" }, { status: 409 });
  }

  // The first person through the door owns the room and defines the bill.
  const { error } = await supabase.from("participants").insert({
    room_id: room.id,
    name,
    is_owner: (count ?? 0) === 0,
  });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  await broadcastRoomUpdate(supabase, code);
  return NextResponse.json(await loadRoomState(supabase, room));
}
