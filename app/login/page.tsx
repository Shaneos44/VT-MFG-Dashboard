"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const PUBLIC_DOMAIN = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "vitaltrace.com.au").toLowerCase();

export default function LoginPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validateDomain = (addr: string) => {
    const domain = (addr.split("@")[1] || "").toLowerCase();
    return domain === PUBLIC_DOMAIN;
  };

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!validateDomain(email)) {
      setMsg(`Email must be @${PUBLIC_DOMAIN}`);
      return;
    }
    if (!password || password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }

    try {
      setBusy(true);
      // 1) Create the user on the server (domain enforced)
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Signup failed");
      }

      // 2) Instant sign-in
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      window.location.href = "/";
    } catch (err: any) {
      setMsg(err?.message || "Unexpected error during signup");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!validateDomain(email)) {
      setMsg(`Email must be @${PUBLIC_DOMAIN}`);
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // If user not found, offer to sign up
        if (String(error.message).toLowerCase().includes("invalid login credentials")) {
          setMode("signup");
          setMsg("No account found. Create one?");
          return;
        }
        throw error;
      }
      window.location.href = "/";
    } catch (err: any) {
      setMsg(err?.message || "Unexpected error during sign-in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: 380, display: "grid", gap: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Sign in to VitalTrace</h1>
        <p style={{ color: "#666" }}>Domain restricted • @{PUBLIC_DOMAIN}</p>

        <form onSubmit={mode === "signin" ? handleSignin : handleSignup} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            placeholder={`you@${PUBLIC_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            required
          />
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            required
          />

          <button
            type="submit"
            disabled={busy}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", fontWeight: 600 }}
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMsg(null);
          }}
          style={{ padding: 10, borderRadius: 8, border: "1px dashed #bbb" }}
        >
          {mode === "signin" ? "Create a new account" : "Already have an account? Sign in"}
        </button>

        {msg && <p style={{ color: "#b00" }}>{msg}</p>}
      </div>
    </main>
  );
}
