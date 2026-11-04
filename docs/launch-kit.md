# Launch kit

Everything you need to publish button-graveyard and earn real stars. Nothing here involves buying or trading stars. The StarScout study (arXiv 2412.13459) found that fake stars give a boost of under two months and then become a liability.

## 1. Repo setup (before going public)

- **Name:** `button-graveyard`
- **Description (GitHub "About"):** `🪦 Your AI built 18 buttons. 10 do nothing. An agent skill that clicks every button, buries the dead ones, fixes them, and proves they're back. No API key.`
- **Topics:** `agent-skills` `claude-code` `claude-skills` `codex` `cursor` `playwright` `vibe-coding` `qa` `testing` `ui-testing` `dead-click` `developer-tools`
- **Social preview:** upload `assets/card-before.png` under Settings → Social preview. It's what shows up when the link is shared.
- **Release:** tag `v0.1.0` and also move a `v0` tag, so `uses: ada-lc826/button-graveyard@v0` works.
- **Pin the repo** on your GitHub profile.
- If your GitHub username isn't `ada-lc826`, search and replace it in README.md, README.zh-CN.md, SKILL.md, plugin.json and action.yml.

## 2. The one-line pitch (use the same one everywhere)

> Your AI built 18 buttons. 10 of them do nothing. button-graveyard clicks every one in a real browser, buries the dead ones, fixes them, and proves they came back to life.

Lead with the **demo GIF** or the **share card**, never with an architecture diagram.

## 3. Posts

### Show HN

**Title:** Show HN: Button Graveyard – an agent skill that clicks every button your AI built

> AI coding tools are great at producing UIs that *look* finished. In my projects, a surprising number of buttons had no handler, only `console.log('TODO')`, threw on click, or sat under an invisible decorative overlay.
>
> button-graveyard is a SKILL.md plus a Playwright script. It opens each control in a fresh browser context, measures the page's background noise (timers, polling), clicks, and watches for navigation, requests, DOM/ARIA changes, storage, clipboard, downloads, dialogs and canvas pixels. If nothing happens, it retries with a 3× window before calling the control dead. Verdicts are recorded events, not LLM opinions, and it needs no API key.
>
> Then your agent fixes the dead ones (it's told not to fake a toast to fool the checker) and rescans with `--compare` to show what was resurrected.
>
> Safety: localhost only by default, click-triggered POST/PUT/DELETE are intercepted and never sent, and destructive-looking controls are skipped.
>
> Limits: it only sees controls visible on load, needs a dev login bypass for auth'd pages, and "alive" doesn't mean "correct". Feedback on false positives is very welcome. Each one becomes a fixture.

### X / Twitter thread

1. Your AI built 18 buttons. 10 of them do nothing. 🪦 I made an agent skill that clicks every one and buries the dead. [card-before.png]
2. It's not an LLM guessing from code. A real browser clicks each button in isolation and records what happens: requests, DOM changes, navigation, downloads, dialogs, clipboard… [demo.gif]
3. Each dead button gets a tombstone with its last words. Yes, `console.log("TODO: share dashboard")` is a common cause of death. [report.png crop]
4. Then your agent fixes them and rescans: "9 buttons came back to life." [card-after.png]
5. Works in Claude Code, Codex, Cursor and Gemini CLI. No API key. `npx skills add ada-lc826/button-graveyard` → github.com/ada-lc826/button-graveyard

### Reddit (r/ClaudeAI, r/vibecoding, r/cursor, r/webdev)

**Title:** I scanned my vibe-coded dashboard: 10 of 18 buttons did nothing. Made a skill that finds and fixes them.

Body: the HN text, shortened, with the GIF. On r/webdev, lead with "Playwright script + safety model" rather than "AI".

### Chinese communities (掘金 / V2EX / 即刻 / 小红书 / 少数派)

**标题：** 我让 AI 写的后台有 18 个按钮，10 个点了没反应，于是做了个"按钮墓地" Skill

> AI 写的前端看起来都很完整，但很多按钮其实是摆设：没绑事件、只有 `console.log('TODO')`、一点就报错，或者被一层透明装饰层盖住。
>
> button-graveyard 会在真实浏览器里把每个按钮单独点一遍，扣掉页面自身的噪声后观察有没有任何效果。没反应的就"下葬"，附遗言和前后截图。然后让 Agent 修复并复扫，看有多少按钮"复活"。
>
> 不用 API Key，不靠大模型判断；默认只扫本地，写请求会被拦截不发出，删除/支付类按钮自动跳过。
>
> `npx skills add ada-lc826/button-graveyard`

小红书 / 即刻：直接发 `card-before.png` + `card-after.png` 两张图。配文：「AI 写的按钮，一半是假的 🪦→🧟」

## 4. Directories to submit to (one PR or form each)

- `VoltAgent/awesome-agent-skills`
- `ComposioHQ/awesome-claude-skills`
- `hesreallyhim/awesome-claude-code`
- skills.sh (the Vercel skills directory)
- Claude Code plugin marketplaces and community lists
- `awesome-playwright`, `awesome-testing`

## 5. Two-week schedule

| Day | Do |
|---|---|
| −7 to −1 | Run it on 5–10 of **your own** or friends' (with permission) AI-built apps. Every false positive becomes a fixture in `test/fixtures/haunted.html` |
| 0 (Tue/Wed, 8–10am US Eastern) | Show HN + X thread. Stay online for 6 hours and reply to everything |
| 1 | Reddit posts (one subreddit per hour, no cross-post spam) |
| 2 | Chinese communities |
| 3–7 | Submit to the directories. Write "the 5 ways AI-built buttons die" as a blog post using anonymised real findings |
| 8–14 | Ship the top-requested fix as v0.2 and post the changelog |

## 6. Things not to do

- Don't scan other people's live sites and post "X has 40 dead buttons". It's unauthorised testing, and it reads as shaming.
- Don't claim it "proves your app works". Alive ≠ correct.
- Don't hide unknown and skipped counts to make the headline bigger.

## 7. What to watch (stars come first, but they aren't the goal)

- **Reach:** stars, repo views, GIF and card shares
- **First value:** issues titled "it worked on my app", and the share of first scans that finish
- **Retention:** repos using the Action, people running `--compare` (that means they fixed something)
- **Quality:** false-positive reports. Fix these before any new feature
