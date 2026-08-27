import type {
  IntegrationStatus,
  MessageRole,
  MessageStatus,
  ProviderConnectionState,
  ProviderSlug,
} from "@uaw/types";

/**
 * Hand-written database types mirroring supabase/migrations (kept minimal:
 * only tables the app queries today get full Insert/Update shapes). Replace
 * with `supabase gen types` output if drift ever becomes a problem.
 */

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ProviderRow = {
  id: string;
  slug: ProviderSlug;
  name: string;
  icon_url: string | null;
  integration_type: IntegrationStatus;
  status: "active" | "phase2" | "disabled";
  sort_order: number;
  created_at: string;
}

export type ModelRow = {
  id: string;
  provider_id: string;
  external_id: string;
  name: string;
  display_name: string | null;
  capabilities: Json;
  status: "active" | "disabled";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ConnectedAccountRow = {
  id: string;
  user_id: string;
  provider_id: string;
  email: string | null;
  display_name: string | null;
  subscription_label: string | null;
  status: ProviderConnectionState;
  metadata: Json;
  last_connected_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  custom_instructions: string | null;
  default_provider_id: string | null;
  default_model_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  summary: string | null;
  active_provider_id: string | null;
  active_model_id: string | null;
  active_account_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  provider_id: string | null;
  model_id: string | null;
  account_id: string | null;
  status: MessageStatus;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export type ProviderEventRow = {
  id: string;
  user_id: string;
  provider_id: string | null;
  account_id: string | null;
  conversation_id: string | null;
  event_type: string;
  metadata: Json;
  created_at: string;
}

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

type ReadonlyTable<Row> = Table<Row, never, never>;

export type Database = {
  public: {
    Tables: {
      providers: ReadonlyTable<ProviderRow>;
      models: ReadonlyTable<ModelRow>;
      profiles: Table<
        ProfileRow,
        { id: string } & Partial<Omit<ProfileRow, "id">>,
        Partial<Omit<ProfileRow, "id">>
      >;
      connected_accounts: Table<
        ConnectedAccountRow,
        {
          user_id: string;
          provider_id: string;
        } & Partial<
          Omit<ConnectedAccountRow, "user_id" | "provider_id" | "created_at" | "updated_at">
        >,
        Partial<Omit<ConnectedAccountRow, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      projects: Table<
        ProjectRow,
        { user_id: string; name: string } & Partial<
          Omit<ProjectRow, "user_id" | "name" | "created_at" | "updated_at">
        >,
        Partial<Omit<ProjectRow, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      conversations: Table<
        ConversationRow,
        { user_id: string } & Partial<
          Omit<ConversationRow, "user_id" | "created_at" | "updated_at">
        >,
        // updated_at is allowed so mutations can "touch" recency; the DB
        // trigger overwrites it with now() regardless.
        Partial<Omit<ConversationRow, "id" | "user_id" | "created_at">>
      >;
      messages: Table<
        MessageRow,
        {
          conversation_id: string;
          user_id: string;
          role: MessageRole;
          content: string;
        } & Partial<
          Omit<
            MessageRow,
            "conversation_id" | "user_id" | "role" | "content" | "created_at" | "updated_at"
          >
        >,
        Partial<Omit<MessageRow, "id" | "conversation_id" | "user_id" | "created_at" | "updated_at">>
      >;
      provider_events: Table<
        ProviderEventRow,
        { user_id: string; event_type: string } & Partial<
          Omit<ProviderEventRow, "user_id" | "event_type" | "created_at">
        >,
        never
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
