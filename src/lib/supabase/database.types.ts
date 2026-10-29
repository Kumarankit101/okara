export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          onboarding_complete: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          onboarding_complete?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          onboarding_complete?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_profiles: {
        Row: {
          id: string;
          user_id: string;
          handle: string | null;
          normalized_handle: string | null;
          display_name: string;
          x_user_id: string | null;
          source_type: Database["public"]["Enums"]["voice_source_type"];
          style_profile_json: Json;
          style_profile_version: number;
          last_synced_at: string | null;
          source_expires_at: string | null;
          status: Database["public"]["Enums"]["voice_profile_status"];
          error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          handle?: string | null;
          normalized_handle?: never;
          display_name: string;
          x_user_id?: string | null;
          source_type: Database["public"]["Enums"]["voice_source_type"];
          style_profile_json?: Json;
          style_profile_version?: number;
          last_synced_at?: string | null;
          source_expires_at?: string | null;
          status?: Database["public"]["Enums"]["voice_profile_status"];
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          handle?: string | null;
          display_name?: string;
          x_user_id?: string | null;
          source_type?: Database["public"]["Enums"]["voice_source_type"];
          style_profile_json?: Json;
          style_profile_version?: number;
          last_synced_at?: string | null;
          source_expires_at?: string | null;
          status?: Database["public"]["Enums"]["voice_profile_status"];
          error_code?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      source_posts: {
        Row: {
          id: string;
          user_id: string;
          voice_profile_id: string;
          x_post_id: string | null;
          text: string;
          source_order: number;
          posted_at: string | null;
          fetched_at: string;
          expires_at: string;
          source_metadata_json: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          voice_profile_id: string;
          x_post_id?: string | null;
          text: string;
          source_order?: number;
          posted_at?: string | null;
          fetched_at?: string;
          expires_at?: string;
          source_metadata_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          x_post_id?: string | null;
          text?: string;
          source_order?: number;
          posted_at?: string | null;
          fetched_at?: string;
          expires_at?: string;
          source_metadata_json?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_posts_voice_profile_user_fk";
            columns: ["voice_profile_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "voice_profiles";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      generation_runs: {
        Row: {
          id: string;
          user_id: string;
          voice_profile_id: string;
          brief: string;
          constraints_json: Json;
          model: string;
          prompt_version: string;
          idempotency_key: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          latency_ms: number | null;
          status: Database["public"]["Enums"]["generation_status"];
          error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          voice_profile_id: string;
          brief: string;
          constraints_json?: Json;
          model: string;
          prompt_version: string;
          idempotency_key?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          latency_ms?: number | null;
          status?: Database["public"]["Enums"]["generation_status"];
          error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          brief?: string;
          constraints_json?: Json;
          model?: string;
          prompt_version?: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          latency_ms?: number | null;
          status?: Database["public"]["Enums"]["generation_status"];
          error_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_runs_voice_profile_user_fk";
            columns: ["voice_profile_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "voice_profiles";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      drafts: {
        Row: {
          id: string;
          user_id: string;
          generation_run_id: string;
          text: string;
          angle: string;
          position: number;
          style_note: string;
          character_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          generation_run_id: string;
          text: string;
          angle: string;
          position: number;
          style_note: string;
          character_count?: never;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          text?: string;
          angle?: string;
          position?: number;
          style_note?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drafts_generation_run_user_fk";
            columns: ["generation_run_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      feedback_events: {
        Row: {
          id: string;
          user_id: string;
          voice_profile_id: string;
          draft_id: string;
          event_type: Database["public"]["Enums"]["feedback_event_type"];
          reason_code: Database["public"]["Enums"]["feedback_reason_code"] | null;
          edited_text: string | null;
          metadata_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          voice_profile_id: string;
          draft_id: string;
          event_type: Database["public"]["Enums"]["feedback_event_type"];
          reason_code?: Database["public"]["Enums"]["feedback_reason_code"] | null;
          edited_text?: string | null;
          metadata_json?: Json;
          created_at?: string;
        };
        Update: {
          event_type?: Database["public"]["Enums"]["feedback_event_type"];
          reason_code?: Database["public"]["Enums"]["feedback_reason_code"] | null;
          edited_text?: string | null;
          metadata_json?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_events_voice_profile_user_fk";
            columns: ["voice_profile_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "voice_profiles";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "feedback_events_draft_user_fk";
            columns: ["draft_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "drafts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      preference_memories: {
        Row: {
          id: string;
          user_id: string;
          voice_profile_id: string;
          kind: Database["public"]["Enums"]["preference_memory_kind"];
          content_json: Json;
          source_feedback_event_id: string | null;
          weight: number;
          embedding: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          voice_profile_id: string;
          kind: Database["public"]["Enums"]["preference_memory_kind"];
          content_json: Json;
          source_feedback_event_id?: string | null;
          weight?: number;
          embedding?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: Database["public"]["Enums"]["preference_memory_kind"];
          content_json?: Json;
          source_feedback_event_id?: string | null;
          weight?: number;
          embedding?: string | null;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preference_memories_voice_profile_user_fk";
            columns: ["voice_profile_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "voice_profiles";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "preference_memories_feedback_user_fk";
            columns: ["source_feedback_event_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "feedback_events";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      usage_events: {
        Row: {
          id: string;
          user_id: string;
          provider: Database["public"]["Enums"]["usage_provider"];
          operation: string;
          units: number;
          estimated_cost_usd: number;
          request_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: Database["public"]["Enums"]["usage_provider"];
          operation: string;
          units: number;
          estimated_cost_usd?: number;
          request_id?: string | null;
          created_at?: string;
        };
        Update: {
          provider?: Database["public"]["Enums"]["usage_provider"];
          operation?: string;
          units?: number;
          estimated_cost_usd?: number;
          request_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      delete_expired_source_posts: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: {
      voice_source_type: "x_api" | "pasted";
      voice_profile_status: "syncing" | "ready" | "failed" | "deleted";
      generation_status: "pending" | "completed" | "failed";
      feedback_event_type:
        | "selected"
        | "copied"
        | "saved"
        | "liked"
        | "disliked"
        | "edited"
        | "dismissed";
      feedback_reason_code:
        | "too_generic"
        | "too_long"
        | "wrong_tone"
        | "repetitive"
        | "inaccurate"
        | "too_promotional"
        | "other";
      preference_memory_kind:
        | "positive_example"
        | "negative_rule"
        | "edit_pattern"
        | "aggregate_summary";
      usage_provider: "x" | "openai";
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    ? (PublicSchema["Tables"] & PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName] extends { Insert: infer I } ? I : never;

export type TablesUpdate<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName] extends { Update: infer U } ? U : never;

export type Enums<EnumName extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][EnumName];
