"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const { user, token } = useAuthStore();

  useEffect(() => {
    if (!token || !user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role === "rep") {
      router.replace("/app/stores");
    } else if (user.role === "manager") {
      router.replace("/dashboard");
    } else if (user.role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/auth/login");
    }
  }, [token, user, router]);

  return (
    <div className="min-h-screen bg-taco-page flex items-center justify-center">
      <img
        src="https://manage.taco.co.id/asset-images/logo.svg"
        alt="TACO"
        className="h-8 opacity-40"
      />
    </div>
  );
}
