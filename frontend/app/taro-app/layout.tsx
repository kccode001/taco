import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Taro Agent",
  description: "Aplikasi sales agent untuk upload invoice toko Taro",
  manifest: "/manifest-taro.json",
  appleWebApp: {
    capable: true,
    title: "Taro",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#F04E23",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function TaroAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
