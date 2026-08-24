import { Settings2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Shown instead of the login form until Supabase env vars are provided. */
export function SetupNotice() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <CardTitle>Almost there — connect Supabase</CardTitle>
        </div>
        <CardDescription>
          The app is running, but it is not connected to a Supabase project
          yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <ol className="list-decimal space-y-2 pl-4">
          <li>
            Create a project at{" "}
            <span className="font-mono text-foreground">database.new</span>
          </li>
          <li>
            Run the SQL in{" "}
            <span className="font-mono text-foreground">
              supabase/migrations/
            </span>{" "}
            via the SQL Editor
          </li>
          <li>
            Copy{" "}
            <span className="font-mono text-foreground">
              apps/web/.env.example
            </span>{" "}
            to <span className="font-mono text-foreground">.env.local</span>{" "}
            and fill in the project URL and anon key
          </li>
          <li>Restart the dev server</li>
        </ol>
        <p className="mt-4">
          Full instructions are in the README under “Getting started”.
        </p>
      </CardContent>
    </Card>
  );
}
