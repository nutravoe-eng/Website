import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        white: "#FFFFFF",
        sage: {
          DEFAULT: "#7D9B76",
          light: "#B8CDB4",
          dark: "#4E6B49",
        },
        terracotta: {
          DEFAULT: "#C4714A",
          light: "#E8B49A",
          dark: "#8C4A2F",
        },
        ink: "#1C1C1A",
        stone: "#9A9590",
        cream: "#FDFCFA",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      transitionTimingFunction: {
        gentle: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
