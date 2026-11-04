# Fixing dead buttons: the usual suspects

Use the `cause`, `reason`, `console`, `pageErrors`, `blocker` and `html` fields from `graveyard.json` to pick the section that fits.

## cause: no-op (nothing happened)

| Pattern | Looks like | Fix |
|---|---|---|
| Handler never attached | `<Button>Export</Button>` without `onClick` / `@click` / `on:click` | Wire it to the real action |
| Handler prop dropped by a wrapper | A custom `Button` that doesn't spread `...props` onto the native `<button>` | Forward `onClick`/`...rest` in the component |
| Called instead of passed | `onClick={handleExport()}` runs once on render and then does nothing | `onClick={handleExport}` or `onClick={() => handleExport(id)}` |
| Empty handler | `onClick={() => {}}`, `function handleSave() {}` | Implement it, or ask the user |
| Radix/shadcn trigger without `asChild` or outside its Root | `<DialogTrigger>` not inside `<Dialog>`, or a nested button swallowing the click | Put the trigger inside the Root, and use `asChild` when wrapping your own button |
| `href="#"` / `javascript:void(0)` link | Placeholder link that was never routed | Give it a real `href`/`<Link to>` or turn it into a button with a handler |
| Looks clickable but isn't (`origin: looks-clickable`) | A card or `div` with `cursor-pointer`/`hover:` styles and no handler | Add a handler and make it a `<button>`/`<a>` for keyboard access, or remove the pointer styling if it's not meant to be clickable |
| `e.preventDefault()` on a submit with no follow-up | Form `onSubmit` prevents default and does nothing else | Implement the submit |
| Condition always false | `if (user?.isPro) open()` when the flag is never set in dev | Fix the guard or show why it's unavailable |
| State updated but not rendered | `setOpen(true)` while the modal reads a different state or store | Point the UI and handler at the same source of truth |

## cause: stub (only logged)

The classic AI placeholder: `console.log('clicked')`, `console.log('TODO: implement export')`, `// TODO`. The log line is in `console[0]`. Search for that exact string and replace the stub with the real behaviour. If the backend endpoint doesn't exist, tell the user instead of faking a success state.

## cause: crashed (handler threw)

`pageErrors[0]` has the message. Typical ones:
- `Cannot read properties of undefined (reading 'x')`: a service, SDK or context isn't initialised in this environment (analytics, a store outside its Provider, a missing env var). Guard it or initialise it.
- `x is not a function`: an import or prop is wrong, often a default export imported as named or the reverse.
- `Failed to fetch`/`NetworkError` show up as requests, not crashes, so those controls are alive.

## verdict: blocked (buried alive)

`blocker` names the element on top, e.g. `<div class="absolute inset-0 ...">`.
- Decorative overlays (gradients, glows, "shine" effects): add `pointer-events-none`.
- An invisible modal or backdrop left mounted: unmount it when closed, or set `pointer-events: none` / `visibility: hidden`, not just `opacity: 0`.
- Stacking: a sticky header or a sibling with a higher `z-index` overlaps the control. Fix `z-index` or the layout.
- A full-card `<a>` covering inner buttons: give the inner buttons `relative z-10`, or restructure.

## Not dead, but worth telling the user

- `name` is empty (`no accessible name`): an icon-only control screen readers can't announce. Add `aria-label`.
- `confidence: medium`: the page had background DOM churn (timers, carousels). The verdict is still a recorded observation, but double-check by hand.
