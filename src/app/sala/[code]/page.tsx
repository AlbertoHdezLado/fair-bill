import { notFound } from "next/navigation";
import { RoomFlow } from "@/components/room/RoomFlow";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/rooms/code";
import { getRequestMessages } from "@/lib/server-locale";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isValidRoomCode(code)) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <RoomFlow
        code={normalizeRoomCode(code)}
        messages={await getRequestMessages()}
      />
    </div>
  );
}
