import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/rooms/code";

export const runtime = "nodejs";

const MAX_CODE_ATTEMPTS = 5;

export async function POST() {
  const supabase = createServiceClient();

  // The unique index on `code` is the real guard against collisions; retry a
  // few times before giving up rather than pre-checking for existence.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code })
      .select("code")
      .maybeSingle<{ code: string }>();

    if (!error && data) return NextResponse.json({ code: data.code });
    if (error?.code !== "23505") {
      return NextResponse.json(
        { error: "Could not create the room" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "Could not create the room" },
    { status: 503 },
  );
}
