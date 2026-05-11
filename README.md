# ABLEMATION

**v5.0** — One-click setup for church multitrack sessions in Ableton Live 12.

Every [MultiTracks.com](https://multitracks.com) song download drops into Ableton with the same tedious manual work — wrong return tracks, no routing, no sections, cluttered locators. ABLEMATION handles all of it in a single button press.

---

## Requirements

- Ableton Live 12
- Max for Live (included in Live Suite, or available as an add-on)

---

## Installation

1. Download this repository (green **Code** button → **Download ZIP**)
2. Unzip it
3. Copy the four files into your Ableton User Library:

```
~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/ABLEMATION/
    ABLEMATION.amxd
    ablemation.js
    config.json
    LICENSE
```

> If the `ABLEMATION` folder doesn't exist, create it.

4. Restart Ableton (or rescan the library)
5. Find **ABLEMATION** under **Max MIDI Effect** in your browser and drag it onto any MIDI track

---

## What It Does

When you click **SETUP SESSION**:

1. Deletes any existing return tracks (MultiTracks ships with generic Reverb/Delay defaults)
2. Creates 10 return tracks: **BAND, VOX, CLICK, GUIDE, LTC, BASS, AG, PERC, EGTR, HOOK**
3. Colors return tracks white, master track dark red
4. Routes each return track to the correct hardware output (interface-agnostic — see below)
5. Sets all audio tracks to **Sends Only**
6. Routes each audio track's send to the correct return bus via keyword matching
7. Creates a **SECTIONS** MIDI track at the top with arrangement clips for each song section
8. Replaces all MultiTracks locators with just two: song title at beat 0 and **STOP** at the end

---

## Hardware Output Routing

Routing is **interface-agnostic** — it matches by the leading channel number in the output name, so it works with any audio interface (Dante Virtual Sound Card, Antelope Galaxy 32, RME, MOTU, etc.).

| Return | Output      | Leading # |
|--------|-------------|-----------|
| BAND   | Ext. Out 1/2  | 1  |
| VOX    | Ext. Out 3/4  | 3  |
| CLICK  | Ext. Out 5    | 5  |
| GUIDE  | Ext. Out 6    | 6  |
| LTC    | Ext. Out 7    | 7  |
| BASS   | Ext. Out 8    | 8  |
| AG     | Ext. Out 9/10 | 9  |
| PERC   | Ext. Out 11/12| 11 |
| EGTR   | Ext. Out 13/14| 13 |
| HOOK   | Ext. Out 15/16| 15 |

To use different outputs, edit the `returnTracks` array in `config.json`.

---

## One Manual Step

After running ABLEMATION, set your **Cue Out** manually:

In the master track mixer → set **Cue Out** to **Ext. Out 5**

This cannot be automated — Ableton's API does not expose Cue Out routing.

---

## Customizing Your Setup

Edit `config.json` to tailor ABLEMATION to your rig. All fields are optional — omit any section to keep the built-in defaults.

### Change Return Track Names or Output Channels

```json
"returnTracks": [
    { "name": "BAND",  "channel": "1" },
    { "name": "VOX",   "channel": "3" }
]
```

`channel` is matched against the **leading number** of Ableton's output display name. For a mono output labelled "Ext. Out 5", use `"5"`. For a stereo pair "Ext. Out 9-10", use `"9"`.

### Add or Change Keyword Mappings

```json
"keywordMap": [
    { "return": "BAND", "keywords": ["band", "synth", "keys", "piano"] },
    { "return": "VOX",  "keywords": ["vox", "vocal", "lead"] }
]
```

Order matters — the first matching entry wins. Keywords use word-boundary matching, so short keywords like `"ag"` won't accidentally match track names like "Stage".

### Change Track Colors

Colors are decimal RGB values (e.g., `16777215` = white, `0` = black).

```json
"colors": {
    "returnTracks":  16777215,
    "masterTrack":   11672627,
    "sectionsTrack": 0
}
```

### Fallback Section Names

If the song has no locators, ABLEMATION creates SECTIONS clips using this list:

```json
"fallbackSections": ["Intro", "Verse 1", "Chorus 1", "Bridge", "Outro"]
```

---

## Unmatched Tracks

If any audio tracks don't match a keyword, they'll be listed in the device UI after the run. Add their keywords to `config.json` to handle them automatically next time.

---

## Track Keyword Map (Defaults)

| Keywords | → Return |
|----------|----------|
| band, synth, keys, keyboard, pad, piano, organ, strings, fx, rhodes, wurli, clav | BAND |
| vox, vocal, lead, bgv, bgvs, background, choir, bv | VOX |
| click, metronome, met | CLICK |
| guide, ref, reference, scratch | GUIDE |
| ltc, timecode, smpte | LTC |
| bass, sub | BASS |
| ag, acoustic | AG |
| perc, percussion, drum, loop, conga, shaker, tamb, bongo | PERC |
| egtr, electric, elec | EGTR |
| hook, feature, solo, vamp | HOOK |

---

## License

MIT — see [LICENSE](LICENSE)
