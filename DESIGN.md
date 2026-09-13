# VideoDowngrade visual direction

## Core idea

VideoDowngrade is a restrained Swiss-style desktop utility: typographic, modular, monochrome and grid-based.

The layout stays stable. The visual language evolves around a dark default theme with strong black/white inversion for interaction.

## Non-negotiable rules

1. Keep the current UI structure and element positions.
2. Use only black, white and grayscale values.
3. No colored accents.
4. No glassmorphism, neon glow or decorative gradients.
5. The entire UI follows one 24px modular grid.
6. Motion remains subtle and functional.
7. Because dark mode is the default, primary surfaces should also be dark.

## Dark theme interaction model

- workspace: near-black
- panels: dark gray / near-black
- text: white
- secondary information: neutral gray
- borders: thin gray/white rules
- primary actions: white surface with black text
- selected states: white/black inversion
- hover states: increase contrast, never add hue
- disabled states: low-contrast grayscale

This makes interactive elements readable without introducing color.

## Grid

- 24px modular grid across workspace, sidebar and panels
- spacing should snap to the same rhythm
- internal panel content aligns to the same system
- grid remains visible but subtle

## Typography

- grotesk / neo-grotesk feeling
- hierarchy through scale, weight and inversion
- uppercase micro labels
- compact technical metadata
- confident large headings

## Components

- very small radii
- custom sliders and dropdowns stay custom
- controls should feel like instruments, not browser form widgets
- primary CTA uses white-on-dark contrast
- selected presets use inversion

## Motion

Use motion for:
- panel entrance
- hover clarification
- dropdown opening
- toast appearance
- slider movement
- progress feedback

Avoid bouncy or decorative motion.

## Future additions

- custom video player controls
- before/after scrubber
- processing history archive
- frame comparison mode
