"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MagicLinkStatus = "idle" | "sending" | "sent";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

export function LoginForm({
  initialError,
}: Readonly<{ initialError?: string }>) {
  const [email, setEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] =
    useState<MagicLinkStatus>("idle");
  const [googlePending, setGooglePending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? "Sign-in could not be completed. Please try again." : null
  );

  async function signInWithGoogle() {
    setGooglePending(true);
    setErrorMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/chat`,
      },
    });
    if (error) {
      setErrorMessage(error.message);
      setGooglePending(false);
    }
    // On success the browser navigates away to Google.
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setMagicLinkStatus("sending");
    setErrorMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat`,
      },
    });
    if (error) {
      setErrorMessage(error.message);
      setMagicLinkStatus("idle");
      return;
    }
    setMagicLinkStatus("sent");
  }

  if (magicLinkStatus === "sent") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <MailCheck className="mb-2 size-8 text-muted-foreground" />
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a magic link to <span className="font-medium">{email}</span>.
            Open it on this device to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setMagicLinkStatus("idle")}
          >
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Your portal account. AI-provider accounts are connected separately
          later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={signInWithGoogle}
          disabled={googlePending}
        >
          {googlePending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={magicLinkStatus === "sending"}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={magicLinkStatus === "sending"}
          >
            {magicLinkStatus === "sending" && (
              <Loader2 className="animate-spin" />
            )}
            Send magic link
          </Button>
        </form>

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
