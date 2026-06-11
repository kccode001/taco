"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { authLogin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authLogin(email, password);
      const { access_token, user } = res.data;
      setAuth(user, access_token);
      routeByRole(user.role);
    } catch {
      setError("Email atau password salah. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const routeByRole = (role: string) => {
    if (role === "rep") router.push("/app");
    else if (role === "manager") router.push("/dashboard");
    else if (role === "taro_agent") router.push("/taro-app/home");
    else router.push("/admin");
  };

  /** Fallback session for taro_agent when Core hasn't seeded the role yet.
   *  Mints a mock user + sentinel token so the PWA renders end-to-end. */
  const taroAgentFallback = (asEmail: string) => {
    // Map demo emails → ASM area display.
    const map: Record<string, { name: string; region_code: string; region_display: string; region_id: string; phone: string }> = {
      "taro1@taco.id": {
        name: "Rian Pratama",
        region_code: "J-BU1-ASM-JKT1",
        region_display: "J - BU1 - ASM Jakarta 1",
        region_id: "area-w-jkt-s",
        phone: "+62 812-3456-7891",
      },
      "taro2@taco.id": {
        name: "Citra Lestari",
        region_code: "C-BU1-ASM-BDG",
        region_display: "C - BU1 - ASM Bandung",
        region_id: "area-c-bdg",
        phone: "+62 813-4567-8902",
      },
    };
    const meta = map[asEmail] ?? map["taro1@taco.id"];
    return {
      access_token: "demo-taro-" + asEmail,
      user: {
        id: "taro-demo-" + asEmail,
        name: meta.name,
        email: asEmail,
        phone: meta.phone,
        role: "taro_agent" as const,
        region_id: meta.region_id,
        region_code: meta.region_code,
        region_display: meta.region_display,
      },
    };
  };

  const demoLogin = async (
    asEmail: string,
    /** Override the post-login destination — used by the "Taro Dashboard"
     *  demo button so admin lands on /taro/dashboard instead of /admin. */
    targetOverride?: string
  ) => {
    setError("");
    setLoading(true);
    const isTaroAgent = asEmail.startsWith("taro");
    try {
      const res = await authLogin(asEmail, "password123");
      const { access_token, user } = res.data;
      setAuth(user, access_token);
      if (targetOverride) {
        router.push(targetOverride);
        return;
      }
      routeByRole(user.role);
    } catch {
      if (isTaroAgent) {
        // Core hasn't seeded taro_agent yet — fall back to local mock session.
        const { access_token, user } = taroAgentFallback(asEmail);
        setAuth(user, access_token);
        router.push(targetOverride ?? "/taro-app/home");
        return;
      }
      setError("Demo login gagal — backend belum siap?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-taco-page flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-[390px]">
        <div className="flex justify-center mb-10">
          <img
            src="https://manage.taco.co.id/asset-images/logo.svg"
            alt="TACO"
            className="h-10"
          />
        </div>

        <div className="bg-white rounded-2xl border border-taco-border p-6">
          <h1 className="text-[20px] font-semibold text-taco-text mb-1">
            Masuk ke TACO AI
          </h1>
          <p className="text-[14px] text-taco-sub mb-6">
            Platform intelijen penjualan lapangan
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[14px] font-medium text-taco-sub mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@taco.co.id"
                required
                className="w-full h-[52px] border border-taco-border rounded-lg px-4 text-[16px] text-taco-text bg-white outline-none focus:border-taco-accent placeholder:text-taco-muted"
              />
            </div>

            <div>
              <label className="block text-[14px] font-medium text-taco-sub mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-[52px] border border-taco-border rounded-lg px-4 text-[16px] text-taco-text bg-white outline-none focus:border-taco-accent placeholder:text-taco-muted"
              />
            </div>

            {error && (
              <div className="text-[14px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[56px] bg-taco-accent text-white font-semibold text-[16px] rounded-xl disabled:bg-taco-muted transition-colors hover:bg-taco-accent-dark"
            >
              {loading ? "Masuk…" : "Masuk"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-taco-divider">
            <p className="text-[12px] text-taco-muted text-center mb-3 uppercase tracking-wide font-medium">Demo — Masuk Langsung</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => demoLogin("rep@taco.id")}
                disabled={loading}
                className="w-full h-[52px] bg-white border-2 border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-accent-tint text-taco-accent text-[12px] font-bold">R</span>
                <span>Sales Rep (Sari Dewi)</span>
              </button>
              <button
                type="button"
                onClick={() => demoLogin("manager@taco.id")}
                disabled={loading}
                className="w-full h-[52px] bg-white border-2 border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-accent-tint text-taco-accent text-[12px] font-bold">M</span>
                <span>Manager (Budi Santoso)</span>
              </button>
              <button
                type="button"
                onClick={() => demoLogin("admin@taco.id")}
                disabled={loading}
                className="w-full h-[52px] bg-white border-2 border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-accent-tint text-taco-accent text-[12px] font-bold">A</span>
                <span>Admin TACO</span>
              </button>
              <button
                type="button"
                onClick={() => demoLogin("admin@taco.id", "/taro/dashboard")}
                disabled={loading}
                className="w-full h-[52px] bg-white border border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-text transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-page text-taco-sub text-[12px] font-bold border border-taco-border">TD</span>
                <span>Taro Dashboard →</span>
              </button>
              <button
                type="button"
                onClick={() => demoLogin("taro1@taco.id", "/taro-app")}
                disabled={loading}
                className="w-full h-[52px] bg-white border border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-text transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-page text-taco-sub text-[12px] font-bold border border-taco-border">PWA</span>
                <span>Taro Sales Agent (PWA)</span>
              </button>
              <button
                type="button"
                onClick={() => demoLogin("admin@taco.id", "/taro/v2/dashboard")}
                disabled={loading}
                className="w-full h-[52px] bg-white border border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-text transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-page text-taco-sub text-[12px] font-bold border border-taco-border">V2</span>
                <span>V2 Dashboard →</span>
              </button>
              <button
                type="button"
                onClick={() => demoLogin("taro1@taco.id", "/taro-app/v2/upload")}
                disabled={loading}
                className="w-full h-[52px] bg-white border border-taco-border rounded-xl text-[15px] font-semibold text-taco-text hover:border-taco-text transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-taco-page text-taco-sub text-[12px] font-bold border border-taco-border">V2</span>
                <span>V2 Upload (PWA) →</span>
              </button>
            </div>
            <p className="text-[11px] text-taco-muted text-center mt-3">
              Manual: gunakan <code className="text-taco-text">rep@taco.id</code> · <code className="text-taco-text">manager@taco.id</code> · <code className="text-taco-text">admin@taco.id</code> · <code className="text-taco-text">taro1@taco.id</code> dengan password <code className="text-taco-text">password123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
