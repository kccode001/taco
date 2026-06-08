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
      if (user.role === "rep") {
        router.push("/app");
      } else if (user.role === "manager") {
        router.push("/dashboard");
      } else {
        router.push("/admin");
      }
    } catch {
      setError("Email atau password salah. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async (asEmail: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await authLogin(asEmail, "password123");
      const { access_token, user } = res.data;
      setAuth(user, access_token);
      if (user.role === "rep") router.push("/app");
      else if (user.role === "manager") router.push("/dashboard");
      else router.push("/admin");
    } catch {
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
            </div>
            <p className="text-[11px] text-taco-muted text-center mt-3">
              Manual: gunakan <code className="text-taco-text">rep@taco.id</code> · <code className="text-taco-text">manager@taco.id</code> · <code className="text-taco-text">admin@taco.id</code> dengan password <code className="text-taco-text">password123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
