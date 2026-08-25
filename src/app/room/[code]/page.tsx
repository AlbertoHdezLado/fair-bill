import { notFound } from "next/navigation";
import { RoomFlow } from "@/components/room/RoomFlow";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/rooms/code";
import { getRequestMessages } from "@/lib/server-locale";

export default async function RoomPage({
  params,
}: {
  readonly params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isValidRoomCode(code)) notFound();

  return (
    <main className="mx-auto flex h-[100svh] max-h-[100svh] min-h-0 w-full max-w-2xl flex-1 flex-col gap-6 overflow-hidden px-4 py-6">
      <RoomFlow
        code={normalizeRoomCode(code)}
        messages={await getRequestMessages()}
      />
    </main>
  );
}