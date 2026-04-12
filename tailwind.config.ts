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
        // Brand palette — Nutravoe
        sage: {
          DEFAULT: "#C4A574", // Muted Gold — accent / CTA
          light: "#DBC99A",
          dark: "#9A7B4A",
        },
        terracotta: {
          DEFAULT: "#9A7B4A", // Deeper gold — secondary actions
          light: "#C4A574",
          dark: "#6E5530",
        },
        ink: "#2C2C2C",       // Off Black — text / borders
        stone: "#A39888",     // Stone — body text
        cream: "#FAF9F6",     // Off White — primary BG
        beige: "#E8E3DA",     // Warm Beige — secondary BG
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
