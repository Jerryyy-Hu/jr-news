# JR News

A Chinese-language daily financial news archive with beginner-friendly explanations for A-shares, US equities, and global drivers.

## Read the site

Each edition covers `(previous day 22:00, edition day 22:00]` in `Asia/Shanghai`. The edition date is the reporting cutoff, not necessarily the exchange's trading date. Historical editions are labeled as retrospective backfills. Unverified future outcomes must never be inserted into an earlier edition.

The site supports date navigation, direct article links, category and market filters, archive search, and a glossary derived from the news. Each article contains a one-sentence event/impact summary, visible analysis, a plain-language concept and example, follow-up observations, caveats, and source links. Market impacts are editorial inferences, not guaranteed price movements.

The desktop archive orders the latest edition first, top to bottom. At the mobile breakpoint it switches the actual button order to oldest-to-latest horizontally, preserving rightmost-latest navigation and edge fades. Breakpoint changes preserve the selected date and keyboard focus.

Pointer interactions use brief button feedback, selection transitions, interruptible content fades, and reversible lesson expansion. Search typing and keyboard actions are immediate; reduced-motion preferences disable movement. News cards do not replay staggered entrance animations on every filter or search update. No animation dependency is required.

News summaries automatically highlight the opening factual clause and, when present, the first conditional-impact clause in purple. This is a text-selection rule, not an additional factual judgment; optional `item.highlights` may supply up to three exact summary excerpts for editorial selection. Original wording, figures, and uncertainty qualifiers are preserved.

Financial terms use gray underlined links to a focused glossary entry. Each knowledge point is linked only at its first occurrence within an article, in reading order, including its expanded lesson. Each entry lists all related news examples across dates; following an example clears news filters and opens that article's lesson. Term links support direct URLs, browser Back/Forward, keyboard navigation, and opening in a new tab. Matching uses the longest known label first and preserves plain text safely. New lessons are indexed automatically from `knowledge.term`; optional `knowledge.aliases` can supply specific alternative labels that the lesson actually explains. Keep aliases precise and avoid generic words with unrelated meanings.

## Local preview

No dependencies or build framework are required. From the project directory:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765`. An offline single-file preview can also be generated:

```powershell
node scripts/build-preview.mjs
node scripts/validate.mjs
node --check app.js
```

The preview is written outside this source directory and is not a second live site.

## Daily updates

The existing Codex automation runs daily at 22:00 Asia/Shanghai. It performs research and updates this repository; GitHub Pages hosts the results. There is no duplicate GitHub schedule and no API key in the browser.

1. Read the current repository `main` and existing date manifest before editing.
2. Research only important information published within the edition's 24-hour window. Prefer official sources and established newsrooms. Merge duplicate reports; preserve publication versus event timestamps and time zones.
3. Create or update `data/YYYY-MM-DD.json` with the schema below. Use a stable, archive-unique article ID. Preserve earlier editions. Never invent timestamps, consensus forecasts, or missing results.
4. Add the date to `data/index.json`, keep dates descending, and update `latestDate`, `nextEdition`, and `updatedAt`.
5. Validate the complete archive and JavaScript. Update only the necessary data and provenance files in one Git commit through the GitHub connector. Use a fast-forward ref update against the observed branch head.
6. Confirm GitHub Pages deployment succeeds and read back the published manifest and new edition before reporting completion. If publication fails, preserve prepared content and report the concrete failure.

The user authorized GitHub publication and subsequent scheduled updates on November 5, 2026. Do not ask again for the same routine publication scope. Publishing infrastructure may introduce a delay after the 22:00 research trigger; the reporting cutoff remains exactly 22:00.

## Data schema

```json
{
  "date": "YYYY-MM-DD",
  "windowStart": "previous-dateT22:00:00+08:00",
  "windowEnd": "edition-dateT22:00:00+08:00",
  "outlook": "One Chinese sentence describing the information-based market direction.",
  "coverageNote": "Coverage limits and exchange-date clarification.",
  "backfilled": false,
  "items": [{
    "id": "archive-unique-id",
    "category": "positive | negative | neutral",
    "markets": ["A股", "美股"],
    "topic": "Topic label",
    "publishedAt": "ISO timestamp or null when unavailable",
    "timeLabel": "Human-readable time with publication/event meaning",
    "title": "Short headline",
    "summary": "One sentence containing the event and possible market impact.",
    "analysis": "A beginner-friendly causal explanation and its limits.",
    "knowledge": {"term": "Concept", "explanation": "Definition", "example": "Clearly hypothetical example"},
    "watch": "What to observe next",
    "caveat": "What the evidence does not establish",
    "sources": [{"name": "Source", "url": "https://...", "verification": "full_text | search_excerpt"}]
  }]
}
```

If publication time is unavailable, use a verified `eventAt` timestamp or an explicit approximate `eventDate` plus a time-zone explanation. Mark search-only verification honestly. Source pages may change; preserve verified values in the edition rather than silently replacing history.

## Frontend interaction and accessibility

News summaries use 15px type and explanations use 14px type, with larger secondary labels. Touch search/select inputs use at least 16px and retain browser zoom. Long financial text and source names wrap in full. Safe-area padding supports edge-to-edge mobile browsers without blocking native document or archive scrolling.

Desktop dates remain newest first and use a bounded native vertical scroller as the archive grows; mobile dates remain oldest left, newest right with native horizontal scrolling and conditional edge fades. Changing the breakpoint preserves the selected date and keyboard focus. Glossary heading IDs encode spaces and punctuation while shareable hashes keep the original term.

Financial content and counts change immediately. Lessons expand without layout animation and reveal text over 140ms; closing is immediate. A single 180ms transform-based indicator moves between views. Date titles and outlook text share a subtle 140ms fade while article cards stay immediately readable. Category colors transition over 140ms; mobile archive edges fade over 120ms according to actual overflow and avoid fully visible selected dates. Navigation waits for native scrolling to settle, then gives the destination a single 280ms background wash. Pending destinations and opacity animations are canceled or retargeted on interruption. A painted, visible loading state hands off over 120ms without extending network loading or forcing a skeleton for fast loads.

Keyboard input and the existing reduced-motion preferences disable motion; hover feedback requires a fine pointer with hover capability. Navigation adds history entries without duplicating the same URL. Real-device touch and visual regression checks remain separate from offline DOM contract checks. Private fixture routes and motion-environment emulation are kept outside the public site source.

## Deployment

GitHub Pages publishes the root of `main`. `.nojekyll` keeps these static assets unchanged. Do not commit the old `dist/` draft, workspace handoffs, credentials, personal data, or the generated offline preview. There are no external fonts, analytics, or runtime financial-data credentials.
