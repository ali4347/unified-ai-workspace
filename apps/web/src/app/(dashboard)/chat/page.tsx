import { ChatView } from "@/components/chat/chat-view";

export const metadata = {
  title: "Chat",
};

/**
 * Milestone 2: live Core UI on mock providers. Conversations persist from
 * Milestone 3; the real adapter registry replaces the mock engine at
 * Milestone 4 (PRD §60).
 */
export default function ChatPage() {
  return <ChatView />;
}
