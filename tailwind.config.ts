import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: "rgb(18,19,22)",
        surface: "rgb(28,29,33)",
        text: {
          DEFAULT: "rgb(232,234,237)",
          muted: "rgb(144,148,160)"
        },
        accent: "hsl(265,85%,60%)"
      },
      borderRadius: { xl: "1rem" },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulse_dot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        favPulse: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fadeIn var(--duration-normal) var(--ease-out) both",
        "fade-in-up": "fadeInUp var(--duration-normal) var(--ease-out) both",
        "scale-in": "scaleIn var(--duration-normal) var(--ease-out) both",
        "slide-down": "slideDown var(--duration-normal) var(--ease-out) both",
        "slide-up": "slideUp var(--duration-slow) var(--ease-out) both",
        "pulse-dot": "pulse_dot 2s ease-in-out infinite",
        "fav-pulse": "favPulse 300ms var(--ease-bounce)",
      },
    }
  },
  plugins: []
} satisfies Config;
