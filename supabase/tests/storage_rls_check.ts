/**
 * Storage authorization E2E check — private `attachments` bucket (PRD §33).
 *
 * WHY THIS EXISTS: Supabase forbids direct SQL mutation of storage tables
 * ("Direct deletion from storage tables is not allowed. Use the Storage API
 * instead.") because Storage metadata and the physical object store must stay
 * synchronized. So the SQL suite (rls_checks.sql) treats storage as read-only
 * and THIS script exercises the real authorization surface: the Storage API,
 * called with REAL user JWTs so RLS is genuinely evaluated. The service-role
 * key is never used — not for assertions, not for cleanup.
 *
 * WHAT IT PROVES (all against bucket `attachments`, paths `{uid}/rls-e2e/…`):
 *   own-path:   A upload ✔ · A download ✔ · A replace ✔ · A delete ✔
 *   cross-user: A download B's object ✘ · A replace it ✘ (B's content intact)
 *               A delete it ✘ (B still sees it) · A upload into B's path ✘
 *
 * Negative checks NEVER trust the error object alone: the Storage API can
 * report "success with nothing done" when RLS filters silently (remove() of an
 * invisible object), so every denial is re-verified from B's side.
 *
 * MANUAL / E2E HARNESS — credentials are provided by the operator at run time
 * and are never written to disk or committed. Two ways to supply the two
 * authenticated sessions (see supabase/tests/README.md for the full guide):
 *
 *   1) Temporary email+password test users (recommended; create two throwaway
 *      users in Dashboard → Authentication, delete them afterwards):
 *        UAW_TEST_EMAIL_A=… UAW_TEST_PASSWORD_A=…
 *        UAW_TEST_EMAIL_B=… UAW_TEST_PASSWORD_B=…
 *   2) Pre-minted user access tokens (JWTs) from two signed-in sessions:
 *        UAW_TEST_JWT_A=… UAW_TEST_JWT_B=…
 *
 * Project URL + anon key come from UAW_SUPABASE_URL / UAW_SUPABASE_ANON_KEY,
 * falling back to NEXT_PUBLIC_* values in apps/web/.env.local (public values).
 *
 * Run from the repo root:   npx -y tsx supabase/tests/storage_rls_check.ts
 *
 * Cleanup runs in `finally` through the Storage API: each user removes every
 * object under their own unique `{uid}/rls-e2e/{runId}/` prefix, and the
 * cleanup result is reported separately from the test verdict. The run id is
 * unique per invocation, so no production object path is ever reused.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Resolve @supabase/supabase-js from apps/web (pnpm keeps workspace deps
// package-local; this script deliberately has no dependencies of its own).
const requireFromWeb = createRequire(
  new URL("../../apps/web/package.json", import.meta.url)
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { createClient } = requireFromWeb("@supabase/supabase-js") as any;

const BUCKET = "attachments";
const RUN_ID = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Config (no secrets are ever printed or persisted)
// ---------------------------------------------------------------------------

function envLocal(name: string): string | undefined {
  try {
    const file = readFileSync(
      new URL("../../apps/web/.env.local", import.meta.url),
      "utf8"
    );
    const line = file
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

const SUPABASE_URL =
  process.env.UAW_SUPABASE_URL ?? envLocal("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY =
  process.env.UAW_SUPABASE_ANON_KEY ?? envLocal("NEXT_PUBLIC_SUPABASE_ANON_KEY");

function usage(reason: string): never {
  console.error(`SETUP: ${reason}

This is a manual E2E harness — it needs two REAL authenticated users so RLS is
genuinely exercised. Provide, via environment variables only (never files):

  Option 1 (recommended): two throwaway email+password users
    UAW_TEST_EMAIL_A / UAW_TEST_PASSWORD_A
    UAW_TEST_EMAIL_B / UAW_TEST_PASSWORD_B
    (Dashboard -> Authentication -> Add user; delete both afterwards.)

  Option 2: two pre-minted user access tokens (short-lived JWTs)
    UAW_TEST_JWT_A / UAW_TEST_JWT_B

Never use the service-role key here, and never commit any credential.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Result collection: hard checks vs cleanup, reported separately
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];
const cleanupNotes: string[] = [];

function check(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Session setup
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

async function makeUser(which: "A" | "B"): Promise<{ client: Client; uid: string }> {
  const email = process.env[`UAW_TEST_EMAIL_${which}`];
  const password = process.env[`UAW_TEST_PASSWORD_${which}`];
  const jwt = process.env[`UAW_TEST_JWT_${which}`];

  let client: Client;
  if (email && password) {
    client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) usage(`sign-in failed for user ${which}: ${error.message}`);
  } else if (jwt) {
    client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  } else {
    usage(`no credentials for user ${which}`);
  }

  const { data, error } = await client.auth.getUser(jwt);
  const uid: string | undefined = data?.user?.id;
  if (error || !uid) usage(`could not resolve user ${which}'s id from the session`);
  return { client, uid: uid as string };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!SUPABASE_URL || !ANON_KEY) {
    usage("missing UAW_SUPABASE_URL / UAW_SUPABASE_ANON_KEY (or apps/web/.env.local)");
  }

  console.log(`Storage authorization check — bucket "${BUCKET}", run ${RUN_ID}`);
  const a = await makeUser("A");
  const b = await makeUser("B");
  if (a.uid === b.uid) usage("users A and B resolve to the SAME account — provide two distinct users");

  const prefix = (uid: string) => `${uid}/rls-e2e/${RUN_ID}`;
  const aMain = `${prefix(a.uid)}/a-main.txt`;
  const aTemp = `${prefix(a.uid)}/a-delete-me.txt`;
  const bMain = `${prefix(b.uid)}/b-main.txt`;
  const bPlanted = `${prefix(b.uid)}/planted-by-a.txt`;
  const body = (s: string) => new Blob([s], { type: "text/plain" });
  const text = async (blob: Blob | null) => (blob ? await blob.text() : null);

  try {
    // ---- own-path matrix (user A) ------------------------------------------
    const up1 = await a.client.storage.from(BUCKET).upload(aMain, body("A v1"));
    check(!up1.error, "storage-api/upload-own: A can upload to their own path");

    const dl1 = await a.client.storage.from(BUCKET).download(aMain);
    check(
      !dl1.error && (await text(dl1.data)) === "A v1",
      "storage-api/download-own: A can read back their own object"
    );

    const up2 = await a.client.storage
      .from(BUCKET)
      .upload(aMain, body("A v2"), { upsert: true });
    const dl2 = await a.client.storage.from(BUCKET).download(aMain);
    check(
      !up2.error && (await text(dl2.data)) === "A v2",
      "storage-api/replace-own: A can replace their own object (content verified)"
    );

    const up3 = await a.client.storage.from(BUCKET).upload(aTemp, body("temp"));
    const rm1 = await a.client.storage.from(BUCKET).remove([aTemp]);
    const dl3 = await a.client.storage.from(BUCKET).download(aTemp);
    check(
      !up3.error && !rm1.error && (rm1.data?.length ?? 0) === 1 && !!dl3.error,
      "storage-api/delete-own: A can delete their own object (verified gone)"
    );

    // ---- cross-user matrix (B's object, attacked by A) ---------------------
    const upB = await b.client.storage.from(BUCKET).upload(bMain, body("B v1"));
    check(!upB.error, "storage-api/upload-own-b: B can upload to their own path (cross-user fixture)");

    const xRead = await a.client.storage.from(BUCKET).download(bMain);
    check(!!xRead.error, "storage-api/download-other: A cannot download B's object");

    const xReplace = await a.client.storage
      .from(BUCKET)
      .upload(bMain, body("tampered by A"), { upsert: true });
    const bView1 = await b.client.storage.from(BUCKET).download(bMain);
    check(
      !!xReplace.error && (await text(bView1.data)) === "B v1",
      "storage-api/replace-other: A cannot replace B's object (B's content verified intact)"
    );

    // remove() can report success while RLS silently filters — the real
    // assertion is that B still sees the object afterwards.
    await a.client.storage.from(BUCKET).remove([bMain]);
    const bView2 = await b.client.storage.from(BUCKET).download(bMain);
    check(
      !bView2.error && (await text(bView2.data)) === "B v1",
      "storage-api/delete-other: A cannot delete B's object (B still sees it)"
    );

    const xPlant = await a.client.storage.from(BUCKET).upload(bPlanted, body("planted"));
    const bList = await b.client.storage.from(BUCKET).list(prefix(b.uid));
    const planted = (bList.data ?? []).some(
      (o: { name: string }) => o.name === "planted-by-a.txt"
    );
    check(
      !!xPlant.error && !planted,
      "storage-api/upload-other-path: A cannot upload into B's ownership path (B's prefix verified clean)"
    );
  } finally {
    // ---- cleanup through the Storage API, each user for their own prefix ---
    for (const user of [a, b]) {
      try {
        const list = await user.client.storage.from(BUCKET).list(prefix(user.uid));
        const names = (list.data ?? []).map(
          (o: { name: string }) => `${prefix(user.uid)}/${o.name}`
        );
        if (names.length > 0) {
          const rm = await user.client.storage.from(BUCKET).remove(names);
          cleanupNotes.push(
            rm.error
              ? `CLEANUP FAIL (${user.uid.slice(0, 8)}…): ${rm.error.message}`
              : `cleanup ok (${user.uid.slice(0, 8)}…): removed ${rm.data?.length ?? 0} object(s)`
          );
        } else {
          cleanupNotes.push(`cleanup ok (${user.uid.slice(0, 8)}…): nothing to remove`);
        }
        const after = await user.client.storage.from(BUCKET).list(prefix(user.uid));
        if ((after.data ?? []).length > 0) {
          cleanupNotes.push(
            `CLEANUP FAIL (${user.uid.slice(0, 8)}…): ${after.data.length} object(s) remain under ${prefix(user.uid)}`
          );
        }
      } catch (error) {
        cleanupNotes.push(
          `CLEANUP FAIL (${user.uid.slice(0, 8)}…): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  console.log("\n--- cleanup (reported separately from the verdict) ---");
  for (const note of cleanupNotes) console.log(`  ${note}`);

  console.log("\n--- verdict ---");
  const total = passed + failures.length;
  if (failures.length === 0) {
    console.log(`Storage authorization checks passed: ${passed}/${total}`);
  } else {
    console.log(`FAILED: ${failures.length}/${total} check(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
  if (cleanupNotes.some((n) => n.startsWith("CLEANUP FAIL"))) {
    console.log("Cleanup reported failures — remove leftover objects under the run prefix manually (Storage UI).");
    process.exitCode = process.exitCode || 1;
  }
}

main().catch((error) => {
  console.error("HARNESS ERROR:", error instanceof Error ? error.message : error);
  process.exit(2);
});
