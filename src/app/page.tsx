import { RoomHome } from "@/components/room/RoomHome";
import { getRequestMessages } from "@/lib/server-locale";

export default async function Home() {
  const messages = await getRequestMessages();
  return <RoomHome messages={messages.room} />;
}
