import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        register: { DEFAULT: "#0B3D2E", light: "#12513D", dark: "#082A20" },
        brass: { DEFAULT: "#C7973B", light: "#E0B968", dark: "#9C7526" },
        paper: { DEFAULT: "#FAF8F3", dim: "#F1EEE5" },
        ink: { DEFAULT: "#1C1B18", soft: "#5B584E" },
        alert: "#B3412C",
        teal: "#1D7A73",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
