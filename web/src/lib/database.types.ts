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
      documents: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          file_name: string
          holding_id: string | null
          id: string
          lease_id: string | null
          mime_type: string
          org_id: string
          party_id: string | null
          property_id: string | null
          size_bytes: number
          storage_path: string
          title: string
          uploaded_by: string
          voucher_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          created_at?: string
          file_name: string
          holding_id?: string | null
          id?: string
          lease_id?: string | null
          mime_type: string
          org_id: string
          party_id?: string | null
          property_id?: string | null
          size_bytes: number
          storage_path: string
          title: string
          uploaded_by?: string
          voucher_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          file_name?: string
          holding_id?: string | null
          id?: string
          lease_id?: string | null
          mime_type?: string
          org_id?: string
          party_id?: string | null
          property_id?: string | null
          size_bytes?: number
          storage_path?: string
          title?: string
          uploaded_by?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings_overview"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_lease_id_fkey"
            columns: ["org_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_party_id_fkey"
            columns: ["org_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties_overview"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_voucher_id_fkey"
            columns: ["org_id", "voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      holdings: {
        Row: {
          chassis_no: string | null
          class: string
          code: string
          colour: string | null
          created_at: string
          engine_cc: number | null
          engine_no: string | null
          id: string
          make: string | null
          model: string | null
          name: string | null
          notes: string | null
          org_id: string
          purity: number | null
          registration_no: string | null
          year: number | null
        }
        Insert: {
          chassis_no?: string | null
          class: string
          code: string
          colour?: string | null
          created_at?: string
          engine_cc?: number | null
          engine_no?: string | null
          id?: string
          make?: string | null
          model?: string | null
          name?: string | null
          notes?: string | null
          org_id: string
          purity?: number | null
          registration_no?: string | null
          year?: number | null
        }
        Update: {
          chassis_no?: string | null
          class?: string
          code?: string
          colour?: string | null
          created_at?: string
          engine_cc?: number | null
          engine_no?: string | null
          id?: string
          make?: string | null
          model?: string | null
          name?: string | null
          notes?: string | null
          org_id?: string
          purity?: number | null
          registration_no?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_org_id_fkey"
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
          holding_id: string | null
          id: number
          memo: string | null
          org_id: string
          party_id: string | null
          property_id: string | null
          quantity_g: number | null
          voucher_id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          entry_date: string
          holding_id?: string | null
          id?: never
          memo?: string | null
          org_id: string
          party_id?: string | null
          property_id?: string | null
          quantity_g?: number | null
          voucher_id: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          entry_date?: string
          holding_id?: string | null
          id?: never
          memo?: string | null
          org_id?: string
          party_id?: string | null
          property_id?: string | null
          quantity_g?: number | null
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
            foreignKeyName: "journal_lines_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "journal_lines_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings_overview"
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
          rent_counted_from: string | null
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
          rent_counted_from?: string | null
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
          rent_counted_from?: string | null
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
      metal_rates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metal: string
          org_id: string
          rate_date: string
          rate_per_tola: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metal: string
          org_id: string
          rate_date: string
          rate_per_tola: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metal?: string
          org_id?: string
          rate_date?: string
          rate_per_tola?: number
        }
        Relationships: [
          {
            foreignKeyName: "metal_rates_org_id_fkey"
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
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          fiscal_year_start_month?: number
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          fiscal_year_start_month?: number
          id?: string
          name?: string
          timezone?: string
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
          holding_id: string | null
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
          holding_id?: string | null
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
          holding_id?: string | null
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
            foreignKeyName: "vouchers_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vouchers_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings_overview"
            referencedColumns: ["org_id", "id"]
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
      documents_overview: {
        Row: {
          category: Database["public"]["Enums"]["document_category"] | null
          created_at: string | null
          file_name: string | null
          holding_id: string | null
          id: string | null
          lease_id: string | null
          mime_type: string | null
          org_id: string | null
          party_id: string | null
          property_id: string | null
          record_id: string | null
          record_label: string | null
          record_type: string | null
          size_bytes: number | null
          storage_path: string | null
          title: string | null
          uploaded_by: string | null
          voucher_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_holding_id_fkey"
            columns: ["org_id", "holding_id"]
            isOneToOne: false
            referencedRelation: "holdings_overview"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_lease_id_fkey"
            columns: ["org_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_party_id_fkey"
            columns: ["org_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_property_id_fkey"
            columns: ["org_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties_overview"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "documents_org_id_voucher_id_fkey"
            columns: ["org_id", "voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      holdings_overview: {
        Row: {
          chassis_no: string | null
          class: string | null
          code: string | null
          colour: string | null
          cost: number | null
          cost_relieved: number | null
          created_at: string | null
          engine_cc: number | null
          engine_no: string | null
          id: string | null
          make: string | null
          market_value: number | null
          model: string | null
          name: string | null
          notes: string | null
          org_id: string | null
          purity: number | null
          rate_date: string | null
          rate_per_tola: number | null
          realized_gain: number | null
          registration_no: string | null
          running_expenses: number | null
          sale_price: number | null
          status: string | null
          total_cost: number | null
          unrealized_gain: number | null
          weight_g: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      _holding: {
        Args: { p_id: string; p_org: string }
        Returns: {
          chassis_no: string | null
          class: string
          code: string
          colour: string | null
          created_at: string
          engine_cc: number | null
          engine_no: string | null
          id: string
          make: string | null
          model: string | null
          name: string | null
          notes: string | null
          org_id: string
          purity: number | null
          registration_no: string | null
          year: number | null
        }
        SetofOptions: {
          from: "*"
          to: "holdings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _holding_account: {
        Args: { p_class: string; p_org: string }
        Returns: string
      }
      _holding_cost: {
        Args: { p_holding: string; p_org: string }
        Returns: number
      }
      _holding_has_sale: {
        Args: { p_holding: string; p_org: string }
        Returns: boolean
      }
      _holding_sold: {
        Args: { p_holding: string; p_org: string }
        Returns: boolean
      }
      _holding_weight: {
        Args: { p_holding: string; p_org: string }
        Returns: number
      }
      _is_sold: { Args: { p_org: string; p_prop: string }; Returns: boolean }
      _line:
        | {
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
        | {
            Args: {
              p_account: string
              p_credit: number
              p_debit: number
              p_holding: string
              p_memo: string
              p_party: string
              p_property: string
              p_quantity: number
              v: Database["public"]["Tables"]["vouchers"]["Row"]
            }
            Returns: undefined
          }
      _money_account: { Args: { p_id: string; p_org: string }; Returns: string }
      _new_voucher:
        | {
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
              holding_id: string | null
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
        | {
            Args: {
              p_amount: number
              p_date: string
              p_holding: string
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
              holding_id: string | null
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
      _seed_holding_accounts: { Args: { p_org: string }; Returns: undefined }
      _uuid: {
        Args: { k: string; p: Json; p_required?: boolean }
        Returns: string
      }
      _voucher_prefix: {
        Args: { t: Database["public"]["Enums"]["voucher_type"] }
        Returns: string
      }
      _weight: { Args: { k?: string; p: Json; u?: string }; Returns: number }
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
      add_document: {
        Args: {
          p_category: Database["public"]["Enums"]["document_category"]
          p_file_name?: string
          p_id: string
          p_link: Json
          p_org: string
          p_path: string
          p_title: string
        }
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
      delete_document: { Args: { p_id: string }; Returns: string }
      document_path_org: { Args: { p_name: string }; Returns: string }
      edit_voucher: {
        Args: { p_changes: Json; p_voucher: string }
        Returns: Json
      }
      expiring_leases: {
        Args: { p_as_of?: string; p_days?: number; p_org: string }
        Returns: {
          days_to_end: number
          end_date: string
          lease_id: string
          monthly_rent: number
          property_code: string
          property_id: string
          tenant_name: string
        }[]
      }
      has_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["member_role"][]
        }
        Returns: boolean
      }
      holding_breakdown: {
        Args: { p_holding: string; p_org: string }
        Returns: {
          amount: number
          label: string
          section: string
        }[]
      }
      holding_status: {
        Args: { p_holding: string; p_org: string }
        Returns: string
      }
      holdings_valuation: {
        Args: { p_as_of?: string; p_org: string }
        Returns: {
          class: string
          cost: number
          items: number
          market_value: number
          rate_date: string
          rate_per_tola: number
          weight_g: number
        }[]
      }
      income_statement: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: Json
      }
      is_member: { Args: { p_org: string }; Returns: boolean }
      monthly_performance: {
        Args: { p_as_of?: string; p_months?: number; p_org: string }
        Returns: {
          closing_cash: number
          gross_trading_profit: number
          month_end: string
          month_start: string
          net_profit: number
          other_income: number
          rent_income: number
          total_expenses: number
          total_income: number
        }[]
      }
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
      org_today: { Args: { p_org: string }; Returns: string }
      party_balances: {
        Args: { p_org: string }
        Returns: {
          advances: number
          deposits: number
          name: string
          net: number
          party_id: string
          payable: number
          receivable: number
          roles: string[]
        }[]
      }
      party_ledger: {
        Args: { p_from: string; p_org: string; p_party: string; p_to: string }
        Returns: {
          account_name: string
          balance: number
          credit: number
          debit: number
          entry_date: string
          memo: string
          property_code: string
          seq: number
          voucher_id: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }[]
      }
      ping: { Args: never; Returns: string }
      post_voucher: { Args: { p: Json; p_org: string }; Returns: Json }
      preview_edit: {
        Args: { p_changes: Json; p_voucher: string }
        Returns: Json
      }
      preview_voucher: { Args: { p: Json; p_org: string }; Returns: Json }
      property_breakdown: {
        Args: { p_org: string; p_property: string }
        Returns: {
          amount: number
          label: string
          section: string
        }[]
      }
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
      rent_roll: {
        Args: { p_as_of?: string; p_org: string }
        Returns: {
          arrears: number
          days_to_end: number
          deposit_held: number
          end_date: string
          ended_on: string
          expected: number
          last_rent_amount: number
          last_rent_date: string
          lease_id: string
          monthly_rent: number
          months_due: number
          months_unpaid: number
          paid_ahead: number
          party_id: string
          property_code: string
          property_id: string
          property_name: string
          received: number
          rent_counted_from: string
          rent_due_day: number
          security_deposit: number
          start_date: string
          status: string
          tenant_name: string
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
      storage_used: { Args: { p_org: string }; Returns: number }
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
      unit_to_grams: {
        Args: { p_qty: number; p_unit: string }
        Returns: number
      }
      update_document: {
        Args: {
          p_category: Database["public"]["Enums"]["document_category"]
          p_id: string
          p_title: string
        }
        Returns: undefined
      }
      voucher_detail: { Args: { p_voucher: string }; Returns: Json }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      document_category:
        | "registry"
        | "sale_agreement"
        | "rent_agreement"
        | "receipt"
        | "id_card"
        | "photo"
        | "other"
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
        | "holding_purchase"
        | "holding_cost"
        | "holding_sale"
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
      document_category: [
        "registry",
        "sale_agreement",
        "rent_agreement",
        "receipt",
        "id_card",
        "photo",
        "other",
      ],
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
        "holding_purchase",
        "holding_cost",
        "holding_sale",
      ],
    },
  },
} as const

