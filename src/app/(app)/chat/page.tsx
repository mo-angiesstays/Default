import { getCurrentUser } from "@/lib/auth";
import { ChatView } from "./ChatView";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  return <ChatView viewer={user!} />;
}
