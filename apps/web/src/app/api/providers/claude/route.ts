import { handleClaudeProxy } from "@/lib/providers/server/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handleClaudeProxy(request);
}
