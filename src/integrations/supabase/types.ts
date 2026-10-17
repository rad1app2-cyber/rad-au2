export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          active: boolean
          ai_name: string
          blocked_numbers: string[]
          created_at: string
          custom_rules: string
          employee_number: string | null
          greeting: string
          handoff_message: string
          id: string
          instance_name: string
          job: string
          last_digest_on: string | null
          persona: string
          status: string
          updated_at: string
          user_id: string
          whatsapp_number: string
        }
        Insert: {
          active?: boolean
          ai_name: string
          blocked_numbers?: string[]
          created_at?: string
          custom_rules?: string
          employee_number?: string | null
          greeting?: string
          handoff_message?: string
          id?: string
          instance_name: string
          job?: string
          last_digest_on?: string | null
          persona?: string
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_number: string
        }
        Update: {
          active?: boolean
          ai_name?: string
          blocked_numbers?: string[]
          created_at?: string
          custom_rules?: string
          employee_number?: string | null
          greeting?: string
          handoff_message?: string
          id?: string
          instance_name?: string
          job?: string
          last_digest_on?: string | null
          persona?: string
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          agent_id: string
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          notes: string
          property_ref: string
          reminded: boolean
          scheduled_at: string
          status: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          customer_name?: string
          customer_phone: string
          id?: string
          notes?: string
          property_ref?: string
          reminded?: boolean
          scheduled_at: string
          status?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          notes?: string
          property_ref?: string
          reminded?: boolean
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          page_access_token: string
          page_id: string
          page_name: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          page_access_token: string
          page_id: string
          page_name?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          agent_id: string | null
          company: string
          created_at: string
          current_request: Json
          email: string
          follow_up_at: string | null
          follow_up_note: string
          full_name: string
          id: string
          last_marketing_at: string | null
          last_message_at: string | null
          lead_status: string
          marketing_opt_in: boolean
          notes: string
          phone: string
          request_summary: string
          source: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          company?: string
          created_at?: string
          current_request?: Json
          email?: string
          follow_up_at?: string | null
          follow_up_note?: string
          full_name?: string
          id?: string
          last_marketing_at?: string | null
          last_message_at?: string | null
          lead_status?: string
          marketing_opt_in?: boolean
          notes?: string
          phone?: string
          request_summary?: string
          source?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          company?: string
          created_at?: string
          current_request?: Json
          email?: string
          follow_up_at?: string | null
          follow_up_note?: string
          full_name?: string
          id?: string
          last_marketing_at?: string | null
          last_message_at?: string | null
          lead_status?: string
          marketing_opt_in?: boolean
          notes?: string
          phone?: string
          request_summary?: string
          source?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          agent_id: string
          anon_key: string
          created_at: string
          id: string
          label: string
          project_url: string
          tables: string[]
          user_id: string
        }
        Insert: {
          agent_id: string
          anon_key: string
          created_at?: string
          id?: string
          label?: string
          project_url: string
          tables?: string[]
          user_id: string
        }
        Update: {
          agent_id?: string
          anon_key?: string
          created_at?: string
          id?: string
          label?: string
          project_url?: string
          tables?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          agent_id: string | null
          contact_id: string | null
          created_at: string
          currency: string
          expected_close_date: string | null
          id: string
          notes: string
          stage: string
          title: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          id?: string
          notes?: string
          stage?: string
          title?: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          id?: string
          notes?: string
          stage?: string
          title?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_archives: {
        Row: {
          agent_id: string
          created_at: string
          finalized: boolean
          id: string
          month: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          finalized?: boolean
          id?: string
          month: string
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          finalized?: boolean
          id?: string
          month?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estate_archives_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_deliveries: {
        Row: {
          agent_id: string
          created_at: string
          customer_phone: string
          error: string | null
          id: string
          property_id: string
          status: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          customer_phone: string
          error?: string | null
          id?: string
          property_id: string
          status?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          customer_phone?: string
          error?: string | null
          id?: string
          property_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "estate_deliveries_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estate_deliveries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "estate_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_events: {
        Row: {
          agent_id: string
          created_at: string
          customer_phone: string
          id: string
          kind: string
          payload: Json
          property_ref: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          customer_phone: string
          id?: string
          kind: string
          payload?: Json
          property_ref?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          customer_phone?: string
          id?: string
          kind?: string
          payload?: Json
          property_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estate_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_jobs: {
        Row: {
          agent_id: string
          last_error: string | null
          last_run_at: string | null
          lease_until: string | null
        }
        Insert: {
          agent_id: string
          last_error?: string | null
          last_run_at?: string | null
          lease_until?: string | null
        }
        Update: {
          agent_id?: string
          last_error?: string | null
          last_run_at?: string | null
          lease_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estate_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_properties: {
        Row: {
          agent_id: string
          area: string
          category: string
          changed_at: string
          currency: string
          description: string
          external_id: string
          first_seen_at: string
          furnished: boolean | null
          id: string
          photos: Json
          price: number | null
          raw: Json
          rooms: number | null
          seen_at: string
          source_id: string
          status: string
          title: string
          videos: Json
        }
        Insert: {
          agent_id: string
          area?: string
          category?: string
          changed_at?: string
          currency?: string
          description?: string
          external_id: string
          first_seen_at?: string
          furnished?: boolean | null
          id?: string
          photos?: Json
          price?: number | null
          raw?: Json
          rooms?: number | null
          seen_at?: string
          source_id: string
          status?: string
          title?: string
          videos?: Json
        }
        Update: {
          agent_id?: string
          area?: string
          category?: string
          changed_at?: string
          currency?: string
          description?: string
          external_id?: string
          first_seen_at?: string
          furnished?: boolean | null
          id?: string
          photos?: Json
          price?: number | null
          raw?: Json
          rooms?: number | null
          seen_at?: string
          source_id?: string
          status?: string
          title?: string
          videos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "estate_properties_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estate_properties_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "estate_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_sources: {
        Row: {
          agent_id: string
          created_at: string
          cursor_offset: number
          database_source_id: string | null
          enabled: boolean
          endpoint: string | null
          field_map: Json
          id: string
          kind: string
          label: string
          last_error: string | null
          last_synced_at: string | null
          sync_started_at: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          cursor_offset?: number
          database_source_id?: string | null
          enabled?: boolean
          endpoint?: string | null
          field_map?: Json
          id?: string
          kind?: string
          label: string
          last_error?: string | null
          last_synced_at?: string | null
          sync_started_at?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          cursor_offset?: number
          database_source_id?: string | null
          enabled?: boolean
          endpoint?: string | null
          field_map?: Json
          id?: string
          kind?: string
          label?: string
          last_error?: string | null
          last_synced_at?: string | null
          sync_started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estate_sources_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estate_sources_database_source_id_fkey"
            columns: ["database_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_stays: {
        Row: {
          agent_id: string
          created_at: string
          customer_phone: string
          ends_at: string
          id: string
          notes: string
          property_id: string
          starts_at: string
          status: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          customer_phone: string
          ends_at: string
          id?: string
          notes?: string
          property_id: string
          starts_at: string
          status?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          customer_phone?: string
          ends_at?: string
          id?: string
          notes?: string
          property_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "estate_stays_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estate_stays_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "estate_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_files: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          file_name: string
          id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          content?: string
          created_at?: string
          file_name: string
          id?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          file_name?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_files_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          remote_jid: string
          role: string
        }
        Insert: {
          agent_id: string
          content: string
          created_at?: string
          id?: string
          remote_jid: string
          role: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          remote_jid?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string
        }
        Relationships: []
      }
      sent_offers: {
        Row: {
          agent_id: string
          created_at: string
          customer_phone: string
          id: string
          offer_ref: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          customer_phone: string
          id?: string
          offer_ref: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          customer_phone?: string
          id?: string
          offer_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_offers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      estate_acquire_lease: { Args: { p_agent: string }; Returns: boolean }
      estate_reserve_marketing: {
        Args: { p_agent: string; p_phone: string; p_property: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
