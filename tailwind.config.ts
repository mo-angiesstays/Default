import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d4d9e2",
          300: "#aeb7c8",
          400: "#8290a9",
          500: "#61708d",
          600: "#4c5a74",
          700: "#3f4a5e",
          800: "#373f50",
          900: "#141a24",
        },
        brand: {
          50: "#eef6ff",
          100: "#d9ecff",
          200: "#bcdeff",
          300: "#8ec9ff",
          400: "#59aaff",
          500: "#3388fb",
          600: "#1c69f0",
          700: "#1553dc",
          800: "#1845b2",
          900: "#1a3d8c",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
