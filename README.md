# ABLEMATION

One-click setup for church multitrack sessions in Ableton Live 12.

Every [MultiTracks.com](https://multitracks.com) song download drops into Ableton with the same tedious manual work — wrong return tracks, no routing, no sections, cluttered locators. ABLEMATION handles all of it in a single button press.

---

## Requirements

- Ableton Live 12
- Max for Live (included in Live Suite, or available as an add-on)

---

## Installation

1. Download this repository (green **Code** button → **Download ZIP**)
2. Unzip it
3. Copy the three files into your Ableton User Library:

```
~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/ABLEMATION/
    ABLEMATION.amxd
    ablemation.js
    config.json
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
4. Routes each return track to the correct hardware output (interface-agnostic — works with Dante Virtual Sound Card, Antelope Galaxy 32, and others)
5. Sets all audio tracks to **Sends Only**
6. Routes each audio track's send to the correct return bus via keyword matching
7. Creates a **SECTIONS** MIDI track at the top with arrangement clips for each song section
8. Replaces all MultiTracks locators with just two: song title at beat 0 and **STOP** at the end

---

## Hardware Output Map

| Return | Output |
|--------|--------|
| BAND | Ext. Out 1/2 |
| VOX | Ext. Out 3/4 |
| CLICK | Ext. Out 5 |
| GUIDE | Ext. Out 6 |
| LTC | Ext. Out 7 |
| BASS | Ext. Out 8 |
| AG | Ext. Out 9/10 |
| PERC | Ext. Out 11/12 |
| EGTR | Ext. Out 13/14 |
| HOOK | Ext. Out 15/16 |

Routing matches by leading channel number, so it works regardless of what your interface calls the outputs.

---

## One Manual Step

After running ABLEMATION, set your **Cue Out** manually:

In the master track mixer → set **Cue Out** to **Ext. Out 5**

This cannot be automated — Ableton's API does not expose Cue Out routing.

---

## Unmatched Tracks

If any audio tracks don't match a known keyword, they'll be listed in the device UI after the run. You can add keywords to `config.json` to handle them automatically next time.

---

## Track Keyword Map

| Keywords | → Return |
|----------|----------|
| band, synth, keys, keyboard, pad, piano, organ, strings, fx, rhodes, wurli, clav | BAND |
| vox, vocal, lead, bgv, bgvs, background, choir, bv | VOX |
| click, metronome, met | CLICK |
| guide, ref, reference, scratch | GUIDE |
| ltc, timecode, tc, smpte | LTC |
| bass, sub | BASS |
| ag, acoustic | AG |
| perc, percussion, drum, loop, conga, shaker, tamb, bongo | PERC |
| egtr, electric, elec, e gtr | EGTR |
| hook, feature, solo, vamp | HOOK |
