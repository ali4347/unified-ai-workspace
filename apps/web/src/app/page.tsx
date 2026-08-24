import { redirect } from "next/navigation";

// The middleware bounces unauthenticated users to /login.
export default function Home() {
  redirect("/chat");
}
