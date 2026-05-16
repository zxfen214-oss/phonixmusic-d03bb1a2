import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const OFFLINE_USER_STORAGE_KEY = "phonix.offline-auth-user";

type OfflineUserSnapshot = Pick<
  User,
  "id" | "email" | "aud" | "created_at" | "user_metadata" | "app_metadata"
>;

function readOfflineUserSnapshot(): User | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(OFFLINE_USER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as OfflineUserSnapshot;
    if (!parsed?.id) return null;

    return parsed as User;
  } catch {
    return null;
  }
}

function writeOfflineUserSnapshot(user: User | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    window.localStorage.removeItem(OFFLINE_USER_STORAGE_KEY);
    return;
  }

  const snapshot: OfflineUserSnapshot = {
    id: user.id,
    email: user.email,
    aud: user.aud,
    created_at: user.created_at,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
  };

  window.localStorage.setItem(OFFLINE_USER_STORAGE_KEY, JSON.stringify(snapshot));
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, displayName?: string, club?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAdminRole = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'admin'
      });
      
      if (!error && data) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let settled = false;
    const getOfflineSnapshot = () => readOfflineUserSnapshot();

    const finish = () => {
      if (settled) return;
      settled = true;
      setIsLoading(false);
    };

    const applyAuthenticatedState = (nextSession: Session) => {
      setSession(nextSession);
      setUser(nextSession.user);
      writeOfflineUserSnapshot(nextSession.user);
      finish();

      setTimeout(() => {
        checkAdminRole(nextSession.user.id);
      }, 0);
    };

    const applyOfflineSnapshot = () => {
      const offlineSnapshot = getOfflineSnapshot();
      if (!offlineSnapshot) return false;
      setSession(null);
      setUser(offlineSnapshot);
      setIsAdmin(false);
      finish();
      return true;
    };

    const clearAuthenticatedState = () => {
      setSession(null);
      setUser(null);
      setIsAdmin(false);
      writeOfflineUserSnapshot(null);
      finish();
    };

    // Hard safety net: never let the app hang on auth bootstrap.
    // If we're offline OR Supabase auth refresh stalls, release loading after 2.5s.
    const offlineFast = typeof navigator !== "undefined" && navigator.onLine === false;
    const safetyTimer = setTimeout(finish, offlineFast ? 300 : 2500);

    if (offlineFast && getOfflineSnapshot()) {
      applyOfflineSnapshot();
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

        if (session?.user) {
          applyAuthenticatedState(session);
          return;
        }

        // When offline, keep the last known user snapshot instead of treating
        // auth refresh failures as a real sign-out.
        if (isOffline && applyOfflineSnapshot()) {
          return;
        }

        // Ignore optimistic refresh/sign-out clears while connectivity is shaky.
        if (isOffline && (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED")) {
          applyOfflineSnapshot();
          return;
        }

        clearAuthenticatedState();
      }
    );

    // THEN check for existing session — but never await forever when offline.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          applyAuthenticatedState(session);
          return;
        }

        if (applyOfflineSnapshot()) return;

        clearAuthenticatedState();
      })
      .catch(() => {
        if (applyOfflineSnapshot()) return;
        finish();
      });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName?: string, club?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
          club: club,
        },
      },
    });

    // Save club to profiles after signup
    if (!error && club) {
      // The profile is created by the handle_new_user trigger, update club after
      setTimeout(async () => {
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase.from('profiles').update({ club }).eq('id', newUser.id);
        }
      }, 1000);
    }
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    writeOfflineUserSnapshot(null);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAdmin,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
