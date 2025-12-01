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
        dark: '#0B0B0E',
        black: '#000000',
        'brand-purple': '#5b1e8a',
        'brand-purple-hover': '#7025aa',
        surface: {
          DEFAULT: '#111111',
          hover: '#1A1A1A',
          border: '#333333'
        },
        text: {
          main: '#FFFFFF',
          muted: '#A1A1AA'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
