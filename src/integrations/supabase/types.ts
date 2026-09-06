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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string
          emoji: string
          id: string
          metric: string
          name: string
          points: number
          position: number
          threshold: number
          tier: string
        }
        Insert: {
          description: string
          emoji?: string
          id: string
          metric: string
          name: string
          points?: number
          position?: number
          threshold?: number
          tier?: string
        }
        Update: {
          description?: string
          emoji?: string
          id?: string
          metric?: string
          name?: string
          points?: number
          position?: number
          threshold?: number
          tier?: string
        }
        Relationships: []
      }
      ai_files: {
        Row: {
          created_at: string
          extracted_text: string | null
          id: string
          mime: string
          name: string
          size: number
          storage_path: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          id?: string
          mime: string
          name: string
          size?: number
          storage_path?: string | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          id?: string
          mime?: string
          name?: string
          size?: number
          storage_path?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_files_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memories: {
        Row: {
          created_at: string
          id: string
          memory: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memory: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memory?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          id: string
          image_url: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_summaries: {
        Row: {
          covered_until: string
          created_at: string
          id: string
          message_count: number
          summary: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          covered_until?: string
          created_at?: string
          id?: string
          message_count?: number
          summary: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          covered_until?: string
          created_at?: string
          id?: string
          message_count?: number
          summary?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_private_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          coin_to_brl_rate: number
          id: boolean
          min_withdrawal_brl: number
          updated_at: string
        }
        Insert: {
          coin_to_brl_rate?: number
          id?: boolean
          min_withdrawal_brl?: number
          updated_at?: string
        }
        Update: {
          coin_to_brl_rate?: number
          id?: boolean
          min_withdrawal_brl?: number
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          created_at: string
          holder_document: string
          holder_name: string
          id: string
          is_active: boolean
          method: string
          pix_key: string | null
          pix_key_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          created_at?: string
          holder_document: string
          holder_name: string
          id?: string
          is_active?: boolean
          method: string
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          created_at?: string
          holder_document?: string
          holder_name?: string
          id?: string
          is_active?: boolean
          method?: string
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_hashes: {
        Row: {
          created_at: string
          hash: string
          id: string
          kind: string
          note: string | null
        }
        Insert: {
          created_at?: string
          hash: string
          id?: string
          kind?: string
          note?: string | null
        }
        Update: {
          created_at?: string
          hash?: string
          id?: string
          kind?: string
          note?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      call_signals: {
        Row: {
          call_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          sender_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          sender_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          accepted_at: string | null
          call_type: Database["public"]["Enums"]["call_type"]
          callee_id: string
          caller_id: string
          created_at: string
          ended_at: string | null
          id: string
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          call_type?: Database["public"]["Enums"]["call_type"]
          callee_id: string
          caller_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          call_type?: Database["public"]["Enums"]["call_type"]
          callee_id?: string
          caller_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Relationships: []
      }
      channel_subscriptions: {
        Row: {
          creator_id: string
          ends_at: string | null
          id: string
          started_at: string
          status: string
          stripe_subscription_id: string | null
          subscriber_id: string
          tier: number
        }
        Insert: {
          creator_id: string
          ends_at?: string | null
          id?: string
          started_at?: string
          status?: string
          stripe_subscription_id?: string | null
          subscriber_id: string
          tier?: number
        }
        Update: {
          creator_id?: string
          ends_at?: string | null
          id?: string
          started_at?: string
          status?: string
          stripe_subscription_id?: string | null
          subscriber_id?: string
          tier?: number
        }
        Relationships: []
      }
      chat_invites: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_invites_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_members: {
        Row: {
          chat_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          chat_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          expires_at: string | null
          id: string
          kind: string
          media_bucket: string | null
          media_duration_ms: number | null
          media_name: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          meta: Json
          pinned_at: string | null
          pinned_by: string | null
          poster_url: string | null
          read_at: string | null
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          chat_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          media_bucket?: string | null
          media_duration_ms?: number | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          meta?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          poster_url?: string | null
          read_at?: string | null
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          chat_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          media_bucket?: string | null
          media_duration_ms?: number | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          meta?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          poster_url?: string | null
          read_at?: string | null
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_streaks: {
        Row: {
          a_last_day: string | null
          b_last_day: string | null
          best: number
          conversation_id: string
          last_both_day: string | null
          streak: number
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          a_last_day?: string | null
          b_last_day?: string | null
          best?: number
          conversation_id: string
          last_both_day?: string | null
          streak?: number
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          a_last_day?: string | null
          b_last_day?: string | null
          best?: number
          conversation_id?: string
          last_both_day?: string | null
          streak?: number
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_streaks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          last_message_at: string
          meta: Json | null
          owner_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_message_at?: string
          meta?: Json | null
          owner_id: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_message_at?: string
          meta?: Json | null
          owner_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      coin_purchases: {
        Row: {
          amount_paid: number
          coins: number
          created_at: string
          currency: string
          environment: string
          id: string
          price_id: string
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          coins: number
          created_at?: string
          currency: string
          environment?: string
          id?: string
          price_id: string
          stripe_session_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          coins?: number
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          price_id?: string
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          edited_at: string | null
          id: string
          parent_id: string | null
          poll_id: string | null
          post_id: string
          sticker_url: string | null
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          poll_id?: string | null
          post_id: string
          sticker_url?: string | null
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          poll_id?: string | null
          post_id?: string
          sticker_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_moderation: {
        Row: {
          content_id: string | null
          content_type: string
          created_at: string
          hash: string | null
          id: string
          labels: Json
          owner_id: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          status: string
        }
        Insert: {
          content_id?: string | null
          content_type: string
          created_at?: string
          hash?: string | null
          id?: string
          labels?: Json
          owner_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: string
        }
        Update: {
          content_id?: string | null
          content_type?: string
          created_at?: string
          hash?: string | null
          id?: string
          labels?: Json
          owner_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          meta: Json | null
          user_a: string
          user_b: string
          wallpaper_type: string
          wallpaper_value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          meta?: Json | null
          user_a: string
          user_b: string
          wallpaper_type?: string
          wallpaper_value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          meta?: Json | null
          user_a?: string
          user_b?: string
          wallpaper_type?: string
          wallpaper_value?: string | null
        }
        Relationships: []
      }
      daily_prompts: {
        Row: {
          active_on: string
          created_at: string
          id: string
          prompt: string
        }
        Insert: {
          active_on: string
          created_at?: string
          id?: string
          prompt: string
        }
        Update: {
          active_on?: string
          created_at?: string
          id?: string
          prompt?: string
        }
        Relationships: []
      }
      dm_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: []
      }
      game_scores: {
        Row: {
          created_at: string
          game: string
          id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game: string
          id?: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game?: string
          id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gift_catalog: {
        Row: {
          active: boolean
          animation: string | null
          cost_coins: number
          created_at: string
          emoji: string
          id: string
          name: string
          tier: string
        }
        Insert: {
          active?: boolean
          animation?: string | null
          cost_coins: number
          created_at?: string
          emoji: string
          id?: string
          name: string
          tier?: string
        }
        Update: {
          active?: boolean
          animation?: string | null
          cost_coins?: number
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          tier?: string
        }
        Relationships: []
      }
      hashtag_edges: {
        Row: {
          a_id: string
          b_id: string
          weight: number
        }
        Insert: {
          a_id: string
          b_id: string
          weight?: number
        }
        Update: {
          a_id?: string
          b_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_edges_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hashtag_edges_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_views: {
        Row: {
          created_at: string
          hashtag_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hashtag_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hashtag_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_views_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtags: {
        Row: {
          created_at: string
          description: string | null
          display_tag: string
          growth: number
          id: string
          post_count: number
          recent_count: number
          tag: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_tag: string
          growth?: number
          id?: string
          post_count?: number
          recent_count?: number
          tag: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_tag?: string
          growth?: number
          id?: string
          post_count?: number
          recent_count?: number
          tag?: string
          updated_at?: string
        }
        Relationships: []
      }
      hidden_posts: {
        Row: {
          created_at: string
          post_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          reason?: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_categories: {
        Row: {
          emoji: string | null
          id: string
          label: string
          position: number
        }
        Insert: {
          emoji?: string | null
          id: string
          label: string
          position?: number
        }
        Update: {
          emoji?: string | null
          id?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      listing_images: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          position: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          position?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_likes: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_likes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_saves: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_saves_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category_id: string | null
          city: string | null
          condition: string
          created_at: string
          currency: string
          description: string | null
          id: string
          price_cents: number
          seller_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          city?: string | null
          condition?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          price_cents?: number
          seller_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          city?: string | null
          condition?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          price_cents?: number
          seller_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "listing_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      live_bans: {
        Row: {
          banned_by: string
          created_at: string
          expires_at: string | null
          live_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          expires_at?: string | null
          live_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          live_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_bans_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_messages: {
        Row: {
          content: string
          created_at: string
          deleted: boolean
          gift_id: string | null
          id: string
          is_highlighted: boolean
          live_id: string
          pinned: boolean
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted?: boolean
          gift_id?: string | null
          id?: string
          is_highlighted?: boolean
          live_id: string
          pinned?: boolean
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted?: boolean
          gift_id?: string | null
          id?: string
          is_highlighted?: boolean
          live_id?: string
          pinned?: boolean
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_messages_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "live_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      live_gifts: {
        Row: {
          coins_spent: number
          created_at: string
          gift_id: string
          id: string
          live_id: string
          message: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          coins_spent: number
          created_at?: string
          gift_id: string
          id?: string
          live_id: string
          message?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          coins_spent?: number
          created_at?: string
          gift_id?: string
          id?: string
          live_id?: string
          message?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_gifts_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gift_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_gifts_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_moderators: {
        Row: {
          added_by: string
          created_at: string
          live_id: string
          user_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          live_id: string
          user_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          live_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_moderators_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          live_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          live_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          live_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_reactions_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recordings: {
        Row: {
          created_at: string
          duration_sec: number | null
          external_url: string | null
          id: string
          live_id: string
          size_bytes: number | null
          status: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          external_url?: string | null
          id?: string
          live_id: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          external_url?: string | null
          id?: string
          live_id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_recordings_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_viewers: {
        Row: {
          joined_at: string
          left_at: string | null
          live_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          live_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          live_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_viewers_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      lives: {
        Row: {
          age_restricted: boolean
          allow_guests: boolean
          audience: string
          auto_record: boolean
          category: string | null
          created_at: string
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          language: string | null
          last_heartbeat_at: string
          like_count: number
          livekit_room: string
          peak_viewer_count: number
          started_at: string | null
          status: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          viewer_count: number
        }
        Insert: {
          age_restricted?: boolean
          allow_guests?: boolean
          audience?: string
          auto_record?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          language?: string | null
          last_heartbeat_at?: string
          like_count?: number
          livekit_room: string
          peak_viewer_count?: number
          started_at?: string | null
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          viewer_count?: number
        }
        Update: {
          age_restricted?: boolean
          allow_guests?: boolean
          audience?: string
          auto_record?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          language?: string | null
          last_heartbeat_at?: string
          like_count?: number
          livekit_room?: string
          peak_viewer_count?: number
          started_at?: string | null
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          viewer_count?: number
        }
        Relationships: []
      }
      message_edits: {
        Row: {
          edited_at: string
          editor_id: string
          id: string
          message_id: string
          previous_content: string | null
          source: string
        }
        Insert: {
          edited_at?: string
          editor_id: string
          id?: string
          message_id: string
          previous_content?: string | null
          source: string
        }
        Update: {
          edited_at?: string
          editor_id?: string
          id?: string
          message_id?: string
          previous_content?: string | null
          source?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          expires_at: string | null
          id: string
          kind: string
          media_bucket: string | null
          media_duration_ms: number | null
          media_name: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          meta: Json
          pinned_at: string | null
          pinned_by: string | null
          poster_url: string | null
          read_at: string | null
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          media_bucket?: string | null
          media_duration_ms?: number | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          meta?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          poster_url?: string | null
          read_at?: string | null
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          media_bucket?: string | null
          media_duration_ms?: number | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          meta?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          poster_url?: string | null
          read_at?: string | null
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          content_id: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          reason: string
          report_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          reason: string
          report_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string
          report_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      muted_chats: {
        Row: {
          chat_id: string
          until: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          until?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "muted_chats_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_conversations: {
        Row: {
          conversation_id: string
          until: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          until?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "muted_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_stories: {
        Row: {
          target_user_id: string
          user_id: string
        }
        Insert: {
          target_user_id: string
          user_id: string
        }
        Update: {
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          created_at: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_index?: number
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          author_id: string
          closes_at: string
          created_at: string
          id: string
          options: Json
          question: string
        }
        Insert: {
          author_id: string
          closes_at: string
          created_at?: string
          id?: string
          options: Json
          question: string
        }
        Update: {
          author_id?: string
          closes_at?: string
          created_at?: string
          id?: string
          options?: Json
          question?: string
        }
        Relationships: []
      }
      pong_matches: {
        Row: {
          arena: string | null
          created_at: string
          id: string
          my_score: number
          opponent_id: string | null
          opponent_score: number
          power: string | null
          room: string | null
          user_id: string
          won: boolean
          xp_gained: number
        }
        Insert: {
          arena?: string | null
          created_at?: string
          id?: string
          my_score?: number
          opponent_id?: string | null
          opponent_score?: number
          power?: string | null
          room?: string | null
          user_id: string
          won?: boolean
          xp_gained?: number
        }
        Update: {
          arena?: string | null
          created_at?: string
          id?: string
          my_score?: number
          opponent_id?: string | null
          opponent_score?: number
          power?: string | null
          room?: string | null
          user_id?: string
          won?: boolean
          xp_gained?: number
        }
        Relationships: []
      }
      pong_queue: {
        Row: {
          created_at: string
          matched_at: string | null
          room: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          matched_at?: string | null
          room?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          matched_at?: string | null
          room?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pong_stats: {
        Row: {
          best_streak: number
          cosmetics: Json
          created_at: string
          favorite_power: string | null
          level: number
          losses: number
          points_conceded: number
          points_scored: number
          streak: number
          updated_at: string
          user_id: string
          wins: number
          xp: number
        }
        Insert: {
          best_streak?: number
          cosmetics?: Json
          created_at?: string
          favorite_power?: string | null
          level?: number
          losses?: number
          points_conceded?: number
          points_scored?: number
          streak?: number
          updated_at?: string
          user_id: string
          wins?: number
          xp?: number
        }
        Update: {
          best_streak?: number
          cosmetics?: Json
          created_at?: string
          favorite_power?: string | null
          level?: number
          losses?: number
          points_conceded?: number
          points_scored?: number
          streak?: number
          updated_at?: string
          user_id?: string
          wins?: number
          xp?: number
        }
        Relationships: []
      }
      post_hashtags: {
        Row: {
          created_at: string
          hashtag_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          hashtag_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          hashtag_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_hashtags_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_hashtags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          post_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          post_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          media_url: string | null
          poll_id: string | null
          post_kind: string
          thumbnail_url: string | null
          view_count: number
        }
        Insert: {
          author_id: string
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          media_url?: string | null
          poll_id?: string | null
          post_kind?: string
          thumbnail_url?: string | null
          view_count?: number
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          media_url?: string | null
          poll_id?: string | null
          post_kind?: string
          thumbnail_url?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          badge_variant: string | null
          banned_at: string | null
          bio: string | null
          birthdate: string | null
          cover_url: string | null
          created_at: string
          display_name: string
          dm_privacy: string
          favorite_track: string | null
          featured_username: string | null
          id: string
          interests: string[]
          is_creator: boolean
          is_minor: boolean
          is_verified: boolean
          location: string | null
          pronouns: string | null
          read_receipts: boolean
          show_online: boolean
          strikes: number
          suspended_until: string | null
          updated_at: string
          username: string
          username_changed_at: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          badge_variant?: string | null
          banned_at?: string | null
          bio?: string | null
          birthdate?: string | null
          cover_url?: string | null
          created_at?: string
          display_name: string
          dm_privacy?: string
          favorite_track?: string | null
          featured_username?: string | null
          id: string
          interests?: string[]
          is_creator?: boolean
          is_minor?: boolean
          is_verified?: boolean
          location?: string | null
          pronouns?: string | null
          read_receipts?: boolean
          show_online?: boolean
          strikes?: number
          suspended_until?: string | null
          updated_at?: string
          username: string
          username_changed_at?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          badge_variant?: string | null
          banned_at?: string | null
          bio?: string | null
          birthdate?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string
          dm_privacy?: string
          favorite_track?: string | null
          featured_username?: string | null
          id?: string
          interests?: string[]
          is_creator?: boolean
          is_minor?: boolean
          is_verified?: boolean
          location?: string | null
          pronouns?: string | null
          read_receipts?: boolean
          show_online?: boolean
          strikes?: number
          suspended_until?: string | null
          updated_at?: string
          username?: string
          username_changed_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          scope: string
          subject: string
          window_start: string
        }
        Insert: {
          count?: number
          scope: string
          subject: string
          window_start: string
        }
        Update: {
          count?: number
          scope?: string
          subject?: string
          window_start?: string
        }
        Relationships: []
      }
      realities: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          generated_image: string
          id: string
          is_featured: boolean
          name: string
          original_image: string | null
          privacy: string
          room_id: string | null
          style: string
          transformation_prompt: string | null
          updated_at: string
          voice_channel_id: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          generated_image: string
          id?: string
          is_featured?: boolean
          name: string
          original_image?: string | null
          privacy?: string
          room_id?: string | null
          style?: string
          transformation_prompt?: string | null
          updated_at?: string
          voice_channel_id?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          generated_image?: string
          id?: string
          is_featured?: boolean
          name?: string
          original_image?: string | null
          privacy?: string
          room_id?: string | null
          style?: string
          transformation_prompt?: string | null
          updated_at?: string
          voice_channel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "realities_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realities_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "watch_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realities_voice_channel_id_fkey"
            columns: ["voice_channel_id"]
            isOneToOne: false
            referencedRelation: "voice_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string | null
          created_at: string
          details: string | null
          id: string
          moderator_note: string | null
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          details?: string | null
          id?: string
          moderator_note?: string | null
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          details?: string | null
          id?: string
          moderator_note?: string | null
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target"]
          updated_at?: string
        }
        Relationships: []
      }
      reposts: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          cancelled_at: string | null
          chat_id: string | null
          content: string
          conversation_id: string | null
          created_at: string
          ephemeral_seconds: number | null
          id: string
          send_at: string
          sent_at: string | null
          target_type: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          chat_id?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          ephemeral_seconds?: number | null
          id?: string
          send_at: string
          sent_at?: string | null
          target_type: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          chat_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          ephemeral_seconds?: number | null
          id?: string
          send_at?: string
          sent_at?: string | null
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          created_at: string
          display_term: string
          id: string
          term: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_term: string
          id?: string
          term: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_term?: string
          id?: string
          term?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          event: string
          id: string
          ip: string | null
          metadata: Json
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          ip?: string | null
          metadata?: Json
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          ip?: string | null
          metadata?: Json
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      stickers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          pack: string
          position: number
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          pack?: string
          position?: number
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          pack?: string
          position?: number
          url?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string
          media_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url?: string
          user_id?: string
        }
        Relationships: []
      }
      story_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_reactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      translation_cache: {
        Row: {
          created_at: string
          id: string
          source_hash: string
          source_text: string
          target_lang: string
          translated_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_hash: string
          source_text: string
          target_lang: string
          translated_text: string
        }
        Update: {
          created_at?: string
          id?: string
          source_hash?: string
          source_text?: string
          target_lang?: string
          translated_text?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_coins: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          city: string | null
          lat: number
          lng: number
          sharing: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          lat: number
          lng: number
          sharing?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          lat?: number
          lng?: number
          sharing?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stickers: {
        Row: {
          created_at: string
          id: string
          name: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_topic_affinity: {
        Row: {
          topic: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          topic: string
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          topic?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      vibe_checkins: {
        Row: {
          created_at: string
          day: string
          mood: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          day?: string
          mood: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          mood?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_collection_items: {
        Row: {
          bucket: string
          caption: string | null
          collection_id: string
          created_at: string
          id: string
          media_path: string
          media_type: string
          position: number
          story_id: string | null
        }
        Insert: {
          bucket?: string
          caption?: string | null
          collection_id: string
          created_at?: string
          id?: string
          media_path: string
          media_type?: string
          position?: number
          story_id?: string | null
        }
        Update: {
          bucket?: string
          caption?: string | null
          collection_id?: string
          created_at?: string
          id?: string
          media_path?: string
          media_type?: string
          position?: number
          story_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vibe_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "vibe_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_collections: {
        Row: {
          accent: string
          cover_bucket: string
          cover_path: string | null
          created_at: string
          id: string
          is_pinned: boolean
          position: number
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          accent?: string
          cover_bucket?: string
          cover_path?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          position?: number
          title: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          accent?: string
          cover_bucket?: string
          cover_path?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "vibe_collections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_channels: {
        Row: {
          created_at: string
          created_by: string
          emoji: string | null
          id: string
          is_public: boolean
          max_members: number
          name: string
          topic: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          emoji?: string | null
          id?: string
          is_public?: boolean
          max_members?: number
          name: string
          topic?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          emoji?: string | null
          id?: string
          is_public?: boolean
          max_members?: number
          name?: string
          topic?: string | null
        }
        Relationships: []
      }
      watch_room_members: {
        Row: {
          joined_at: string
          left_at: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "watch_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_room_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          room_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          room_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "watch_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_room_state: {
        Row: {
          playing: boolean
          position_sec: number
          room_id: string
          updated_at: string
          updated_by: string | null
          video_id: string | null
        }
        Insert: {
          playing?: boolean
          position_sec?: number
          room_id: string
          updated_at?: string
          updated_by?: string | null
          video_id?: string | null
        }
        Update: {
          playing?: boolean
          position_sec?: number
          room_id?: string
          updated_at?: string
          updated_by?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_room_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "watch_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_rooms: {
        Row: {
          category: string | null
          closed_at: string | null
          cover_url: string | null
          created_at: string
          host_id: string
          id: string
          invite_code: string
          is_private: boolean
          max_members: number
          provider: string
          scheduled_at: string | null
          title: string | null
          updated_at: string
          video_id: string | null
          visibility: string
        }
        Insert: {
          category?: string | null
          closed_at?: string | null
          cover_url?: string | null
          created_at?: string
          host_id: string
          id?: string
          invite_code?: string
          is_private?: boolean
          max_members?: number
          provider?: string
          scheduled_at?: string | null
          title?: string | null
          updated_at?: string
          video_id?: string | null
          visibility?: string
        }
        Update: {
          category?: string | null
          closed_at?: string | null
          cover_url?: string | null
          created_at?: string
          host_id?: string
          id?: string
          invite_code?: string
          is_private?: boolean
          max_members?: number
          provider?: string
          scheduled_at?: string | null
          title?: string | null
          updated_at?: string
          video_id?: string | null
          visibility?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          admin_note: string | null
          amount_brl: number
          amount_coins: number
          bank_account_id: string | null
          bank_snapshot: Json
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_brl: number
          amount_coins: number
          bank_account_id?: string | null
          bank_snapshot: Json
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_brl?: number
          amount_coins?: number
          bank_account_id?: string | null
          bank_snapshot?: Json
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_state: { Args: { _user: string }; Returns: string }
      achievement_progress: {
        Args: { _user: string }
        Returns: {
          metric: string
          value: number
        }[]
      }
      admin_delete_content: {
        Args: { _id: string; _kind: string; _reason: string }
        Returns: undefined
      }
      admin_list_content: {
        Args: { _kind?: string; _limit?: number; _search?: string }
        Returns: {
          created_at: string
          id: string
          kind: string
          owner_id: string
          owner_username: string
          status: string
          title: string
        }[]
      }
      admin_list_transactions: {
        Args: { _limit?: number }
        Returns: {
          amount: number
          coins: number
          created_at: string
          id: string
          kind: string
          status: string
          username: string
        }[]
      }
      admin_list_users: {
        Args: { _filter?: string; _limit?: number; _search?: string }
        Returns: {
          avatar_url: string
          banned_at: string
          coins: number
          created_at: string
          display_name: string
          followers: number
          id: string
          is_admin: boolean
          is_minor: boolean
          posts: number
          strikes: number
          suspended_until: string
          username: string
        }[]
      }
      admin_moderate: {
        Args: {
          _action: string
          _content_id?: string
          _content_type?: string
          _duration_hours?: number
          _reason: string
          _report_id?: string
          _user_id: string
        }
        Returns: string
      }
      admin_overview: { Args: never; Returns: Json }
      admin_resolve_report: {
        Args: { _note?: string; _report_id: string; _status: string }
        Returns: undefined
      }
      admin_review_content: {
        Args: { _id: string; _status: string }
        Returns: undefined
      }
      admin_set_flag: {
        Args: { _enabled: boolean; _key: string }
        Returns: undefined
      }
      admin_update_withdrawal: {
        Args: { _new_status: string; _note?: string; _withdrawal_id: string }
        Returns: undefined
      }
      can_interact: { Args: { _user: string }; Returns: boolean }
      can_message: { Args: { _user: string }; Returns: boolean }
      can_publish: { Args: { _user: string }; Returns: boolean }
      can_view_live: {
        Args: { _live: string; _user: string }
        Returns: boolean
      }
      can_view_reality: { Args: { _reality_id: string }; Returns: boolean }
      change_username: { Args: { _new_username: string }; Returns: string }
      chat_role: { Args: { _chat: string; _user: string }; Returns: string }
      check_rate_limit: {
        Args: { _limit: number; _scope: string; _window_seconds: number }
        Returns: boolean
      }
      coins_to_brl: { Args: { _coins: number }; Returns: number }
      credit_coins: {
        Args: { _amount: number; _user: string }
        Returns: number
      }
      deliver_scheduled_messages: { Args: never; Returns: number }
      end_stale_lives: { Args: never; Returns: number }
      flag_enabled: { Args: { _key: string }; Returns: boolean }
      friends_vibe_checkins: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          mine: boolean
          mood: string
          note: string
          user_id: string
          username: string
        }[]
      }
      get_or_create_conversation: {
        Args: { _other_user: string }
        Returns: string
      }
      get_streak: { Args: { _conversation: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_vibely_pro: {
        Args: { _env?: string; _user: string }
        Returns: boolean
      }
      hashtag_feed: {
        Args: {
          _limit?: number
          _offset?: number
          _sort?: string
          _tag: string
        }
        Returns: {
          author_avatar: string
          author_display: string
          author_username: string
          caption: string
          comments: number
          created_at: string
          id: string
          likes: number
          media_type: string
          media_url: string
          post_kind: string
          thumbnail_url: string
          view_count: number
        }[]
      }
      hashtag_info: {
        Args: { _tag: string }
        Returns: {
          display_tag: string
          post_count: number
          tag: string
        }[]
      }
      is_blocked_pair: { Args: { _a: string; _b: string }; Returns: boolean }
      is_chat_member: {
        Args: { _chat: string; _user: string }
        Returns: boolean
      }
      is_supporter: { Args: { _user: string }; Returns: boolean }
      is_watch_host: {
        Args: { _room: string; _user: string }
        Returns: boolean
      }
      is_watch_member: {
        Args: { _room: string; _user: string }
        Returns: boolean
      }
      join_watch_room: { Args: { _room: string }; Returns: string }
      join_watch_room_by_code: {
        Args: { _code: string }
        Returns: {
          room_id: string
        }[]
      }
      join_watch_room_impl: { Args: { _room: string }; Returns: string }
      list_public_realities: {
        Args: { _limit?: number; _offset?: number }
        Returns: {
          avatar_url: string
          created_at: string
          creator_id: string
          description: string
          display_name: string
          generated_image: string
          id: string
          name: string
          people: number
          room_id: string
          style: string
          username: string
        }[]
      }
      list_public_watch_rooms: {
        Args: { _category?: string; _limit?: number; _search?: string }
        Returns: {
          category: string | null
          closed_at: string | null
          cover_url: string | null
          created_at: string
          host_id: string
          id: string
          invite_code: string
          is_private: boolean
          max_members: number
          provider: string
          scheduled_at: string | null
          title: string | null
          updated_at: string
          video_id: string | null
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "watch_rooms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      live_heartbeat: { Args: { _live_id: string }; Returns: undefined }
      log_hashtag_view: { Args: { _tag: string }; Returns: undefined }
      log_post_view: { Args: { _post_id: string }; Returns: undefined }
      log_search: { Args: { _term: string }; Returns: undefined }
      log_security_event: {
        Args: {
          _event: string
          _ip?: string
          _metadata?: Json
          _severity?: string
          _user?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      my_account_state: {
        Args: never
        Returns: {
          banned_at: string
          is_minor: boolean
          strikes: number
          suspended_until: string
        }[]
      }
      my_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          badge_variant: string | null
          banned_at: string | null
          bio: string | null
          birthdate: string | null
          cover_url: string | null
          created_at: string
          display_name: string
          dm_privacy: string
          favorite_track: string | null
          featured_username: string | null
          id: string
          interests: string[]
          is_creator: boolean
          is_minor: boolean
          is_verified: boolean
          location: string | null
          pronouns: string | null
          read_receipts: boolean
          show_online: boolean
          strikes: number
          suspended_until: string | null
          updated_at: string
          username: string
          username_changed_at: string | null
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_search_history: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          display_term: string
          id: string
        }[]
      }
      nearby_users: {
        Args: { _limit?: number; _radius_km?: number }
        Returns: {
          avatar_url: string
          badge_variant: string
          bearing: number
          city: string
          display_name: string
          distance_km: number
          i_follow: boolean
          id: string
          is_verified: boolean
          username: string
        }[]
      }
      normalize_invite_code: { Args: { _code: string }; Returns: string }
      normalize_search: { Args: { _t: string }; Returns: string }
      notify_user: {
        Args: {
          _actor: string
          _entity_id: string
          _entity_type: string
          _meta: Json
          _type: string
          _user: string
        }
        Returns: undefined
      }
      owns_post: {
        Args: { _post_id: string; _user_id: string }
        Returns: boolean
      }
      poll_counts: {
        Args: { _poll_id: string }
        Returns: {
          option_index: number
          votes: number
        }[]
      }
      pong_find_match: {
        Args: never
        Returns: {
          room: string
          status: string
        }[]
      }
      pong_leave_queue: { Args: never; Returns: undefined }
      pong_record_result: {
        Args: {
          _arena?: string
          _my_score: number
          _opp_score: number
          _opponent: string
          _power?: string
          _room: string
        }
        Returns: {
          level: number
          streak: number
          xp: number
          xp_gained: number
        }[]
      }
      popular_searches: {
        Args: { _limit?: number }
        Returns: {
          display_term: string
          growth: number
          hits: number
          term: string
        }[]
      }
      public_post_preview: {
        Args: { _id: string }
        Returns: {
          caption: string
          comments: number
          created_at: string
          display_name: string
          id: string
          likes: number
          media_type: string
          post_kind: string
          username: string
        }[]
      }
      push_dispatch: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      recommended_for_me: {
        Args: { _limit?: number }
        Returns: {
          image: string
          kind: string
          label: string
          slug: string
          sublabel: string
        }[]
      }
      recompute_my_affinity: { Args: never; Returns: undefined }
      recompute_trends: { Args: never; Returns: undefined }
      related_hashtags: {
        Args: { _limit?: number; _tag: string }
        Returns: {
          display_tag: string
          post_count: number
          tag: string
          weight: number
        }[]
      }
      related_searches: {
        Args: { _limit?: number; _q: string }
        Returns: {
          kind: string
          term: string
        }[]
      }
      report_ephemeral_capture: { Args: { _id: string }; Returns: undefined }
      request_withdrawal: {
        Args: { _amount_coins: number; _bank_account_id: string }
        Returns: string
      }
      search_all: {
        Args: { _kind?: string; _limit?: number; _offset?: number; _q: string }
        Returns: {
          author_avatar: string
          author_badge: string
          author_display: string
          author_username: string
          author_verified: boolean
          count1: number
          count2: number
          created_at: string
          id: string
          image: string
          kind: string
          media_type: string
          post_kind: string
          score: number
          subtitle: string
          title: string
        }[]
      }
      search_ask_context: { Args: { _q: string }; Returns: Json }
      search_did_you_mean: {
        Args: { _q: string }
        Returns: {
          kind: string
          suggestion: string
        }[]
      }
      search_places: {
        Args: { _limit?: number; _q: string }
        Returns: {
          people: number
          place: string
        }[]
      }
      search_suggest: {
        Args: { _q: string }
        Returns: {
          image: string
          kind: string
          label: string
          score: number
          sublabel: string
        }[]
      }
      search_v2: {
        Args: {
          _filter?: string
          _kind?: string
          _limit?: number
          _offset?: number
          _period?: string
          _place?: string
          _q: string
          _sort?: string
        }
        Returns: {
          author_avatar: string
          author_badge: string
          author_display: string
          author_username: string
          author_verified: boolean
          count1: number
          count2: number
          created_at: string
          id: string
          image: string
          kind: string
          media_type: string
          post_kind: string
          score: number
          seen: boolean
          subtitle: string
          title: string
          views: number
        }[]
      }
      send_live_gift: {
        Args: { _gift_id: string; _live_id: string; _message?: string }
        Returns: {
          balance: number
          coins_spent: number
        }[]
      }
      set_chat_meta: {
        Args: { _chat: string; _meta: Json }
        Returns: undefined
      }
      set_conversation_meta: {
        Args: { _conversation: string; _meta: Json }
        Returns: undefined
      }
      set_conversation_wallpaper: {
        Args: { _conversation: string; _type: string; _value?: string }
        Returns: undefined
      }
      set_my_location: {
        Args: { _city?: string; _lat: number; _lng: number }
        Returns: undefined
      }
      set_vibe_checkin: {
        Args: { _mood: string; _note?: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stop_sharing_location: { Args: never; Returns: undefined }
      submit_game_score: {
        Args: { _game: string; _score: number }
        Returns: number
      }
      submit_report: {
        Args: {
          _category: string
          _details?: string
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      suggested_for_me: {
        Args: { _limit?: number }
        Returns: {
          kind: string
          label: string
          sublabel: string
        }[]
      }
      sync_achievements: {
        Args: { _user?: string }
        Returns: {
          level: number
          points: number
          unlocked: number
        }[]
      }
      today_prompt: {
        Args: never
        Returns: {
          id: string
          prompt: string
        }[]
      }
      trending_hashtags: {
        Args: { _limit?: number }
        Returns: {
          display_tag: string
          post_count: number
          recent: number
          tag: string
        }[]
      }
      trending_searches: {
        Args: { _limit?: number }
        Returns: {
          growth: number
          hits: number
          term: string
        }[]
      }
      trending_topics: {
        Args: { _limit?: number }
        Returns: {
          growth: number
          kind: string
          label: string
          posts: number
          slug: string
        }[]
      }
      view_ephemeral_message: { Args: { _id: string }; Returns: string }
      watch_room_invite_preview: {
        Args: { _code: string }
        Returns: {
          category: string
          closed: boolean
          cover_url: string
          host_avatar_url: string
          host_display_name: string
          host_username: string
          id: string
          max_members: number
          member_count: number
          provider: string
          title: string
          video_id: string
          visibility: string
        }[]
      }
      weekly_friends_board: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          messages: number
          score: number
          streak: number
          user_id: string
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      call_status:
        | "ringing"
        | "accepted"
        | "rejected"
        | "ended"
        | "missed"
        | "canceled"
      call_type: "audio" | "video"
      media_type: "image" | "video" | "text"
      report_status: "pending" | "reviewed" | "dismissed" | "actioned"
      report_target:
        | "user"
        | "post"
        | "message"
        | "comment"
        | "story"
        | "live"
        | "chat"
        | "listing"
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
      app_role: ["admin", "user"],
      call_status: [
        "ringing",
        "accepted",
        "rejected",
        "ended",
        "missed",
        "canceled",
      ],
      call_type: ["audio", "video"],
      media_type: ["image", "video", "text"],
      report_status: ["pending", "reviewed", "dismissed", "actioned"],
      report_target: [
        "user",
        "post",
        "message",
        "comment",
        "story",
        "live",
        "chat",
        "listing",
      ],
    },
  },
} as const
