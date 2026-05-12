# ABLEMATION — Dev Notes for Claude

## What This Is
Max for Live MIDI effect device that automates church multitrack session setup in Ableton Live 12. Used with MultiTracks.com song downloads. One button press handles everything that would otherwise be 10 minutes of manual setup.

**Owner:** Asa LeSage  
**GitHub:** https://github.com/gkjq2zh8bf-droid/ABLEMATION

---

## Version Bumping (REQUIRED)
Every time you make any code change to `ablemation.js`, bump `VERSION` before finishing.
- Bug fix or small improvement → increment the minor version (5.0 → 5.1 → 5.2)
- Major new feature or breaking change → increment the major version (5.x → 6.0)

`VERSION` is displayed in the device UI and written to every log file — it's the only reliable way to confirm the right code is actually running in Ableton.

## Current Version
**5.3** — Preserve first+last locators through deletion to stay at count≥2; swap last to stopBeat

## Changelog
- **5.3** — Step 7 never drains to count=0; keeps first+last original cues alive, deletes only middle cues, then swaps anchorLast→stopBeat via create+delete at count≥2; avoids count=1 always-delete entirely
- **5.2** — Same-tick title/STOP creation attempt (failed — Live updates count synchronously even within one JS call)
- **5.1** — Cleanup phase guarantees count=0 before creating title/STOP locators; SECTIONS track collapsed via `live_set tracks N view`; fresh LOM position read in step 7
- **5.0** — Config.json support, file-based logging, resolvePaths() fix, keyword word-boundary matching

---

## File Structure

| File | Purpose |
|------|---------|
| `ablemation.js` | All automation logic — the only file you'll edit |
| `ABLEMATION.amxd` | Max for Live device (compiled patcher) — do not edit directly |
| `config.json` | User-editable: return track names, channels, keyword map, colors |
| `ablemation-log.txt` | Written after every run — primary debugging tool |
| `README.md` | User-facing docs |

---

## What SETUP SESSION Does (Step Order)
0. Delete existing return tracks  
1. Create 10 return tracks (BAND, VOX, CLICK, GUIDE, LTC, BASS, AG, PERC, EGTR, HOOK)  
2. Color return tracks white, master track dark red  
3. Route each return track to the correct hardware output (matched by leading channel number)  
4. Set all audio tracks to Sends Only, route each send to correct return via keyword matching  
5. Create SECTIONS MIDI track at position 0, collapse it  
6. Build arrangement clips in SECTIONS from existing locator positions (or fallback section names)  
7. Delete all original locators, place song title at beat 0 and STOP at song end  

Steps 0–6 run synchronously. Step 7 is async (Task-based, 50ms per locator).

---

## How to Test a Change
1. Save `ablemation.js` — `autowatch = 1` reloads it automatically in Live
2. Confirm the device UI shows the new version number (e.g. `v5.1 — click SETUP SESSION to begin`)
3. Run SETUP SESSION
4. Read `ablemation-log.txt` — it's overwritten on every run

**What a successful run looks like in the log:**
```
Step 7: 24 locators found
Step 7: keep beat-0 + beat-646; deleting 22 middle cue(s)
  del[0] beat=8 remain=23
  del[1] beat=40 remain=22
  ...
  del[21] beat=634 remain=2
Step 7: 2 remain — swapping anchor-last to stopBeat
  created STOP at beat 648 count=3
  removed anchor-last beat=646 count=2
Step 7: naming pass — 2 cues:
  cue[0] beat=0 name="..."
  cue[1] beat=648 name="..."
  named beat-0 as title: verify=Song Title
  named beat-648 as STOP: verify=STOP
"Song Title" + STOP | final count: 2
DONE.
```

**Do not test on a polluted session.** Running ABLEMATION multiple times on the same .als accumulates locators from previous runs that interfere with deletion. Always use a fresh copy of the original MultiTracks .als when diagnosing locator behavior.

---

## Key Architecture Notes

### Paths / autowatch
- `this.patcher.filepath` is only reliable inside a function call, NOT at module scope during autowatch reloads. Always call it from inside `loadbang()` → `resolvePaths()`.
- `CONFIG_PATH` and `LOG_PATH` are set in `resolvePaths()`. If the log isn't being written, check that `DEVICE_FOLDER` isn't empty.

### Locator API (`set_or_delete_cue`)
- This is the ONLY way to create or delete locators in Live 12. There is no delete-by-index.
- It toggles at `current_song_time` — if a cue exists at that position, it deletes; if not, it creates.
- Rapid-fire calls in a single event-loop tick silently fail. Always use a Task with 50ms+ between calls.
- **count=1 always-delete rule (confirmed):** When exactly 1 cue exists, `set_or_delete_cue` deletes it regardless of position. This makes it impossible to go from count=0 → count=2 with sequential calls — the second call sees count=1 and deletes the first cue. Even same-tick calls (both in one JS execution) fail because Live updates the count synchronously.
- **Workaround:** Keep count ≥ 2 throughout step 7 by preserving the first and last original locators. Delete only middle cues. After the middle cues are gone (count=2), create at stopBeat (count→3), delete the old last locator (count→2), then rename. This completely avoids the count=1 trap.
- Cue positions from the LOM are exact floats. Read them fresh inside step 7 (not from the bang()-time snapshot) to avoid stale values.

### Track / Routing API
- Track collapse (fold) lives on `Track.view`, not the Track itself:  
  `new LiveAPI("live_set tracks N view").set("is_collapsed", 1)`
- Output routing uses `available_output_routing_types` / `available_output_routing_channels` — must be set as full JSON objects, not just IDs.
- Matching works by the **leading number** in the channel display name — interface-agnostic.

### Known Live 12 LOM Limitations (confirmed, cannot be worked around)
- **Cue Out routing** — not exposed. User must set manually: master track mixer → Cue Out → Ext. Out 5.
- **Delete cue by index** — does not exist. Only `set_or_delete_cue` toggle.
- **Arrangement view grid setting** — not readable/settable via LOM. Affects where `set_or_delete_cue` snaps when creating.

### config.json
Loaded on every device reload. All keys optional — missing keys keep built-in defaults. Structure:
```json
{
  "returnTracks": [{ "name": "BAND", "channel": "1" }, ...],
  "keywordMap":   [{ "return": "BAND", "keywords": ["band", "synth", ...] }, ...],
  "colors":       { "returnTracks": 16777215, "masterTrack": 11672627, "sectionsTrack": 0 },
  "fallbackSections": ["Intro", "Verse 1", "Chorus 1", "Bridge", "Outro"]
}
```
`keywordMap` is ordered — first match wins. Uses word-boundary regex so short keywords like `"ag"` don't accidentally match "Stage".

---

## Commit & Push
Always commit and push to GitHub after a working change. Use `gh` CLI:
```bash
cd "/Users/apostoliccollectivestudio/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/ABLEMATION"
git add ablemation.js config.json CLAUDE.md README.md
git commit -m "v5.x — description"
git push
```
