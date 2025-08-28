"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  const emailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("Sending magic link…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMsg(error ? `Error: ${error.message}` : "Check your email for the link.");
  };

  const githubLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg(`Error: ${error.message}`);
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: 360, display: "grid", gap: 12 }}>
        <h1>Sign in</h1>
        <form onSubmit={emailLogin} style={{ display: "grid", gap: 8 }}>
          <input
            type="email"
            placeholder="you@vitaltrace.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
            required
          />
          <button type="submit" style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}>
            Send magic link
          </button>
        </form>
        <button onClick={githubLogin} style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}>
          Continue with GitHub
        </button>
        {msg && <p style={{ color: "#666" }}>{msg}</p>}
      </div>
    </main>
  );
}
