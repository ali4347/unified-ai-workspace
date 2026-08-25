import { handleChatGptProxy } from "@/lib/providers/server/chatgpt";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handleChatGptProxy(request);
}
