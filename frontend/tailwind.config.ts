import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // TACO design system
        "taco-page": "#F7F7F7",
        "taco-card": "#FFFFFF",
        "taco-border": "#E5E5E5",
        "taco-divider": "#F0F0F0",
        "taco-text": "#1A1A1A",
        "taco-sub": "#717171",
        "taco-muted": "#ADADAD",
        "taco-accent": "#F04E23",
        "taco-accent-dark": "#C93A10",
        "taco-accent-tint": "#FEF3EF",
        "taco-success": "#1D9E75",
        "taco-warning": "#E07B00",
        "taco-error": "#D0342C",
        "taco-info": "#3B7DD8",
        "taco-delta": "#22C55E",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
