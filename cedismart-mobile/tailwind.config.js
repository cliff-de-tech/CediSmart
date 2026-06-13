/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0A6E4A", // deep emerald green
        accent: "#F5A623",  // warm amber/gold
        background: "#F8F9FA",
        surface: "#FFFFFF",
        charcoal: "#1C1C2E",
        error: "#DC2626",
        success: "#16A34A",
        warning: "#D97706",
      },
    },
  },
  plugins: [],
}
