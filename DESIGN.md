---
name: Indian Tax Assistant
description: Cited Indian tax answers held in front of a coral lamp seen through ribbed glass.
colors:
  lamp-coral: "oklch(71% 0.155 32)"
  lamp-coral-hover: "oklch(76% 0.150 34)"
  lamp-coral-press: "oklch(64% 0.150 32)"
  lamp-coral-focus: "oklch(74% 0.165 32)"
  ember-on-cream: "oklch(50% 0.170 32)"
  coral-wash-night: "oklch(34% 0.075 32)"
  coral-blush: "oklch(86% 0.075 40)"
  coral-wash-day: "oklch(90% 0.050 38)"
  coral-ink-day: "oklch(42% 0.120 32)"
  midnight-ink: "oklch(19% 0.045 258)"
  midnight-ink-raised: "oklch(23% 0.050 258)"
  midnight-ink-high: "oklch(27% 0.052 258)"
  navy-seam: "oklch(33% 0.045 258)"
  navy-seam-strong: "oklch(46% 0.045 258)"
  slate-mist: "oklch(72% 0.030 250)"
  ledger-cream: "oklch(95% 0.022 85)"
  worn-ledger: "oklch(86% 0.026 85)"
  folded-cream: "oklch(91% 0.028 82)"
  pressed-cream: "oklch(87% 0.030 82)"
  ruled-cream: "oklch(82% 0.025 82)"
  printed-navy: "oklch(21% 0.045 258)"
  body-navy: "oklch(38% 0.040 258)"
  pencil-navy: "oklch(45% 0.035 258)"
  pencil-rule: "oklch(62% 0.035 258)"
  error-red: "oklch(70% 0.170 25)"
  glass-fill: "oklch(24% 0.045 258 / 0.42)"
  glass-fill-strong: "oklch(22% 0.045 258 / 0.72)"
  glass-deep: "oklch(14% 0.040 258 / 0.5)"
  glass-line: "oklch(95% 0.022 85 / 0.16)"
  glass-shine: "oklch(95% 0.022 85 / 0.08)"
  scrim: "oklch(12% 0.035 258 / 0.6)"
typography:
  display:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3.25rem, 6vw + 0.25rem, 5.5rem)"
    fontWeight: 300
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  display-s:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4vw + 0.5rem, 3.75rem)"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 2.5vw + 1rem, 3.5rem)"
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 0.75vw + 0.875rem, 1.625rem)"
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  lead:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 0.35vw + 1rem, 1.375rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1
  small:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  nub: "4px"
  inner: "12px"
  card: "20px"
  sheet: "28px"
  pill: "999px"
spacing:
  3xs: "2px"
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
  3xl: "96px"
  4xl: "144px"
components:
  button-primary:
    backgroundColor: "{colors.lamp-coral}"
    textColor: "{colors.midnight-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.lamp-coral-hover}"
  button-primary-active:
    backgroundColor: "{colors.lamp-coral-press}"
  button-primary-small:
    backgroundColor: "{colors.lamp-coral}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-glass:
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.ledger-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-glass-hover:
    backgroundColor: "{colors.glass-fill-strong}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ledger-cream}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.midnight-ink-raised}"
  ask-field:
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.ledger-cream}"
    rounded: "{rounded.pill}"
    padding: "4px"
  composer:
    backgroundColor: "{colors.glass-fill-strong}"
    textColor: "{colors.ledger-cream}"
    rounded: "{rounded.pill}"
    padding: "4px"
  input:
    backgroundColor: "{colors.glass-deep}"
    textColor: "{colors.ledger-cream}"
    rounded: "{rounded.inner}"
    padding: "0 16px"
    height: "52px"
  source-tag:
    backgroundColor: "{colors.coral-wash-day}"
    textColor: "{colors.coral-ink-day}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  source-tag-on-navy:
    backgroundColor: "{colors.coral-wash-night}"
    textColor: "{colors.coral-blush}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  glass-card:
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.worn-ledger}"
    rounded: "{rounded.card}"
    padding: "40px"
  glass-card-strong:
    backgroundColor: "{colors.glass-fill-strong}"
    textColor: "{colors.worn-ledger}"
    rounded: "{rounded.card}"
    padding: "16px"
  answer-card:
    backgroundColor: "{colors.ledger-cream}"
    textColor: "{colors.printed-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "24px"
  message-user:
    backgroundColor: "{colors.lamp-coral}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
  cream-sheet:
    backgroundColor: "{colors.ledger-cream}"
    textColor: "{colors.body-navy}"
    rounded: "{rounded.sheet}"
    padding: "64px"
  side-link:
    backgroundColor: "transparent"
    textColor: "{colors.ledger-cream}"
    rounded: "{rounded.inner}"
    padding: "0 12px"
    height: "40px"
  side-link-current:
    backgroundColor: "{colors.glass-fill-strong}"
  nav-pill:
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.worn-ledger}"
    rounded: "{rounded.pill}"
    padding: "4px"
  chip:
    backgroundColor: "{colors.coral-wash-night}"
    textColor: "{colors.coral-blush}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 0 0 12px"
---

# Design System: Indian Tax Assistant

## Overview

**Creative North Star: "Lamplight Through Glass"**

The whole product sits in a dark room with one lamp on. The field is deep navy; behind it, a single coral lamp and a wide, soft cream light are seen through ribbed glass, the light bending in narrow vertical flutes and drifting slowly toward the cursor. Everything the reader needs (a question, an answer, the page it came from) is held in front of that light on frosted glass or laid down on a cream reading sheet. The light is atmosphere; the cream sheets and their page numbers are the substance.

The feel is calm and tactile. Surfaces are panes you could pick up: frosted glass with a cream hairline rim and a faint top shine, cream sheets with soft rounded corners, pills for every small object. Density is low on the landing (big light headlines, long breathing room between stages) and moderate in the app, where a glass pane floats on the glow and holds a single 46rem reading column. Motion is slow and physical: the hero settles once on load, landing stages rise into place on scroll, and inside the app only state changes move.

The palette is a fixed proportion chosen by the user: navy 60, cream 30, coral 10. Coral is rare by design and always means "act here" or "this came from a source". The system rejects a flat SaaS hero, rows of feature cards and stock chat mock-ups; it carries no eyebrows, no tracked caps labels, and no invented metrics, testimonials or logos.

**Key Characteristics:**
- One light source: a WebGL fluted-glass glow (coral core, cream wash, navy floor) behind every screen.
- Navy 60 / cream 30 / coral 10, held across landing, auth and the signed-in app.
- Hanken Grotesk only, in three weights: 300 display, 400 reading, 600 labels and buttons.
- Frosted glass panes with a cream hairline rim; cream sheets for anything meant to be read closely.
- Pills for every small object; 20px cards, 12px inner wells, 28px sheets.
- Surfaces re-point the same token names (on-cream / on-navy), so a component reads correctly on either ground.

## Colors

A night palette: one deep navy field, a warm paper cream for type and reading sheets, and a single coral that behaves like lamplight.

### Primary
- **Lamp Coral** (lamp-coral): the 10. Primary actions only (Ask, Send, New chat, Create account), the user's own chat bubbles, the coral page tag on the hero card, the first-fact underline, the 2px reading-progress bar, the total rule on a tax sheet, caret and selection tint. It deepens on press (lamp-coral-press) and brightens on hover (lamp-coral-hover); text on it is always Midnight Ink.
- **Focus Coral** (lamp-coral-focus): the 2px focus ring on navy and glass. On cream it becomes **Ember on Cream** (ember-on-cream), dark enough to hold contrast on paper.
- **Coral Wash, Night / Coral Blush** (coral-wash-night, coral-blush): the attached-file chip and source tags on navy ground; a dim coral pill with pale coral text.
- **Coral Wash, Day / Coral Ink** (coral-wash-day, coral-ink-day): source tags inside cream answer cards; a pale coral pill with deep coral text.

### Neutral
- **Midnight Ink** (midnight-ink): the 60. The field behind the glow, the glow's floor, the phone sidebar overlay, and the text colour on coral.
- **Lamplit Navy** and **High Navy** (midnight-ink-raised, midnight-ink-high): raised navy for hover fills, the glow's upper haze, and the landing's navy tax sheet.
- **Navy Seam** and **Strong Seam** (navy-seam, navy-seam-strong): hairline rules and secondary-button borders on navy.
- **Slate Mist** (slate-mist): muted text on navy: captions, hints under the composer, empty-list notes.
- **Ledger Cream** (ledger-cream): the 30. Headline and strong text on navy; the ground of every reading sheet, assistant answer card and calculator result sheet.
- **Worn Ledger** (worn-ledger): body text on navy and glass; one step softer than headlines.
- **Folded Cream**, **Pressed Cream**, **Ruled Cream** (folded-cream, pressed-cream, ruled-cream): raised fills and hairline rules inside cream sheets.
- **Printed Navy**, **Body Navy**, **Pencil Navy**, **Pencil Rule** (printed-navy, body-navy, pencil-navy, pencil-rule): type and rules on cream, from headline to caption to strong rule.
- **Error Red** (error-red): invalid field borders and the tinted error row; used as a 14-16% wash, never a solid block.

### Glass
- **Glass Fill** (glass-fill, 42% navy): the default frosted pane: nav pill, glass buttons, the hero Ask field, calculator form, the app's main pane.
- **Strong Glass** (glass-fill-strong, 72% navy): panes that carry reading text over a bright glow: the hero answer card, the chat composer, the current sidebar item.
- **Deep Well** (glass-deep): inset wells inside glass, such as form inputs and the answer well on the hero card.
- **Glass Rim** and **Glass Shine** (glass-line, glass-shine): the cream hairline edge every pane carries, and the 1px inner top highlight.
- **Night Scrim** (scrim): behind the phone sidebar overlay.

### Named Rules
**The Sixty-Thirty-Ten Rule.** Navy is the field (60), cream is type and reading sheets (30), coral is the signal (10). The proportion was set by the user; no new hue enters the system.

**The Lamp Means Act Rule.** Coral marks only an action, a citation, focus or progress. If coral appears on something that is neither clickable nor a source, it is wrong.

**The Same Names, Different Ground Rule.** A cream or navy surface re-points the same token names (paper, ink, muted, rule, focus, accent wash) rather than introducing new ones. Components use the generic names and inherit the right values from the ground they sit on.

## Typography

**Display Font:** Hanken Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui)

**Character:** One grotesk in three weights. Light at large sizes with tight tracking reads quiet and expensive against the glow; regular carries the reading; semibold is reserved for labels and buttons. Numerals are tabular throughout so rupee amounts line up.

### Hierarchy
- **Display** (300, clamp(3.25rem, 6vw + 0.25rem, 5.5rem), 0.98, -0.035em): the hero headline only, max 11ch. Auth headlines use a sibling clamp(2.75rem, 5vw, 4.5rem).
- **Display Small** (300, clamp(2.25rem, 4vw + 0.5rem, 3.75rem), 1.1, -0.03em): statement lines and the closing call, max 14-18ch.
- **Headline** (300, clamp(2rem, 2.5vw + 1rem, 3.5rem), 1.02, -0.035em): section heads on the landing, the chat empty state, the calculator head; also the total figure on a tax sheet.
- **Title** (300, clamp(1.25rem, 0.75vw + 0.875rem, 1.625rem), 1.2, -0.015em): document names in the document index, FAQ questions.
- **Lead** (400, clamp(1.125rem, 0.35vw + 1rem, 1.375rem), 1.45): the sentence under a headline, max 36-52ch.
- **Body** (400, 1rem, 1.55; 1.6 inside answers): reading text, max 65-68ch.
- **Label** (600, 0.875rem): buttons, field labels, nav links, source tags. Sentence case, no added tracking.
- **Small** (400, 0.8125rem): the source line on the hero card, the hint under the composer, file names on phones.

### Named Rules
**The Three Weights Rule.** 300, 400, 600 and nothing else. Display is always light; emphasis comes from size and cream-on-navy contrast, never from bold display type.

**The No Eyebrows Rule.** No kicker or eyebrow text above headlines, no tracked uppercase labels. A headline opens its section by itself.

## Layout

The public pages sit in a 1440px container with a 64px gutter (24px below 60rem, 16px below 40rem). Landing stages are separated by 120-176px section gaps (shrinking to 56-96px on phones) and are laid on asymmetric two-column grids (7/5, 6/6, 5/7, 4/8) that collapse to one column below 60rem. Reading sections are cream sheets (28px corners, 64px padding) floated on the calm, fixed glow.

The hero is full viewport height: wordmark left, glass section pill centred, account doors right; copy and the Ask field bottom-left, the glass answer card top-right, and a five-up fact strip across the foot with a hairline rule (two-up on tablets).

The signed-in app is a full-height shell on the fixed glow. The sidebar (17rem) sits directly on the light with no fill of its own; the main panel is one floating glass pane with a 12px margin on every side (left margin 0 while the sidebar is open, the sidebar's own padding is the gap). The chat thread and composer share a 46rem measure; the calculator uses a 72rem 5/7 grid. Below 60rem the pane goes edge to edge with no radius and the sidebar becomes a solid navy overlay over a scrim. On phones the nav keeps only the logo mark and both account doors.

Spacing follows one scale (2, 4, 8, 12, 16, 24, 40, 64, 96, 144px); every gap and padding uses a step from it.

## Elevation & Depth

Depth is optical, not stacked. The deepest layer is the light itself; above it sit frosted panes that blur it (20px blur with 150% saturation for cards and controls, 32px for the app pane), each with a cream hairline rim, a 1px inner shine along the top and one long soft lift shadow. Cream sheets and answer cards sit on that with a shorter shadow. On cream ground the lift shadow is re-pointed to a lighter navy-tinted version. Cards on the landing lean toward the pointer in 3D (up to 7deg) on hover devices only.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 24px 60px -24px oklch(6% 0.04 258 / 0.7), 0 2px 8px oklch(6% 0.04 258 / 0.25)`): every glass pane, the composer, the attached-file pill.
- **Sheet** (`box-shadow: 0 18px 40px -20px oklch(6% 0.04 258 / 0.7)`): cream answer cards in the chat.
- **Lift on Cream** (`box-shadow: 0 18px 40px -18px oklch(19% 0.045 258 / 0.35), 0 1px 3px oklch(19% 0.045 258 / 0.12)`): sheet cards placed on a cream ground.
- **Glass Shine** (`box-shadow: inset 0 1px 0 var(--glass-shine)`): the top highlight on every glass object, alone on the nav pill and example prompts.

### Named Rules
**The Rim And Lift Rule.** Glass always carries both its cream hairline rim and its shadow. Over a moving glow a pane without a visible rim stops reading as a pane.

**The Light Is Always Behind Rule.** Glass needs something to blur. Every screen that uses glass has the glow behind it (fixed and calm below the hero, on auth pages and in the app shell). If WebGL2 is missing, the CSS fallback of two radial blooms and flute stripes takes its place.

## Shapes

Soft and pocketable. Every small object is a pill (999px): buttons, source tags, chips, the hero Ask field, the composer, the nav section pill, example prompts, the card handle, skeleton bars. Containers step down in three radii: sheets 28px, cards 20px, inner wells and inputs 12px. Chat bubbles keep the card radius on three corners and pinch one to 4px on the speaker's side (bottom right for the user). Rules are 1px hairlines; the only heavy rule is the 2px coral line over a tax total. The logo is a document outline with a folded corner and a rupee sign inside, drawn in the same 1.75 stroke as the 24px icon set.

## Components

### Buttons
- **Shape:** pill (999px), 48px tall (40px small), 24px side padding (16px small), label type.
- **Primary:** Lamp Coral fill, Midnight Ink text, optional arrow icon that nudges up-right on hover. Hover brightens to lamp-coral-hover; press darkens to lamp-coral-press and scales to 0.98. Used once per view for the main action.
- **Glass:** Glass Fill with a Glass Rim border and 16px blur, cream text; hover thickens to Strong Glass. Used for the secondary account door in the nav.
- **Secondary:** transparent with a Strong Seam border; hover fills Lamplit Navy.
- **Focus / Disabled:** 2px Focus Coral ring with 3px offset; disabled drops to 55% opacity.
- **Icon buttons:** 40px round, transparent, hover fills High Navy.

### Chips and Tags
- **Source tag:** pill, label type, "file.pdf, p. 19". On cream answer cards it is Coral Wash Day with Coral Ink text; on navy it is Coral Wash Night with Coral Blush text. Always carries a real page from the document metadata.
- **Coral tag:** solid Lamp Coral with Midnight Ink text, the page tag on the hero card.
- **Attachment chip:** the night coral wash pill with a 28px round remove button.

### Cards / Containers
- **Glass card:** 20px corners, Glass Fill, rim + shine + lift, 40px padding (24px on phones). Strong Glass when it carries reading text over the bright core.
- **Cream answer card:** the assistant's reply in chat. 20px corners, Ledger Cream ground, Printed Navy text at 1.6 line height, 24px padding, Sheet shadow, source tags below the prose. Enters with a 420ms rise.
- **User bubble:** Lamp Coral, Midnight Ink text, 12px by 16px padding, max 85% width, right aligned, 4px pinched corner bottom right.
- **Cream sheet:** 28px corners, 64px padding, holds the document index and the calculator demo on the landing.
- **Tax sheet:** a 20px card of label/amount rows on hairlines, amounts right aligned in tabular numerals, total under a 2px coral rule at headline size. Cream in the app's result, navy on the landing's cream sheet.

### Inputs / Fields
- **Style:** 52px tall, 12px corners, Deep Well fill and Glass Rim border inside glass forms; label above in label type, help line below.
- **Focus:** 2px Focus Coral outline, 1px offset. Hover lifts the border to Worn Ledger.
- **Error:** Error Red border and an error-tinted help line; form-level errors are a 16% red wash row.
- **Ask field and composer:** a glass pill wrapping a borderless input and a coral pill button; the whole pill takes the focus ring. The composer's hint and status line sits beneath it as small centred print.

### Navigation
- **Site nav:** wordmark (coral logo mark + semibold name) left; a glass section pill centred on the landing, with regular-weight 0.875rem links that take a Glass Shine fill on hover; "Log in" text link and a glass "Create account" button right. Below 60rem the pill hides; below 40rem the wordmark shows the 28px mark only.
- **Side nav:** transparent rows on the glow, 40px tall, 12px corners. Hover takes Glass Shine; the current page or chat takes Strong Glass with an inset rim. The chat list is separated by a rim hairline and scrolls on its own; Log out sits at the foot.

### Signature: the Glow Field
A raw WebGL2 shader fills the screen with a navy field, a wide soft cream light upper right and a tight coral core, refracted through roughly 9px vertical glass flutes with a faint ridge between them, drifting slowly and easing toward the cursor, with a light film grain and a navy floor that fades in along the bottom third so text stays legible. The calm setting dims the core for sections below the hero and auth pages. Colours are read from the tokens at runtime. It pauses when off-screen, draws one still frame under reduced motion, and falls back to a CSS layer of two radial blooms and flute stripes when WebGL2 is unavailable.

### Motion
One load settle in the hero (content rises 18px into place, staggered 0/120/200ms). Landing stages rise from 48px below with a slight 8deg lean as they enter, staggered 80ms. Inside the app, only state moves: messages rise in over 420ms, the sidebar slides 16px, the thinking bar sweeps. Durations are 120ms (micro), 220ms (short), 420ms (long), with a 760ms reveal; the ease is out-expo cubic-bezier(0.16, 1, 0.3, 1). Every animation has a reduced-motion fallback that removes the movement.

## Do's and Don'ts

### Do:
- **Do** hold the 60/30/10 split: navy field, cream type and reading sheets, coral only for primary actions, user bubbles, source and page tags, focus rings, the first-fact underline and reading progress.
- **Do** put the Glow Field behind every screen that uses glass; use the calm setting for sections below the hero, auth pages and the app shell.
- **Do** give every glass pane its cream hairline rim (glass-line), the 1px inner shine and the lift shadow.
- **Do** lay closely read content (answers, document lists, tax sheets) on Ledger Cream with Printed Navy text.
- **Do** use pills (999px) for every small object, 20px for cards, 12px for inputs and inner wells, 28px for sheets.
- **Do** set display type in Hanken Grotesk 300 with -0.035em tracking, using the clamp() sizes in the tokens.
- **Do** reference colours only through tokens, and switch grounds with the on-cream / on-navy surface classes.
- **Do** use 120 / 220 / 420ms with cubic-bezier(0.16, 1, 0.3, 1), and give every animation a reduced-motion fallback.
- **Do** show a real source and page on every answer-like element; the hero card carries a real cited answer.

### Don't:
- **Don't** add eyebrows, kickers or tracked uppercase labels.
- **Don't** write literal colour values outside the token files.
- **Don't** invent metrics, testimonials, ratings, customer logos or press.
- **Don't** use coral on anything that is not an action, a citation, focus or progress.
- **Don't** introduce a weight outside 300, 400 and 600, or a second typeface.
- **Don't** place glass over a flat navy fill with no light behind it.
- **Don't** add motion in the app beyond state changes; the load settle belongs to the hero and the scroll rise to the landing.
