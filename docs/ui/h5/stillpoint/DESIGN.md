# Design System Document: Quiet & Trustworthy Editorial

## 1. Overview & Creative North Star
**The Creative North Star: "The Mindful Observer"**

This design system is built to facilitate psychological safety. In an internal anonymous Q&A environment, the interface must never feel like a "database" or a "corporate portal." Instead, it should feel like a high-end, minimalist editorial journal—a place of reflection and quiet confidence.

We move beyond standard UI by rejecting the "grid-of-boxes" mentality. By utilizing **intentional asymmetry**, **tonal layering**, and **expansive white space**, we create a sense of calm authority. This system doesn't scream for attention; it waits patiently for the user's input, ensuring that the "Trustworthy" tone is felt through the restraint of the layout rather than the presence of decorative elements.

---

## 2. Colors & Surface Philosophy
The palette is rooted in soft, natural tones that mimic high-quality paper and organic minerals. 

### The "No-Line" Rule
To maintain a "non-confrontational" tone, **1px solid borders are strictly prohibited** for sectioning. Structural boundaries must be defined exclusively through background color shifts or subtle tonal transitions. For example, a `surface-container-low` (#f2f4f2) section should sit on a `surface` (#f9f9f7) background to create a soft, edge-less transition.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, fine-paper sheets. 
- **Base Layer:** `surface` (#f9f9f7)
- **Content Blocks:** `surface-container` (#ecefec) or `surface-container-low` (#f2f4f2)
- **Active Interactions:** `surface-container-highest` (#dee4e0)

### The Glass & Signature Texture
- **Glassmorphism:** For floating headers or fixed bottom button bars, use `surface` at 85% opacity with a `backdrop-blur` of 12px. This prevents the "pasted-on" look and integrates the element into the environment.
- **Subtle Gradients:** Main CTAs should avoid flat fills. Use a soft linear gradient from `primary` (#48626e) to `primary-dim` (#3c5662) at a 15-degree angle to provide a "velvet" tactile feel.

---

## 3. Typography: Editorial Authority
We utilize a pairing of **Manrope** (Display/Headline) for a modern, geometric clarity and **Work Sans** (Body/Labels) for its exceptional readability and friendly, humanist touch.

- **Display & Headlines:** Use `display-md` (2.75rem) with `headline-sm` (1.5rem) to create a clear, non-aggressive hierarchy. The ample line-height in the `headline` scale ensures that even long questions feel approachable.
- **Body Text:** All body copy should use `body-lg` (1rem) with a line-height of 1.6 to ensure a relaxed reading pace.
- **Identity Through Type:** The contrast between the charcoal `on-surface` (#2d3432) and the off-white backgrounds provides "Quiet Authority"—it is highly legible but lacks the harshness of pure black-on-white.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "digital" for this system. We use **Tonal Layering** to convey importance.

- **The Layering Principle:** Place a `surface-container-lowest` card (#ffffff) on a `surface-container-low` (#f2f4f2) background. This creates a soft, natural "lift" that feels physical rather than programmed.
- **Ambient Shadows:** If a card must float (e.g., a modal), use a shadow tinted with the `on-surface` color: `rgba(45, 52, 50, 0.06)` with a 32px blur and 8px Y-offset.
- **Ghost Borders:** If accessibility requires a stroke, use `outline-variant` (#adb3b0) at **15% opacity**. Never use 100% opaque borders.

---

## 5. Components

### Cards & Question Selectors
- **Rules:** Forbid divider lines. Use `spacing-6` (2rem) between cards.
- **Styling:** Use `rounded-md` (0.75rem). The background should be `surface-container-lowest` (#ffffff).
- **Interactions:** On hover, shift the background to `secondary-container` (#d1e8dd) slightly. No "pop-up" animations; use a 300ms ease-in-out opacity fade.

### Fixed Primary Buttons
- **Positioning:** Fixed to the bottom of the viewport using a "Glassmorphism" container (see Section 2).
- **Styling:** `primary` (#48626e) fill, `on-primary` (#eff9ff) text. `rounded-full` (9999px) to maximize the "soft" feel.
- **Padding:** Use `spacing-4` (1.4rem) horizontal and `spacing-3` (1rem) vertical.

### Input Fields & Text Areas
- **Philosophy:** Inputs should feel like a blank page.
- **Styling:** No bottom-line only "material" style. Use a full container in `surface-container-highest` (#dee4e0) with `rounded-md`. 
- **Active State:** Change background to `surface-container-lowest` and add a "Ghost Border" of `primary` at 20% opacity.

### Anonymity Indicators (Chips)
- **Styling:** Use `secondary-container` (#d1e8dd) with `on-secondary-container` (#42564e).
- **Shape:** `rounded-full` to signal a "safe" and "contained" status.

---

## 6. Do’s and Don’ts

### Do:
- **Use Intentional Asymmetry:** Align headings to the left while keeping the primary action container slightly offset or centered to create an editorial feel.
- **Embrace White Space:** Use `spacing-12` (4rem) and `spacing-16` (5.5rem) to separate major sections. Let the content breathe.
- **Use Tonal Shifts for Feedback:** Use `sage green` (#DDE5D7) for success and `mist blue` (#E1E8ED) for informational states.

### Don’t:
- **Don't Use Dividers:** Never use a line to separate two pieces of content. Use vertical space or a subtle background color change.
- **Don't Use Motion for "Bling":** Avoid bounces or fast slides. Motion should be "linear-to-ease" and slow (300-400ms), mimicking a slow breath.
- **Don't Use "Social" Cues:** Avoid likes, upvotes, or counts. The system is about the *quality* of the question, not the *popularity* of the person.
- **Don't Use High-Saturation Red:** For errors, use `error` (#9f403d) which is a muted, "dried-ink" red, rather than a bright "stop" sign red.