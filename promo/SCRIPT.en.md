# button-graveyard: 40s launch video (English)

**Format:** 1080×1920 vertical · 30 fps · 40.5 s · H.264 + AAC. Works on X, YouTube Shorts, TikTok, Instagram Reels and LinkedIn.
**Tone:** deadpan horror-comedy. Night-graveyard palette (navy sky, moon, stone, blood-red for dead, moss-green for alive).
**Rule:** every number on screen comes from a real scan of `demo/broken` and `demo/fixed`. Nothing is mocked up.
**Safe zones:** key text stays above the bottom ~400 px and clear of the right 150 px (TikTok, Reels and Shorts put their buttons there).

| # | Time | Picture | On-screen text | Voiceover (optional) | Sound |
|---|---|---|---|---|---|
| 1 | 0.0–3.2 | Night sky, moon fades in, headline types out | **Your AI built this dashboard in 4 minutes.** / *it looks done.* | "Your AI built this dashboard in four minutes." | Low drone |
| 2 | 3.2–9.0 | The real Lumen dashboard. A cursor clicks Export CSV, then Share, then Filters | Export CSV → ~~nothing.~~ / Share → ~~nothing.~~ / Filters → ~~nothing.~~ / **Looks done. Isn't.** | "Export: nothing. Share: nothing. Filters: nothing." | Click, then a "womp" for each one |
| 3 | 9.0–11.2 | Words pop in one by one | **How many of your buttons are fake?** | "So how many of your buttons are fake?" | Beat drops |
| 4 | 11.2–16.5 | Terminal. You type to your agent; scan glyphs appear (`.` alive, `✝` dead, `▣` buried) | `find the dead buttons in my app` → 18 clicked · 7 alive · 6 dead · 4 buried alive / *No AI judgement. Every verdict is a recorded browser event.* | "It clicks every one, in a real browser. No AI guessing." | Typing, kick drum |
| 5 | 16.5–23.5 | Tombstones rise from the ground with their epitaphs; zoom on Share | **10 of 18 buttons do nothing.** / Last words of "Share": `console.log("TODO: share dashboard")` | "Ten of eighteen do nothing. This one's last words: TODO." | Stone thud on each landing |
| 6 | 23.5–26.5 | Close-up of the chart. An amber layer slides over the tabs; the click bounces off | **4 more were buried alive.** / Hidden under an invisible layer. Users click. Nothing gets through. | "Four more were buried alive, under an invisible glow." | Click, dull thunk |
| 7 | 26.5–30.5 | Code diff streams in | **Your agent fixes them.** / *Rule: no fake toasts to fool the scanner.* | "Your agent fixes them, for real. No fake toasts." | Pad lifts |
| 8 | 30.5–35.5 | The same stones glow green, lift off: RISEN | **9 buttons came back to life.** / rescan --compare · 16 alive · 0 dead | "Rescan. Nine buttons came back to life." | Rising chimes, chord turns major |
| 9 | 35.5–40.5 | Logo, install command types out, chips | **button-graveyard** · An agent skill · Click every button. Bury the dead. Prove the fix. · `npx skills add ada-lc826/button-graveyard` · ⭐ github.com/ada-lc826/button-graveyard | "button-graveyard. Open source. One command." | Final chord, fade |

## Post copy

### X (attach the video natively; don't link YouTube)

> Your AI built 18 buttons. 10 of them do nothing. 🪦
>
> button-graveyard is an agent skill that clicks every button in a real browser, buries the dead ones, fixes them, and proves they came back to life.
>
> No AI judgement. No API key. Claude Code / Codex / Cursor.
>
> `npx skills add ada-lc826/button-graveyard`

Reply to your own post with the repo link (links in the first post get less reach): github.com/ada-lc826/button-graveyard

### YouTube Shorts

**Title:** Your AI built 18 buttons. 10 do nothing. 🪦 #shorts
**Description:** button-graveyard clicks every button in your app in a real browser, buries the dead ones, fixes them, and proves they're back. Free & open source → github.com/ada-lc826/button-graveyard #vibecoding #claudecode #ai #coding #webdev

### TikTok / Reels

**Caption:** POV: you finally click every button your AI built 🪦→🧟 #vibecoding #coding #ai #programming #webdev #claudecode
**Pinned comment:** it's open source: github.com/ada-lc826/button-graveyard

### LinkedIn

> AI coding tools are brilliant at UIs that *look* finished. I scanned an AI-built dashboard: 10 of its 18 buttons did nothing. Some had no handler, some only logged "TODO", one threw an error, and four sat under an invisible decorative layer.
>
> So I built button-graveyard, an open-source agent skill. It clicks every control in a real browser, records what actually happens (no AI judging the result), has your agent fix the dead ones, then rescans to prove the fix.
>
> github.com/ada-lc826/button-graveyard

## Tips

- **Hook:** the first 2 seconds decide retention. If a platform shows a big drop-off, cut scene 7 to get a ~36 s version.
- **Sound:** the built-in soundtrack is synced to every click. On TikTok you can lower the original audio to ~30% and add a trending sound.
- **Timing:** US audiences peak around 8–10 am and 6–9 pm ET, which is 1–3 pm and 11 pm–2 am in London. Show HN does best on a Tuesday or Wednesday around 8–10 am ET.
- **Adding your voice:**
  ```bash
  ffmpeg -i button-graveyard-promo-en.mp4 -i voice.wav -filter_complex "[0:a]volume=0.4[m];[m][1:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy promo-en-voice.mp4
  ```

## Rebuild

```bash
cd promo
./build.sh en     # English → out-en/
./build.sh        # Chinese → out/
```
