---
name: button-graveyard
description: Finds buttons, links and clickable elements in a web app that do nothing when clicked (missing handlers, TODO stubs, handlers that throw, controls hidden under invisible overlays). It clicks every one in a real headless browser and records evidence, with no AI judging the results. Then it fixes them and rescans to prove they work. Use when the user wants to check whether their UI actually works, find dead, broken or fake buttons, smoke-test an AI-generated or vibe-coded frontend before a demo, PR or launch, or confirm that button fixes landed.
license: MIT
compatibility: Needs Node 18+ and Playwright with Chromium (installed on first run into ~/.cache/button-graveyard). The app must be reachable from this machine, normally a local dev server.
metadata:
  version: 0.1.0
  repo: https://github.com/ada-lc826/button-graveyard
---

# Button Graveyard

AI-built UIs often *look* finished while half the buttons do nothing. This skill finds those buttons with evidence rather than opinion, fixes them, and proves the fix with a rescan.

The scanner (`scripts/graveyard.mjs`, in this skill's folder) is deterministic. It enumerates every visible control, clicks each one in a **fresh browser context**, and watches for real effects: navigation, new tabs, downloads, dialogs, file pickers, network requests, DOM/ARIA changes, storage, clipboard, scroll and canvas pixels. It subtracts the page's own background noise (clocks, polling) first. Nothing in the verdict comes from a model, so **you must not override its verdicts from reading code**. Report what it observed.

## Workflow

### 1. Get a URL

Find or start the app's dev server (check `package.json` scripts: `dev`, `start`, `preview`). Use the URL it prints, e.g. `http://localhost:3000`. If the important screens are on other routes, collect them too (`/`, `/dashboard`, `/settings`). Static HTML works as `file:///abs/path/index.html`.

Only scan localhost or `file://`. For any other host the user must confirm they own it and it holds disposable data; only then pass `--i-own-this-app`.

### 2. Make sure Playwright exists (first run only)

```bash
node <skill-dir>/scripts/graveyard.mjs --help
```

If it says Playwright is missing, install it into the private cache. This does not touch the user's package.json:

```bash
npm install --prefix ~/.cache/button-graveyard playwright
~/.cache/button-graveyard/node_modules/.bin/playwright install chromium
```

### 3. Scan

```bash
node <skill-dir>/scripts/graveyard.mjs http://localhost:3000 http://localhost:3000/dashboard --out .button-graveyard
```

It takes roughly 1–2 s per control with 4 parallel contexts. Outputs in `--out`:

| File | Use |
|---|---|
| `graveyard.json` | Machine-readable results. **Read this.** Each dead entry has `selector`, `html`, `reason`, `cause`, `console`, `pageErrors` and a ready-made `fixPrompt` |
| `graveyard.html` | The human report (tombstones, before/after screenshots). Tell the user to open it |
| `graveyard.md` | Summary table for chat or a PR comment |
| `card.png` | 1200×630 share card |

Add `.button-graveyard/` to `.gitignore` if it isn't already.

### 4. Report honestly

Give the counts exactly as printed: alive / dead / buried alive / unknown / skipped. Then list the dead and buried-alive controls with their reasons. Mention that the HTML report has screenshots. Don't round "dead" up into "broken app", and don't hide unknown or skipped items.

The verdicts:
- **dead**: clicked twice (normal window, then a 3× longer one) with no observable effect. `cause` is one of:
  - `no-op`: nothing happened
  - `stub`: it only wrote to the console
  - `crashed`: the handler threw
- **blocked** ("buried alive"): another element intercepts the click. The `blocker` field names it.
- **unknown**: no reliable observation (not visible, unstable, page re-rendered). Never call these dead.
- **skipped**: deliberately not clicked (looks destructive, disabled, external link, mailto). Never call these dead.
- **alive**: something observable happened. That doesn't prove the feature is *correct*.

### 5. Fix (ask first if the user only asked for a check)

For each dead or blocked control:

1. Locate it in source. Search for its label text, `id`, `data-testid` or distinctive classes from `html`. Labels may come from i18n files or props, so follow the trail.
2. Diagnose it with [references/fixing-dead-buttons.md](references/fixing-dead-buttons.md), which covers the common patterns by framework.
3. Make it do **what its label promises**. If the feature truly doesn't exist yet, ask the user: build it, hide or disable the control, or show an honest "coming soon" state.

**Never game the scanner.** Don't add a fake toast, a dummy `setState`, an empty `fetch`, a `console.log` or any other side effect whose only purpose is to make the control register as alive. That is the exact problem this skill exists to catch. If you can't implement a feature, say so.

### 6. Prove it: rescan with `--compare`

```bash
cp .button-graveyard/graveyard.json .button-graveyard/before.json
node <skill-dir>/scripts/graveyard.mjs <same urls> --out .button-graveyard --compare .button-graveyard/before.json
```

The terminal, HTML and card then show **resurrected** controls (dead → alive) and any **newly dead** regressions. Report both. If a "fixed" control is still dead, it isn't fixed: go back to step 5.

## Useful options

| Flag | Effect |
|---|---|
| `--wait <ms>` | Observation window per click (default 1500). Raise it for slow backends |
| `--only <regex>` / `--skip <regex>` | Limit to, or exclude, controls by label/selector |
| `--selector <css>` | Treat extra elements as controls (custom components) |
| `--fail-on-dead` | Exit code 1 if anything is dead or blocked (CI) |
| `--allow-writes` | By default POST/PUT/PATCH/DELETE fired *by a click* are intercepted and recorded (still count as alive) but never sent. This flag lets them through |
| `--allow-danger` | Also click delete, pay, logout, send and similar controls. Only with the user's explicit OK, on disposable data |

## Limits (say these when relevant)

- Only controls visible on initial load are tested. Items inside closed menus, modals or later wizard steps aren't reached. Scan the route that shows them, or open them via a URL state if the app supports one.
- Pages behind login need a dev bypass or a seeded test session. The scanner doesn't type credentials.
- Effects that happen only in a backend with no request, or only in IndexedDB, aren't observed.
- Actions that change nothing *from the current state* can look dead, like "Reset" when everything is already at its default or "Mark all read" with nothing unread. Check the state before you call these bugs.
- "Alive" means something happened, not that the right thing happened.
