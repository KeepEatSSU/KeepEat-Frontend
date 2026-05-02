# Design System Strategy: The Digital Curator



## 1. Overview & Creative North Star

The design system for this utility app is governed by the **"The Digital Curator"** North Star. We are moving beyond the traditional "food tracker" into a high-end, editorial utility experience. The goal is to make food management feel less like a chore and more like a curated inventory.



To achieve this, the system breaks away from the generic "app-on-a-grid" look. We utilize **intentional asymmetry**, high-contrast typography scales (Plus Jakarta Sans paired with Manrope), and **tonal depth**. Instead of standard dividers, we use breathing room and varying surface planes to organize information. The experience is "Eco-Editorial"—clean, professional, and sophisticated.



---



## 2. Colors: Tonal Architecture

Our color palette is rooted in the "Safety Green" heritage but evolved for premium legibility and depth.



### The "No-Line" Rule

**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning or grouping.

Boundaries must be defined solely through:

* **Background Shifts:** e.g., a `surface-container-low` (#F3F4F5) card sitting on a `surface` (#F8F9FA) background.

* **Vertical Space:** Using the spacing scale to create mental groupings.



### Surface Hierarchy & Nesting

We treat the UI as a physical stack of fine paper.

* **Base:** `surface` (#F8F9FA) is your canvas.

* **Sections:** Use `surface-container-low` (#F3F4F5) for large organizational blocks.

* **Interactive Cards:** Use `surface-container-lowest` (#FFFFFF) for elements that need to pop against the gray base. This "reverse nesting" creates a subtle, high-end lift.



### The "Glass & Gradient" Rule

To avoid a flat "utility" feel, floating elements (like Bottom Sheets or Navigation Bars) must utilize **Glassmorphism**.

* **Token:** `surface` at 80% opacity with a `20px backdrop-blur`.

* **Gradients:** Main action buttons (Primary) should utilize a subtle linear gradient from `primary` (#006D37) to `primary_container` (#2ECC71) at a 135-degree angle. This adds "soul" and prevents the Mint Green from looking washed out.



---



## 3. Typography: Editorial Authority

We use a dual-font system to balance character with utility.



* **Display & Headlines (Plus Jakarta Sans):** Used for main headings (e.g., "냉장고," "식재료 추가"). This font provides the "Modern Editorial" feel.

* *Scale:* Use `display-md` for Hero stats and `headline-sm` for section titles.

* **Body & Labels (Manrope):** Used for all functional data (e.g., "D-7," "1000ml"). Manrope’s geometric clarity ensures Korean characters remain legible even at `label-sm` (0.6875rem).

* **Hierarchy:** Maintain a 2:1 ratio in weight. If a title is Bold, the supporting body text must be Regular or Medium to create immediate visual scannability.



---



## 4. Elevation & Depth: Tonal Layering

Traditional shadows are often a sign of "template" design. In this system, we use **Tonal Layering**.



* **The Layering Principle:** Stacking `surface-container` tiers is the primary way to show importance. A "D-Day" badge (D-1) should sit on a `surface-container-high` (#E7E8E9) pill to feel integrated into the item list.

* **Ambient Shadows:** If a floating button (FAB) is required, use an extra-diffused shadow: `box-shadow: 0 12px 32px rgba(25, 28, 29, 0.06)`. This mimics soft, natural gallery lighting.

* **The "Ghost Border" Fallback:** If a container lacks contrast (e.g., a white card on a white background), use a **Ghost Border**: `outline-variant` (#BBCBBB) at **15% opacity**. Never 100%.

* **Glassmorphism:** Use for persistent UI like the bottom navigation. This allows the vibrant food list colors to bleed through, making the app feel alive and organic.



---



## 5. Components: Specialized Food-Tech Utilities



### Buttons & CTAs

* **Primary (Main Action):** Rounded-xl (0.75rem). Gradient from #006D37 to #2ECC71. Text: `title-sm` white (#FFFFFF).

* **Secondary (Adjustments):** e.g., the "+1일" or "-50ml" buttons. Use `secondary-container` (#B5F1C0) with `on-secondary-container` (#396F48) text. No borders.



### Inventory Cards

* **The List Item:** Forbid divider lines. Instead, use a `surface-container-lowest` card with `xl` (0.75rem) rounded corners.

* **Status Indicators:** Use the "Safety Green" for fresh items and `error` (#BA1A1A) for expiring items. Use a circle icon (as seen in references) but soften the color to a 10% opacity background of the same hue to create a "glow" effect.



### Chips (Category Selectors)

* **Unselected:** `surface-container-high` background, no border.

* **Selected:** `primary` background with `on-primary` text. Use `sm` (0.125rem) roundedness for a sharper, more organized look compared to the "pill" shape of buttons.



### Value Steppers

* For modifying quantity (e.g., 1000ml), use large, bold `headline-md` typography. Place the "- " and " +" controls on either side using `surface-variant` backgrounds to create a clear "Control Center" feel for that specific item.



---



## 6. Do's and Don'ts



### Do

* **DO** use Korean typography with generous tracking (-0.02em) to ensure high-end readability.

* **DO** use "Safety Green" (#2ECC71) sparingly as a "reward" color for active states.

* **DO** leave ample white space between list items (at least 16px) to maintain the "organized" brand pillar.

* **DO** use lowercase English for labels (e.g., "d-day") if it fits the editorial aesthetic, but keep core instructions in Korean.



### Don'ts

* **DON'T** use 1px solid black or grey lines. This is a "No-Line" system.

* **DON'T** use the default Material Design shadow. It's too heavy for a "fresh and clean" food-tech app.

* **DON'T** use pure black (#000000) for text. Use `on-surface` (#191C1D) to maintain a soft, premium contrast.

* **DON'T** use sharp 0px corners. Everything must have at least a `DEFAULT` (0.25rem) radius to feel approachable and eco-friendly.



---



*This document serves as the single source of truth for the digital visual language of the application.*