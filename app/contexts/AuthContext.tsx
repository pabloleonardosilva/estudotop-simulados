"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase/client";

type UserRole = "admin" | "student";

type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  avatar_url: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isMissingAvatarColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || error.message?.includes("avatar_url") || error.message?.includes("schema cache");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionUserIdRef = useRef<string | null>(null);
  const profileRef = useRef<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, must_change_password, avatar_url")
      .eq("id", userId)
      .single();

    if (isMissingAvatarColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active, must_change_password")
        .eq("id", userId)
        .single();

      if (fallbackError || !fallbackData) {
        setProfile(null);
        return;
      }

      setProfile({ ...(fallbackData as Omit<Profile, "avatar_url">), avatar_url: null });
      return;
    }

    if (error || !data) {
      setProfile(null);
      return;
    }

    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }, [loadProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    sessionUserIdRef.current = session?.user?.id ?? null;
  }, [session]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(data.session);

      if (data.session?.user?.id) {
        await loadProfile(data.session.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    }

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, newSession) => {
      const newUserId = newSession?.user?.id ?? null;
      const currentUserId = sessionUserIdRef.current;
      const currentProfile = profileRef.current;
      const isSameLoadedUser = Boolean(
        newUserId && currentUserId === newUserId && currentProfile?.id === newUserId,
      );

      setSession(newSession);

      if (event === "SIGNED_OUT" || !newUserId) {
        setProfile(null);
        setLoading(false);
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        return;
      }

      // O Supabase pode emitir SIGNED_IN/INITIAL_SESSION novamente quando a aba
      // volta a ficar ativa. Se for o mesmo usuario e o perfil ja estiver carregado,
      // nao colocamos o AppShell em loading, pois isso desmonta a pagina atual.
      if (isSameLoadedUser) {
        setLoading(false);
        return;
      }

      // O Supabase pode emitir INITIAL_SESSION/SIGNED_IN antes de o perfil terminar
      // de carregar. Mantemos o shell em loading apenas enquanto uma tentativa real
      // de carregar o perfil estiver em andamento.
      setLoading(true);
      window.setTimeout(() => {
        void (async () => {
          await loadProfile(newUserId);
          if (mounted) setLoading(false);
        })();
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
