import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0a0e14", panel: "#0f1620", raised: "#141d29", border: "#1f2b3a" },
        brand: "#22d3ee",
        alive: "#34d399",
        notice: "#fbbf24",
        handover: "#fb923c",
        sweep: "#f87171",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,211,238,0.35), 0 0 28px -6px rgba(34,211,238,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
