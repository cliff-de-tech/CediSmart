# Design System Specification: High-End Editorial Fintech

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Sovereign Ledger."** 

Moving away from the cluttered, "utility-first" look of traditional banking apps, this system adopts a high-end editorial aesthetic. It treats a user's financial data with the same reverence as a luxury magazine or a premium architectural portfolio. By utilizing intentional asymmetry, expansive whitespace, and a sophisticated "layered glass" metaphor, we establish a sense of calm authority. We break the "template" look by prioritizing tonal depth over rigid borders, ensuring the experience feels bespoke, premium, and inherently trustworthy for the Ghanaian market.

## 2. Colors & Surface Philosophy
The palette is rooted in the "Success Green" of growth and the "Deep Navy" of institutional stability, but refined through Material 3 tonal logic.

### Core Palette (Tonal Tokens)
*   **Primary (Growth):** `#0d631b` (on-primary: `#ffffff`) — Use for high-emphasis actions.
*   **Secondary (Trust):** `#4c56af` (on-secondary: `#ffffff`) — Use for professional reinforcement.
*   **Tertiary (Heritage):** `#993300` (on-tertiary: `#ffffff`) — A sophisticated burnt earth tone inspired by Ghanaian pottery, used for subtle accents.
*   **Surface Base:** `#fdf8fd` — A crisp, warm-white baseline.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning. 
Boundaries must be defined solely through background color shifts or subtle tonal transitions. Use `surface_container_low` (f7f2f8) sitting on a `surface` (fdf8fd) background to create separation. This ensures the UI feels like a continuous, fluid environment rather than a series of disconnected boxes.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine paper or frosted glass.
*   **Level 0 (Background):** `surface`
*   **Level 1 (Sectioning):** `surface_container_low`
*   **Level 2 (Active Cards):** `surface_container_highest`
*   **Level 3 (Modals/Floating):** `surface_bright`

### The "Glass & Gradient" Rule
To elevate the "Success Green" beyond a flat hex code, apply subtle linear gradients transitioning from `primary` (#0d631b) to `primary_container` (#2e7d32). For floating elements (e.g., Quick Action buttons), use **Glassmorphism**: semi-transparent surface colors with a `backdrop-blur` of 20px to allow financial data to peak through softly.

## 3. Typography: Editorial Authority
We use a dual-font strategy to balance character with readability.

*   **Display & Headlines (Manrope):** A modern geometric sans-serif with excellent legibility. Used for large balances and section titles to convey a bold, editorial feel.
    *   *Headline-LG:* 2rem / Bold / -0.02em tracking.
*   **Body & Labels (Inter):** The workhorse of the system. Used for all transactional data and micro-copy. Inter’s tall x-height ensures clarity on small mobile screens.
    *   *Body-MD:* 0.875rem / Regular / 1.5x leading for breathability.

**Hierarchy Note:** Always pair a `headline-md` (Manrope) with a `label-md` (Inter) in all-caps with 0.05em letter spacing for an "authoritative header" look.

## 4. Elevation & Depth (Tonal Layering)
We achieve hierarchy through **Tonal Layering** rather than structural lines.

*   **The Layering Principle:** Place a `surface_container_lowest` (#ffffff) card on a `surface_container_low` (#f7f2f8) background. This creates a "soft lift" that feels natural and premium.
*   **Ambient Shadows:** For floating elements, use shadows with a blur value of 32px and 4% opacity. The shadow color must be a tinted version of `on_surface` (#1c1b1f) to mimic natural light.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in input fields, use `outline_variant` at **20% opacity**. Never use a 100% opaque border.

## 5. Components

### Buttons (The "Call to Growth")
*   **Primary:** A gradient-fill using `primary` to `primary_container`. Border-radius: `xl` (0.75rem). High-contrast white text.
*   **Secondary:** No background. A `ghost-border` (20% opacity outline) with `primary` text.
*   **Sizing:** Minimum height of 56px (Spacing Scale 10) to ensure high touch-accuracy for mobile-first React Native implementation.

### Cards & Lists (The Ledger View)
*   **Forbid Dividers:** Do not use lines to separate list items. Use a `3.5` (1.2rem) vertical spacing gap.
*   **Styling:** Cards should use `surface_container_lowest` with a `lg` (0.5rem) roundedness. 
*   **Ghanaian Context:** Subtle use of Adinkra-inspired geometric patterns (e.g., *Sankofa*) can be used as a low-opacity (5%) watermark background on high-value "Total Balance" cards.

### Input Fields (Fintech-Ready)
*   **Structure:** Floating labels using `label-md`. 
*   **Phone Prefix:** Explicitly include a fixed prefix container (+233) styled in `secondary_container` with `on_secondary_container` text to provide immediate local context.
*   **States:** Error states use `error` (#ba1a1a) text with a `error_container` soft background fill—never just a red border.

### Value Chips
*   **Usage:** For budget categories (Rent, Food, Transport).
*   **Style:** Pill-shaped (`full` roundedness). Use `secondary_fixed_dim` for a muted, professional appearance that doesn't compete with the Primary CTA.

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical margins (e.g., Spacing 8 on the left, Spacing 6 on the right) for headline typography to create an editorial rhythm.
*   **Do** use `primary_fixed_dim` for background fills on success states to keep the green professional rather than neon.
*   **Do** prioritize "Negative Space." If a screen feels crowded, increase spacing to the next tier in the scale (e.g., move from 5 to 6).

### Don’t:
*   **Don’t** use pure black (#000000) for text. Always use `on_surface` (#1c1b1f) to maintain a premium, ink-on-paper feel.
*   **Don’t** use standard "Drop Shadows." Only use the Ambient Shadow specification defined in Section 4.
*   **Don’t** use icons without labels in the bottom navigation. Accessibility and trust are paramount in the GHS context.

## 7. Spacing & Grid
This system operates on a base-4 modular scale, but we utilize the following specific tokens for layout consistency:
*   **Gutter (Screen Edge):** `5` (1.7rem)
*   **Component Gap:** `3` (1rem)
*   **Section Break:** `8` (2.75rem)