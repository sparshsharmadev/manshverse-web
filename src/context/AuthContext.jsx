import { createContext, useEffect, useState } from "react";
import { auth } from "../lib/supabaseAuth";
import { supabaseConfigured } from "../supabase";
import { onAuthStateChanged } from "../lib/supabaseAuth";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser ? {
        ...currentUser,
        uid: currentUser.id,
        displayName: currentUser.user_metadata?.display_name || currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "User",
        photoURL: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || "",
        emailVerified: Boolean(currentUser.email_confirmed_at),
        providerData: [{ providerId: currentUser.app_metadata?.provider || "email" }],
      } : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return null;
  if (!supabaseConfigured) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#050508", color: "#fff", fontFamily: "Manrope, sans-serif" }}>
        <section style={{ maxWidth: 520, lineHeight: 1.7 }}>
          <h1 style={{ marginBottom: 12 }}>Connect Manshverse to Supabase</h1>
          <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your local <code>.env</code>, then run the SQL migration in the Supabase SQL Editor.</p>
        </section>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
}
