export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          bank_account_no: string | null
          bank_name: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          subtype: string
          system_key: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          bank_account_no?: string | null
          bank_name?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          subtype?: string
          system_key?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          bank_account_no?: string | null
          bank_name?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          subtype?: string
          system_key?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          details: Json | null
          id: number
          org_id: string
          user_id: string | null
          voucher_id: string | null
        }
        Insert: {
          action: string
          at?: string
          details?: Json | null
          id?: never
          org_id: string
          user_id?: string | null
          voucher_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          details?: Json | null
          id?: never
          org_id?: string
          user_id?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          entry_date: string
          id: number
          memo: string | null
          org_id: string
          party_id: string | null
          property_id: string | null
          voucher_id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          entry_date: string
          id?: never
          memo?: string | null
          org_id: string
          party_id?: string | null
          property_id?: string | null
          voucher_id: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          entry_date?: string
          id?: never
          memo?: string | null
          org_id?: string
          party_id?: string | null
          property_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_org_id_account_id_fkey"
            columns: ["org_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_org_id_party_id_fkey"
            columns: ["org_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties_overview"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_org_id_voucher_id_fkey"
            columns: ["org_id", "voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      leases: {
        Row: {
          created_at: string
          end_date: string | null
          ended_on: string | null
          id: string
          monthly_rent: number
          notes: string | null
          org_id: string
          party_id: string
          property_id: string
          rent_due_day: number
          security_deposit: number
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          ended_on?: string | null
          id?: string
          monthly_rent: number
          notes?: string | null
          org_id: string
          party_id: string
          property_id: string
          rent_due_day?: number
          security_deposit?: number
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          ended_on?: string | null
          id?: string
          monthly_rent?: number
          notes?: string | null
          org_id?: string
          party_id?: string
          property_id?: string
          rent_due_day?: number
          security_deposit?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_org_id_party_id_fkey"
            columns: ["org_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "leases_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "leases_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties_overview"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          fiscal_year_start_month: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          fiscal_year_start_month?: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          fiscal_year_start_month?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          address: string | null
          cnic: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          roles: string[]
        }
        Insert: {
          address?: string | null
          cnic?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          roles?: string[]
        }
        Update: {
          address?: string | null
          cnic?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "parties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area: number | null
          area_unit: string | null
          asking_price: number | null
          city: string | null
          code: string
          created_at: string
          for_sale: boolean
          id: string
          kind: Database["public"]["Enums"]["property_kind"]
          name: string | null
          notes: string | null
          org_id: string
        }
        Insert: {
          address?: string | null
          area?: number | null
          area_unit?: string | null
          asking_price?: number | null
          city?: string | null
          code: string
          created_at?: string
          for_sale?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["property_kind"]
          name?: string | null
          notes?: string | null
          org_id: string
        }
        Update: {
          address?: string | null
          area?: number | null
          area_unit?: string | null
          asking_price?: number | null
          city?: string | null
          code?: string
          created_at?: string
          for_sale?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["property_kind"]
          name?: string | null
          notes?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_sequences: {
        Row: {
          last: number
          org_id: string
          prefix: string
        }
        Insert: {
          last: number
          org_id: string
          prefix: string
        }
        Update: {
          last?: number
          org_id?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          lease_id: string | null
          memo: string | null
          number: string
          org_id: string
          party_id: string | null
          payload: Json | null
          property_id: string | null
          replaced_by_id: string | null
          reverses_id: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          lease_id?: string | null
          memo?: string | null
          number: string
          org_id: string
          party_id?: string | null
          payload?: Json | null
          property_id?: string | null
          replaced_by_id?: string | null
          reverses_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          lease_id?: string | null
          memo?: string | null
          number?: string
          org_id?: string
          party_id?: string | null
          payload?: Json | null
          property_id?: string | null
          replaced_by_id?: string | null
          reverses_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_org_id_lease_id_fkey"
            columns: ["org_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vouchers_org_id_party_id_fkey"
            columns: ["org_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vouchers_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vouchers_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties_overview"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vouchers_org_id_replaced_by_id_fkey"
            columns: ["org_id", "replaced_by_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vouchers_org_id_reverses_id_fkey"
            columns: ["org_id", "reverses_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
    }
    Views: {
      properties_overview: {
        Row: {
          address: string | null
          area: number | null
          area_unit: string | null
          asking_price: number | null
          city: string | null
          code: string | null
          created_at: string | null
          for_sale: boolean | null
          id: string | null
          kind: Database["public"]["Enums"]["property_kind"] | null
          name: string | null
          notes: string | null
          org_id: string | null
          status: Database["public"]["Enums"]["property_status"] | null
        }
        Insert: {
          address?: string | null
          area?: number | null
          area_unit?: string | null
          asking_price?: number | null
          city?: string | null
          code?: string | null
          created_at?: string | null
          for_sale?: boolean | null
          id?: string | null
          kind?: Database["public"]["Enums"]["property_kind"] | null
          name?: string | null
          notes?: string | null
          org_id?: string | null
          status?: never
        }
        Update: {
          address?: string | null
          area?: number | null
          area_unit?: string | null
          asking_price?: number | null
          city?: string | null
          code?: string | null
          created_at?: string | null
          for_sale?: boolean | null
          id?: string | null
          kind?: Database["public"]["Enums"]["property_kind"] | null
          name?: string | null
          notes?: string | null
          org_id?: string | null
          status?: never
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _acct: { Args: { p_key: string; p_org: string }; Returns: string }
      _amount: {
        Args: { k: string; p: Json; p_required?: boolean }
        Returns: number
      }
      _is_sold: { Args: { p_org: string; p_prop: string }; Returns: boolean }
      _line: {
        Args: {
          p_account: string
          p_credit: number
          p_debit: number
          p_memo?: string
          p_party?: string
          p_property?: string
          v: Database["public"]["Tables"]["vouchers"]["Row"]
        }
        Returns: undefined
      }
      _money_account: { Args: { p_id: string; p_org: string }; Returns: string }
      _new_voucher: {
        Args: {
          p_amount: number
          p_date: string
          p_lease: string
          p_memo: string
          p_org: string
          p_party: string
          p_payload: Json
          p_property: string
          p_reverses: string
          p_type: Database["public"]["Enums"]["voucher_type"]
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          lease_id: string | null
          memo: string | null
          number: string
          org_id: string
          party_id: string | null
          payload: Json | null
          property_id: string | null
          replaced_by_id: string | null
          reverses_id: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          type: Database["public"]["Enums"]["voucher_type"]
        }
        SetofOptions: {
          from: "*"
          to: "vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _uuid: {
        Args: { k: string; p: Json; p_required?: boolean }
        Returns: string
      }
      _voucher_prefix: {
        Args: { t: Database["public"]["Enums"]["voucher_type"] }
        Returns: string
      }
      accept_invitations: { Args: never; Returns: number }
      account_balances: {
        Args: { p_as_of?: string; p_org: string }
        Returns: {
          account_id: string
          balance: number
          code: string
          name: string
          subtype: string
          system_key: string
          type: Database["public"]["Enums"]["account_type"]
        }[]
      }
      account_ledger: {
        Args: { p_account: string; p_from: string; p_org: string; p_to: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          entry_date: string
          memo: string
          party_name: string
          property_code: string
          seq: number
          voucher_id: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }[]
      }
      add_category_account: {
        Args: { p_kind: string; p_name: string; p_org: string }
        Returns: string
      }
      add_money_account: {
        Args: {
          p_account_no?: string
          p_bank_name?: string
          p_kind: string
          p_name: string
          p_org: string
        }
        Returns: string
      }
      balance_sheet: {
        Args: { p_as_of?: string; p_org: string }
        Returns: Json
      }
      create_organization: {
        Args: {
          p_currency?: string
          p_fiscal_year_start_month?: number
          p_name: string
        }
        Returns: string
      }
      edit_voucher: {
        Args: { p_changes: Json; p_voucher: string }
        Returns: Json
      }
      has_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["member_role"][]
        }
        Returns: boolean
      }
      income_statement: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: Json
      }
      is_member: { Args: { p_org: string }; Returns: boolean }
      my_organizations: {
        Args: never
        Returns: {
          currency: string
          fiscal_year_start_month: number
          id: string
          name: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      org_members: {
        Args: { p_org: string }
        Returns: {
          email: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }[]
      }
      post_voucher: { Args: { p: Json; p_org: string }; Returns: Json }
      preview_edit: {
        Args: { p_changes: Json; p_voucher: string }
        Returns: Json
      }
      preview_voucher: { Args: { p: Json; p_org: string }; Returns: Json }
      property_status: {
        Args: { p_as_of?: string; p_org: string; p_prop: string }
        Returns: Database["public"]["Enums"]["property_status"]
      }
      property_summary: {
        Args: { p_org: string; p_property?: string }
        Returns: {
          asking_price: number
          code: string
          cost: number
          expenses: number
          for_sale: boolean
          kind: Database["public"]["Enums"]["property_kind"]
          name: string
          net_profit: number
          other_income: number
          property_id: string
          rent_income: number
          roi_pct: number
          sale_price: number
          status: Database["public"]["Enums"]["property_status"]
        }[]
      }
      require_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["member_role"][]
        }
        Returns: undefined
      }
      reverse_voucher: {
        Args: { p_reason?: string; p_voucher: string }
        Returns: Json
      }
      seed_chart_of_accounts: { Args: { p_org: string }; Returns: undefined }
      trial_balance: {
        Args: { p_as_of?: string; p_org: string }
        Returns: {
          code: string
          credit: number
          debit: number
          name: string
          type: Database["public"]["Enums"]["account_type"]
        }[]
      }
      voucher_detail: { Args: { p_voucher: string }; Returns: Json }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      member_role: "owner" | "accountant" | "viewer"
      property_kind:
        | "house"
        | "apartment"
        | "shop"
        | "plot"
        | "office"
        | "other"
      property_status: "vacant" | "rented" | "under_agreement" | "sold"
      voucher_status: "posted" | "reversed"
      voucher_type:
        | "purchase"
        | "property_cost"
        | "pay_seller"
        | "buyer_advance"
        | "sale"
        | "receive_buyer"
        | "rent"
        | "deposit"
        | "expense"
        | "income"
        | "transfer"
        | "capital"
        | "drawing"
        | "opening"
        | "journal"
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
    Enums: {
      account_type: ["asset", "liability", "equity", "income", "expense"],
      member_role: ["owner", "accountant", "viewer"],
      property_kind: ["house", "apartment", "shop", "plot", "office", "other"],
      property_status: ["vacant", "rented", "under_agreement", "sold"],
      voucher_status: ["posted", "reversed"],
      voucher_type: [
        "purchase",
        "property_cost",
        "pay_seller",
        "buyer_advance",
        "sale",
        "receive_buyer",
        "rent",
        "deposit",
        "expense",
        "income",
        "transfer",
        "capital",
        "drawing",
        "opening",
        "journal",
      ],
    },
  },
} as const

