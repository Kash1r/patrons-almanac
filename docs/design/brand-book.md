# Patron's Almanac brand book

A Deadlock stats site dressed as a 1920s occult almanac: ink and velvet grounds, brass linework, gilt numbers, and data set in tidy ledger columns. Data comes from deadlock-api.com; the look is ours alone.

## Content fundamentals

- Write like a careful almanac, not a hype account. State the number, its sample and its window: "54.2% win rate over 312 matches, last 30 days."
- Sentence case for headings and buttons ("Recent matches", "Load more"). Uppercase only in the `label` style.
- Address the reader as "you" on their own profile ("Your best hero"); use the player's name elsewhere.
- No emoji, no exclamation marks, no "insane" or "cracked". The setting supplies the flavour; the copy stays plain.
- Every rate shows its sample size in `text-muted`. Under 50 matches, show the value in `text-muted` and add "low sample".
- Credit the source in the footer: "Data from deadlock-api.com. Not affiliated with Valve."
- Model outputs say what they are: "Estimated win chance", never "Win chance".

## Visual foundations

**Colour**
- Dusk (dark) is the primary theme; Parchment (light) is the alternate. Both are complete.
- Pages sit on `ground`; cards and tables on `surface`; hover and selection on `surface-raised`.
- Set body copy and table values in `text`; secondary text in `text-muted`.
- Use `gilt` for page titles, headline numbers and the active nav item. Use `brass` for rules, control borders, the focus ring and the primary button (text on it in `on-brass`).
- `brass` is for borders and large text only; never set body copy in it.
- Team colours: `team-amber` for The Amber Hand, `team-sapphire` for The Sapphire Flame. They differ in lightness and sit on the blue/orange axis, so they hold up for colour-blind readers; still always print the team name.
- Results: `win` and `loss` always travel with a word or letter (Win / Loss, W / L). Never encode a result by colour alone.
- `hairline` is decorative. A control's border is `brass` or `text-muted`, never `hairline`.

**Type**
- Three families: `display` (Poiret One) for titles and huge numbers, `serif` (Cormorant Garamond) for headings and prose, `mono` (IBM Plex Mono) for every number and label.
- One `display-xl` per page. Section titles use `display-l`; card headings `h2`.
- Every number on the site is set in a mono style (`stat-xl`, `stat`, `table`) so columns align.
- Load the fonts from Google Fonts: Poiret One 400; Cormorant Garamond 500, 600; IBM Plex Mono 400, 500.

**Space and layout**
- Spacing steps are `space-1` to `space-12`. Cards pad with `space-6` on desktop and `space-4` on phones; cards sit `space-6` apart; page sections `space-8` apart.
- Mobile first: one column under 768px; the scoreboard shows one team per tab on phones.
- Keep tables full-bleed inside their card on phones; scroll horizontally only inside the table, never the page.

**Borders, corners, depth**
- Borders, not shadows. A card is `surface` with a 1px `hairline` border, or a 1px `brass` border when it is the focus of the page.
- Corners are square (`radius-none`) and stepped: cut each corner with clip-path by `corner-step-sm` (stat blocks, chips) or `corner-step-lg` (panels, the result banner).
- Separate sections with a double rule: two 1px `brass` lines `space-1` apart.
- `radius-full` is only for rank badge discs and hero portraits. Buttons and inputs use `radius-sm`.

**Ornament**
- One sunburst per page at most: thin `brass` rays behind the rank badge on a profile, or behind the result on a match page.
- Ornament never sits behind numbers or text that must be read.

**Motion**
- Subtle and rare: a brass underline that draws in on hover (150ms), numbers counting up once on first load (400ms).
- Honour `prefers-reduced-motion`: no count-up, no draw-in.

**States and focus**
- Focus ring: 2px solid `brass`, offset 2px, on every interactive element. It meets 3:1 on every surface in both themes.
- Hover on rows: `surface-raised`. Selected tab: `gilt` text with a `brass` underline.
- Disabled: `text-muted` text, `hairline` border, no hover.

## Charts

- Lines and bars use `team-amber` and `team-sapphire` for the two teams, `win` and `loss` for results, and `brass` for a single series.
- Axes and gridlines in `hairline`; axis labels in `label` style, `text-muted`.
- Label series directly at the line end rather than in a legend when there are two or fewer.
- Win-probability charts draw the 50% line as a dashed `text-muted` rule.

## Iconography

- No icon set yet. Use simple inline SVG sigils drawn with 1.5px strokes in `brass` for the three stat categories (combat, economy, objectives).
- Hero portraits and item icons come only from the deadlock-api.com assets API. Never redraw them or use Valve logos.
- There is no logo. Set the name "Patron's Almanac" in `display-l` or `display-xl`, in `gilt`.

## Accessibility

- Every text colour meets 4.5:1 on `ground`, `surface` and `surface-raised` in both themes; `brass` and the team and result colours meet 3:1 for marks and borders.
- Never rely on colour alone: results carry words, teams carry names, chart series carry direct labels.
