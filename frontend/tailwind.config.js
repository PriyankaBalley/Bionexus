/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // "Chromatogram" — slate ink on a cool, faintly grey-blue ground, with
      // a single muted teal accent, in the spirit of a Sanger trace read at
      // low gain. `zinc` is overridden (not just `brand`) so every existing
      // text-zinc-*/border-zinc-*/bg-zinc-* class across the app picks up
      // the same cool cast without touching each page file individually.
      colors: {
        zinc: {
          50:  "#f4f5f6",
          100: "#e9ebec",
          200: "#dde1e3",
          300: "#c7cdd0",
          400: "#9aa4a8",
          500: "#798388",
          600: "#5c6a70",
          700: "#46535a",
          800: "#2e373c",
          900: "#1b2226",
        },
        brand: {
          50:  "#eef8f6",
          100: "#d6efe9",
          500: "#2b9186",
          600: "#1f7a72",
          700: "#185f59",
          900: "#0e332f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
