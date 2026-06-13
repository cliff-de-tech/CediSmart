/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0d631b",
        "primary-container": "#2e7d32",
        secondary: "#4c56af",
        tertiary: "#993300",
        surface: "#fdf8fd",
        "surface-container-low": "#f7f2f8",
        "surface-container-lowest": "#ffffff",
        "on-surface": "#1c1b1f",
        "on-surface-variant": "#40493d",
        "outline-variant": "#bfcaba",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
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
