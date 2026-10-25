# ShareShed — UI Style Guide (for developers and AI agents)

> **Read this before writing or changing any UI.** It documents the visual language that already exists in
> `client/src/styles/global.css` and `client/src/components/**`. The goal is that every page, written by any
> teammate or any AI agent, looks like it came from the same hand.
>
> **Source of truth:** `client/src/styles/global.css` (tokens + classes). If this document and the CSS ever disagree, the CSS wins — then fix this document.

---

## 0. TL;DR rules for AI agents

1. **Use the existing CSS variables and classes. Never hard-code a hex colour, radius, or shadow** in JSX or a feature stylesheet.
2. **Reuse shared components** from `src/components/common/*` and `src/components/items/ItemCard.jsx`. Do not re-create buttons, alerts, badges, spinners, pagination or item cards.
3. **Do not install a UI library or CSS framework** (no Tailwind, MUI, Bootstrap, Chakra, shadcn…) without team approval. The project is plain CSS + React.
4. **Do not edit `global.css`.** Put page/feature-specific CSS in your own file next to your page (e.g. `pages/household/household.css`) and `import './household.css'`. Build it from the tokens in §3.
5. **Mobile first.** Design for ~375 px wide, then enhance. The only structural breakpoint is **900 px** (§5).
6. **Light theme only.** There is no dark mode. Do not add one.
7. **Every state must be designed:** loading → `<Spinner/>`, error → `<Alert variant="error">`, empty → a short muted sentence, success → `<Alert variant="success">`.
8. **Never convey meaning by colour alone.** Badges and alerts always include text. Icons/emoji are decoration only.
9. **Format money with `formatMoney()` and dates with `formatDate()`** from `src/utils/format.js` (currency is **EGP**).
10. **Keep it quiet and utilitarian.** No gradients, no heavy animation, no decorative illustrations, no custom fonts.

---

## 1. Overall style

| Aspect | Decision |
|---|---|
| Personality | Friendly, practical, trustworthy — a neighbourhood tool library, not a flashy marketplace |
| Look | Clean, light, flat with soft shadows; white cards on a pale grey-blue page |
| Shapes | Gently rounded: **8 px** for controls, **10 px** for cards; **pill** for badges |
| Density | Comfortable (generous padding, 1.5 line-height), but compact tables for admin screens |
| Colour usage | One brand blue for primary actions/links; red only for destructive/errors; green/amber/grey for status |
| Motion | None required. No transitions needed beyond native hover/focus. Do not add animation libraries |
| Imagery | Item photos, 4:3, cropped to fill. Everything else is text + emoji |
| Brand mark | `🛠️ ShareShed` in bold text (no logo file) |
| Theme | Light only |

---

## 2. Design tokens (CSS variables)

Defined on `:root` in `global.css`. **Use `var(--name)`**.

### 2.1 Colour

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f6f8fa` | Page background |
| `--surface` | `#ffffff` | Cards, navbar, tables, footer, inputs |
| `--text` | `#1d2733` | Body text, headings |
| `--muted` | `#5d6b79` | Secondary text, hints, captions (`.muted`) |
| `--border` | `#d9e0e7` | Card borders, input borders, dividers, table rules |
| `--primary` | `#1f6feb` | Primary buttons, `btn-link` text |
| `--primary-dark` | `#1859bd` | Text links, primary-button hover, active nav text, active tab |
| `--danger` | `#cf3030` | Destructive buttons, field errors, invalid-input border |
| `--success` | `#1a7f4b` | Available for success accents (alerts/badges already have their own tints) |
| `--warn` | `#b7791f` | Available for warning accents |

Derived values used directly in `global.css` (reuse the classes rather than the hex):

| Purpose | Background | Text/Border |
|---|---|---|
| Secondary button | `#e8edf2` (hover `#d9e0e7`) | `--text` |
| Danger button hover | `#a82424` | white |
| Ghost/link button hover | `#eef4ff` | `--primary` |
| Active nav link | `#e6f0ff` | `--primary-dark` |
| Table header | `#f0f4f8` | `--text` |
| Image placeholder | `#e8eef3` | — |
| Focus ring | — | `#f5a623` (orange, 3 px) |
| Dev switcher panel | `#1d2733` | white (dev only) |

Semantic tints (alerts and badges):

| Variant | Background | Text | Border (alerts) |
|---|---|---|---|
| error / red | `#fdeaea` (badge `#fde4e4`) | `#8a1f1f` | `#f3b4b4` |
| success / green | `#e6f6ee` (badge `#e0f4e8`) | `#11623a` | `#a9dcc0` |
| info / blue | `#e8f1ff` | `#1b4b9b` | `#b6d0fb` |
| warning / amber (badge) | `#fff2d6` | `#8a5a00` | — |
| neutral / grey (badge) | `#e8edf2` | `#44525f` | — |

### 2.2 Contrast (measured, WCAG 2.1 AA needs ≥ 4.5:1 for normal text — NFR 15)

| Pair | Ratio |
|---|---|
| `--text` on `--surface` / on `--bg` | 15.1 / 14.2 |
| `--muted` on `--surface` / on `--bg` | 5.5 / 5.1 |
| white on `--primary` (buttons) | 4.6 |
| white on `--primary-dark` | 6.6 |
| `--primary-dark` links on `--bg` / on `--surface` | 6.2 / 6.6 |
| white on `--danger` / hover | 5.1 / 7.1 |
| Alert text on alert background (error / success / info) | 7.9 / 6.6 / 7.3 |
| Badge text on badge background (green / amber / red / grey) | 6.5 / 5.3 / 7.6 / 6.8 |

⚠️ **Do not use `--primary` (`#1f6feb`) as text colour on the grey page background** (4.35:1 — fails AA). Plain links already use `--primary-dark`. `--primary` text is only OK on white surfaces (4.6:1), e.g. `.btn-link` in the navbar.
⚠️ Do **not** use `--warn` / `--success` as small text colour on white without checking contrast; prefer the tinted alert/badge pairs above.

### 2.3 Typography

| Property | Value |
|---|---|
| Font family | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (no web fonts) |
| Base size / line-height | 16 px (browser default) / **1.5** |
| `h1` | `1.6rem`, margin `.2rem 0 1rem` |
| `h2` | `1.25rem` |
| `h3` | `1.05rem`, margin `.2rem 0` |
| `.muted` | `.92rem`, colour `--muted` |
| Small button text | `.88rem` |
| Field hint / error | `.85rem` / `.88rem` |
| Badge | `.78rem`, weight 600, capitalised |
| Footer | `.85rem` |
| Weights | 400 body, 600 labels/badges/active states, 700 brand mark |

One `h1` per page (the page title). Use `h2`/`h3` for sections; don't skip levels.

### 2.4 Spacing (de-facto scale, in `rem`)

`.25 · .5 · .75 · 1 · 1.5 · 2`. Typical values: gaps between siblings `.5–.75rem`; grid gap `1rem`; card padding `.9rem 1rem`; page container side padding `1rem`; main vertical padding `1rem 0 2rem`; form field spacing `1rem` (bottom margin).

### 2.5 Radius, shadow, borders, layers

| Token / value | Use |
|---|---|
| `--radius: 10px` | Cards |
| `8px` | Buttons, inputs, alerts, nav links, nav toggle |
| `999px` | Badges |
| `--shadow` = `0 1px 3px rgba(20,30,40,.08), 0 4px 14px rgba(20,30,40,.05)` | Cards only (one elevation level) |
| `1px solid var(--border)` | All borders |
| `z-index: 20` | Sticky navbar |
| `z-index: 50` | Dev role switcher |

---

## 3. Layout system

```
.app-shell  (flex column, min-height 100%)
 ├─ <Navbar/>          sticky top, white, 1px bottom border
 ├─ .main              flex:1, padding 1rem 0 2rem
 │    └─ .container    max-width 1100px, centered, side padding 1rem   ← every page starts here
 └─ <Footer/>          centered small muted text, white, top border
```

- **Every page's root element is `<div className="container">`.** Do not set your own max-width on pages.
- **Grid of cards:** `<div className="grid">` → `repeat(auto-fill, minmax(230px, 1fr))`, gap `1rem`. (≈1 column on phones, 2–4 on desktop.)
- **Inline groups:** `.row` → flex, gap `.75rem`, wraps, vertically centred (toolbars, button groups, filters).
- **Narrow forms (login, register, reset, change password):** `.form-card` → max-width 520 px, centred; wrap it around a `.card` + `.card-body`.
- **Centered messages (404, empty pages):** `.center`.
- **Wide tables:** wrap in `.table-wrap` (horizontal scroll on small screens). The page itself must never scroll sideways.

---

## 4. Component catalogue

### 4.1 Shared React components (import these)

| Component | Import | Props / usage |
|---|---|---|
| `Spinner` | `components/common/Spinner` | `<Spinner label="Loading..." />` — centred muted text; announced politely |
| `Alert` | `components/common/Alert` | `<Alert variant="error\|success\|info">{message}</Alert>` — renders nothing if no children, so `<Alert variant="error">{error}</Alert>` is safe |
| `FormField` | `components/common/FormField` | `<FormField label="Email" error={errs.email} hint="…"><input type="email" /></FormField>` — wires `htmlFor`/`id`, sets `aria-invalid`, shows error (red) or hint (muted) |
| `StatusBadge` | `components/common/StatusBadge` | `<StatusBadge status="verified" />` — colour chosen from status word (see §4.4) |
| `Pagination` | `components/common/Pagination` | `<Pagination page pages onChange />` — hides itself when `pages ≤ 1`; matches the server `{page, pages}` response |
| `ItemCard` | `components/items/ItemCard` | `<ItemCard item={item} actions={<button …/>} />` — the **only** item card. Extra buttons go in `actions` |
| `ProtectedRoute` | `components/auth/ProtectedRoute` | Used by the router; shows an error `Alert` on forbidden access |
| `Navbar` / `Footer` / `Layout` | `components/layout/*` | Owned by Member 1; links per audience in `navLinks.js` |

### 4.2 Buttons

```jsx
<button className="btn">Save</button>                          {/* primary: blue, white text */}
<button className="btn btn-secondary">Cancel</button>          {/* neutral grey */}
<button className="btn btn-danger">Remove</button>             {/* destructive: red */}
<button className="btn btn-small">Edit</button>                {/* compact (tables, cards) */}
<button className="btn btn-link">Logout</button>               {/* text-only, subtle hover bg */}
<Link to="/catalog" className="btn">Browse</Link>              {/* links can look like buttons */}
```

- One primary (`.btn`) per view/section; secondary actions use `.btn-secondary`.
- Destructive actions (remove, suspend, delete, reject) use `.btn-danger` **and** a `window.confirm(...)`.
- Disabled = `disabled` attribute (50 % opacity, `not-allowed` cursor). While submitting, disable the button and change its label ("Saving…").
- Button labels are verbs: *Save changes, Send request, Accept, Decline, Archive, Upload*.

### 4.3 Forms

- Wrap every control in `FormField` (label above input, never placeholder-only labels).
- Styled automatically: `input` types `text, email, password, tel, number, search, date`, plus `textarea` (min-height 110 px, vertical resize) and `select`. All are 100 % wide, 8 px radius, `--border` border, `.55rem .7rem` padding.
- Invalid: `aria-invalid="true"` turns the border red; the message appears under the field in `--danger`.
- **Not styled by `global.css`** (use native look, keep inside a `FormField` or a `<label>` row): checkbox, radio, file input. If you need extra form styling, add it to your own CSS file using the tokens.
- Password inputs: show the live rule checklist (`passwordChecks()` in `utils/validators.js`) — rules: ≥ 8 chars, upper, lower, number, special.
- Group related fields on one card; submit button at the bottom-left; server-level error `Alert` goes **above** the submit button.
- Validate on the server too; client validation is for UX only.

### 4.4 Status colours (`StatusBadge`)

| Status words | Colour |
|---|---|
| `verified`, `approved`, `accepted`, `active` | green |
| `pending`, `draft` | amber |
| `rejected`, `suspended`, `declined`, `removed` | red |
| `none`, `archived`, anything else | grey |

Add new status words by asking the team to extend the map in `StatusBadge.jsx` (shared file) — don't create parallel badge styles.

### 4.5 Alerts

| Variant | Use for |
|---|---|
| `error` | Failed requests, validation summary, forbidden. `role="alert"` is set automatically |
| `success` | "Profile updated", "Request sent" |
| `info` | Neutral guidance ("Register to reserve this item") |

Show messages inline near the action, not as popups. There is **no toast/snackbar system** and **no modal system**; use inline alerts and `window.confirm` for confirmation.

### 4.6 Cards

```jsx
<article className="card">
  <div className="card-body"> … </div>
</article>
<Link className="card card-link" to="…"><div className="card-body">…</div></Link>   {/* clickable card: hover → primary border */}
```

White surface, 1 px border, 10 px radius, soft shadow, `overflow: hidden` (so images are clipped to the corners).

### 4.7 Item card (the main visual unit)

- 4:3 image area (`aspect-ratio: 4 / 3`, `object-fit: cover`, grey `#e8eef3` background). Missing photo → `/uploads/placeholder.svg`.
- Heart/favourite button floats **top-right** over the image (`FavoriteButton`).
- Body: title (link, `--text` colour, `h3`), category in `.muted`, then `Deposit: **EGP …**`, then optional `actions` row.
- Always `loading="lazy"` on images, and meaningful `alt` (the item title).

### 4.8 Tables (admin lists)

Use a real `<table>` inside `.table-wrap`. Header row is `#f0f4f8`; rows have a bottom border only (no zebra); cell padding `.6rem .75rem`; left-aligned text. Put status in a `StatusBadge`, row actions in small buttons (`btn btn-small`) or a link on the name. Add `Pagination` below.

### 4.9 Tabs

```jsx
<div className="tabs" role="tablist">
  <button role="tab" aria-selected={active} className={`tab ${active ? 'active' : ''}`} disabled={…}>Details</button>
</div>
```
Active tab: bold, `--primary-dark` text, 3 px primary underline. Disabled tab: 45 % opacity. Tab row scrolls horizontally on small screens. Used by `ItemEditorPage`.

### 4.10 Navigation

- Sticky white bar; brand left (`🛠️ ShareShed`), links right.
- **< 900 px:** links collapse behind a ☰ button (`aria-expanded` toggles), stacked vertically.
- **≥ 900 px:** links inline, wrapping if needed.
- Active link: pale blue pill (`#e6f0ff`) with `--primary-dark` bold text. Logout is a `btn-link` at the end showing `Logout (username)`.
- Link sets differ per audience (guest / member / verified lender / admin) in `components/layout/navLinks.js` — don't hard-code links in pages.

### 4.11 Other

- **Pagination:** centred row: `Previous · Page X of Y · Next`, small buttons.
- **Footer:** `ShareShed - borrow before you buy · © year`.
- **Dev role switcher** (bottom-right, dark panel): development tool only, rendered under `import.meta.env.DEV`. Ignore it when designing; never style or ship it as a feature.

---

## 5. Responsive rules (NFR 1, 12)

- **Mobile first.** Base CSS = phone. Verify at **375 px** and **1280 px**, in Chrome, Firefox and Safari.
- The one structural breakpoint is **`@media (min-width: 900px)`** (navbar). Add others in your own CSS only when truly needed, using `min-width` queries (e.g. `640px`, `900px`).
- Prefer fluid layouts (`grid` auto-fill, `flex-wrap`, `max-width: 100%`) over fixed widths. Never use fixed pixel widths on containers.
- Tap targets ≥ 40 px tall on phones (`.btn` ≈ 42 px and inputs ≈ 44 px satisfy this; `.btn-small` is only ≈ 31 px, so reserve it for dense desktop tables and give it spacing on mobile).
- Tables → `.table-wrap` (scroll). Long text → let it wrap; don't truncate critical info.
- Images: `max-width: 100%` is global; use `aspect-ratio` + `object-fit: cover` for consistent thumbnails.

---

## 6. Page patterns (copy the structure)

**List / catalog page**
```
.container
  h1 title
  .row  (search input + filters + actions)
  Alert (error)   |  Spinner  |  empty message (.muted)
  .grid of <ItemCard/>   (or .table-wrap > table for admin)
  <Pagination/>
```

**Form page (login, register, change password, reset)**
```
.container > .form-card > .card > .card-body
  h1
  <Alert error/> + <Alert success/>
  <FormField> … </FormField> (×n)
  <button className="btn"> (full-width not required)
  secondary links below in .muted ("Forgot password?", "Already have an account?")
```

**Detail page (item, user, application)**
```
.container
  h1 (title + inline FavoriteButton where relevant)
  media / gallery at top
  key facts (deposit, owner, category) in a .card or definition-style rows
  long text sections each under an h2
  action buttons in a .row at the end
```

**Dashboard / admin landing:** `.grid` of `.card.card-link` tiles, each with an `h3` + one-line `.muted` description (see `AdminDashboardPage`).

**Editor with sections (ItemEditorPage):** `.tabs` + the active tab's content; later tabs disabled until the record exists.

**States checklist for every data-driven page:** loading (`Spinner`) → error (`Alert error`) → empty (one muted sentence + a call-to-action button if sensible) → content.

---

## 7. Content & microcopy

- **Tone:** plain, friendly, second person ("Your wallet balance", "You can apply to become a lender").
- **Currency:** always `formatMoney(n)` → e.g. `EGP 1,200.00`. Label deposits as **Deposit**, balances as **Wallet balance**.
- **Dates:** `formatDate()` → `5 Jan 2026`; with time `formatDateTime()`.
- **Roles in UI text:** *Member*, *Verified lender* (or *Lender*), *Admin*. Application states: *Pending, Approved, Rejected*.
- **Errors:** say what happened and what to do ("File too large (max 5 MB)"). Surface the server message with `getErrorMessage(err)`; don't invent technical text.
- **Confirmations (`window.confirm`)** name the thing: "Remove this household link?"
- **Casing:** Sentence case for headings, buttons and labels ("Change password", not "Change Password"). Brand is **ShareShed** (one word, capital S's).
- **Emoji:** only for brand (🛠️), category icons (stored on the category), and the nav ☰. Don't sprinkle emoji in buttons or headings.

---

## 8. Imagery & files

- Item photos: JPG/PNG, shown 4:3 cropped; gallery on the details page may show them larger but keep `object-fit: cover` for thumbnails, `contain` for full-size viewing.
- Fallback image: `/uploads/placeholder.svg` (grey picture glyph + "No photo").
- Image URLs from the API are paths like `/uploads/items/xyz.jpg` (the Vite dev proxy and production server serve them). Use them as-is in `src`.
- Upload UIs: show accepted types (PDF/JPG/JPEG/PNG) and max size (5 MB) as a `.field-hint`, show the chosen file name, give a remove button for each uploaded file, and show upload errors in an `Alert`.
- **Private documents** (lender ID/proof of address) are never displayed as inline `<img>` from a public URL; open/download through the authenticated endpoint link.

---

## 9. Accessibility checklist (NFR 15 is Sprint 2, but build it in now)

- Every input has a visible `<label>` (use `FormField`).
- Interactive elements are real `<button>`/`<a>`/`<Link>` — never a clickable `<div>`.
- Keep the global focus ring (`:focus-visible` → 3 px orange outline). **Never `outline: none`.**
- Icon-only buttons need `aria-label` (e.g. the favourite heart: "Add to favorites").
- Dynamic messages: errors use `role="alert"` (`Alert` does this), loading uses `aria-live="polite"` (`Spinner` does this).
- Tab widgets use `role="tablist" / "tab"` + `aria-selected`; collapsible nav uses `aria-expanded`.
- Keyboard: all flows (browse → open item → favorite; login; forms) must work with Tab/Enter/Space only.
- Colour is never the only signal (badges carry text; required/invalid fields also carry text messages).
- Meaningful `alt` text for item photos; empty `alt=""` only for purely decorative images.
- Page `<title>`/`lang`: `lang="en"` is set in `index.html`.

---

## 10. How to add styles without breaking consistency

1. Reuse a class from §4. If you need *a little extra* layout, create `YourPage.css` next to the page.
2. In that file, use tokens only:
   ```css
   .household-link-row { display: flex; gap: .75rem; padding: .75rem 1rem;
     border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
   ```
3. Prefix your class names with the feature (`.household-…`, `.lender-apply-…`) so they never collide with another member's CSS.
4. Don't style bare elements (`h1 {}`, `button {}`, `a {}`) or use `!important` in feature CSS.
5. Need a **new global thing** (new colour, new shared component, new status colour)? Propose it to Member 1 and update this file in the same PR.

**Do**
- Compose with `.container`, `.grid`, `.row`, `.card`, `.btn*`, `.badge*`, `.alert*`.
- Keep one elevation level (cards) and one border colour.
- Show loading, error and empty states.

**Don't**
- Hard-code colours/sizes, add gradients, glassmorphism, drop shadows on buttons, or new fonts.
- Add a second accent colour; blue is the only accent.
- Use fixed-width layouts, `100vw` widths, or horizontal page scroll.
- Style with inline `style={{}}` except for truly dynamic values (e.g. a computed width).
- Build custom modals/toasts/dropdown libraries in Sprint 1.

---

## 11. Guidance for Sprint 2 UI (stay consistent)

| Feature | Guidance |
|---|---|
| Reservation calendar / date-range pickers | Native `input type="date"` pairs inside `FormField` first; a calendar grid (if built) uses white cells, `--border` lines, booked days in neutral grey (`#e8edf2`) with text "Booked", available days white; selected range in `#e6f0ff` with `--primary-dark` text. Booked/available must also be indicated by text/aria, not colour only |
| Stripe card form | Place Stripe Elements inside a `.card`; style Elements with the same border (`#d9e0e7`), 8 px radius, text `#1d2733`, font `system-ui`; errors via `Alert error` |
| Notifications (bell + list) | Bell icon button in the navbar (`aria-label`), unread count in a small red (`badge-red`) pill; list in a `.card`; unread rows get the `#e6f0ff` tint |
| Chat | Message bubbles: mine = `--primary` bg / white text, theirs = `#e8edf2` / `--text`; radius 10 px; timestamps `.muted` small |
| Reports (admin) | `.table-wrap` tables + a `.row` of filters on top + export buttons as `.btn btn-secondary`; charts, if any, use `--primary` plus greys (no rainbow) |
| Membership tiers | Three `.card`s in a `.grid`; highlight the current tier with a `--primary` border and a `badge-green` "Current plan" |
| Damage reports / photos | Before/after photos side by side in a `.grid` (4:3, `object-fit: cover`) with captions in `.muted` |
| Late fee / forfeiture amounts | Money in `formatMoney`; negative/penalty amounts in `--danger`, credits normal weight (and always labelled with text) |

---

## 12. Quick copy-paste prompt for AI agents

> You are working on **ShareShed**, a React 18 + Vite app with plain CSS (no UI framework). Follow `docs/UI_README.md`.
> Use only the CSS variables and classes from `client/src/styles/global.css` (`.container`, `.grid`, `.row`, `.card`, `.card-body`, `.btn`, `.btn-secondary`, `.btn-danger`, `.btn-small`, `.btn-link`, `.badge-*`, `.alert-*`, `.field*`, `.form-card`, `.table-wrap`, `.tabs/.tab`, `.muted`, `.center`).
> Reuse `Spinner`, `Alert`, `FormField`, `StatusBadge`, `Pagination`, and `ItemCard`. Palette: page `#f6f8fa`, surface `#fff`, text `#1d2733`, muted `#5d6b79`, border `#d9e0e7`, primary `#1f6feb` (links/hover `#1859bd`), danger `#cf3030`. Radius 8 px (controls) / 10 px (cards) / pill (badges); one soft card shadow; system font; light theme only.
> Build mobile-first (375 px), single breakpoint at 900 px, accessible (labels, focus ring, aria, ≥ 4.5:1 contrast), sentence-case microcopy, money via `formatMoney` (EGP). Show loading, error and empty states. Put feature CSS in your own file with feature-prefixed classes; do not edit `global.css` or shared components; do not add dependencies.

---

## 13. File map (UI-relevant)

```
client/src/
├─ styles/global.css            ← tokens + all shared classes (source of truth)
├─ utils/format.js              ← formatMoney, formatDate, formatDateTime
├─ utils/validators.js          ← password rules/checklist, email/phone checks, upload limits
├─ api/axios.js                 ← getErrorMessage(err), getFieldErrors(err)
├─ components/common/           ← Spinner, Alert, FormField, StatusBadge, Pagination
├─ components/items/ItemCard.jsx
├─ components/layout/           ← Navbar, Footer, Layout, navLinks.js
├─ components/auth/ProtectedRoute.jsx
└─ pages/                       ← one folder per area; each page root is <div className="container">
```
