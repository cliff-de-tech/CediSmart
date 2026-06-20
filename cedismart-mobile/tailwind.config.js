/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0d631b",
        "primary-container": "#2e7d32",
        secondary: "#4c56af",
        tertiary: "#993300",
        surface: "#fdf8fd",
        background: "#f5f8f5",
        "surface-container-low": "#f7f2f8",
        "surface-container-lowest": "#ffffff",
        "on-surface": "#1c1b1f",
        "on-surface-variant": "#40493d",
        "outline-variant": "#bfcaba",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
        charcoal: "#1c221e",
        success: "#16a34a",
        // Dark theme color tokens
        "dark-surface": "#0c100c",
        "dark-background": "#080a08",
        "dark-surface-container-low": "#121613",
        "dark-surface-container-lowest": "#181e19",
        "dark-on-surface": "#e1e3e0",
        "dark-on-surface-variant": "#b2b6b1",
        "dark-outline-variant": "#434942",
        "dark-charcoal": "#ffffff",
      },
      fontFamily: {
        headline: ["System"], // Fallback to System for now
        body: ["System"],
        label: ["System"],
      },
    },
  },
  plugins: [],
}
