import type { Config } from "tailwindcss";

/**
 * Palette: warm, organic, low-chroma.
 *
 * `ink` is a warm stone/taupe ramp rather than a blue-grey — it's what stops
 * the whole app reading as cold. `brand` is sage. `clay`, `moss`, `ochre` and
 * `rust` carry status so nothing has to reach for a candy-bright default
 * Tailwind hue, which is what made the first pass look like a dashboard
 * template.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm stone — text, surfaces, borders
        ink: {
          50: "#faf8f4",
          100: "#f1ede5",
          200: "#e2dbce",
          300: "#c6bcaa",
          400: "#a09682",
          500: "#7f7564",
          600: "#655c4e",
          700: "#50483b",
          800: "#3b352b",
          900: "#28231a",
        },
        // Sage — primary actions, active nav
        brand: {
          50: "#f3f6f0",
          100: "#e4ebdd",
          200: "#cad8bf",
          300: "#a9bf98",
          400: "#8ba577",
          500: "#718c5c",
          600: "#5a7149",
          700: "#475a3b",
          800: "#3a4931",
          900: "#313c2b",
        },
        // Organic brown / terracotta — secondary accent
        clay: {
          50: "#faf5ef",
          100: "#f3e8d9",
          200: "#e7cfb4",
          300: "#d6ae87",
          400: "#c48d5f",
          500: "#ad7247",
          600: "#8e5c39",
          700: "#724a30",
          800: "#5c3c2a",
          900: "#4b3224",
        },
        // Deep green — done, verified, healthy
        moss: {
          50: "#f0f5f0",
          100: "#dceadd",
          200: "#bad7c0",
          300: "#8fbb9b",
          400: "#659b75",
          500: "#4a7f5b",
          600: "#3a6649",
          700: "#30523c",
          800: "#294232",
          900: "#23372b",
        },
        // Ochre — attention, pending, carried
        ochre: {
          50: "#fbf6ea",
          100: "#f5ead0",
          200: "#ead3a1",
          300: "#dcb66b",
          400: "#cb9b43",
          500: "#b2822f",
          600: "#8f6726",
          700: "#735322",
          800: "#5e4421",
          900: "#4e391f",
        },
        // Muted brick — urgent, blocked, overdue
        rust: {
          50: "#fcf3f0",
          100: "#f8e3dd",
          200: "#f0c6bb",
          300: "#e19e8d",
          400: "#cf725b",
          500: "#b8513a",
          600: "#9a3e2c",
          700: "#7d3326",
          800: "#682d23",
          900: "#592921",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        // Warm-tinted rather than neutral black, so cards sit on the paper
        // background instead of floating above it.
        sm: "0 1px 2px 0 rgb(80 72 59 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(80 72 59 / 0.08), 0 1px 2px -1px rgb(80 72 59 / 0.06)",
        md: "0 4px 10px -2px rgb(80 72 59 / 0.09), 0 2px 4px -2px rgb(80 72 59 / 0.05)",
        lg: "0 10px 20px -4px rgb(80 72 59 / 0.10), 0 4px 8px -4px rgb(80 72 59 / 0.06)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
