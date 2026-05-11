// ABLEMATION v4.1 - Automated Ableton Session Setup
// Max for Live JavaScript Device
autowatch = 1;
inlets  = 1;
outlets = 2; // 0: status text,  1: failure summary / unmatched tracks

var VERSION = "4.1";

// Log file written after every run — Claude reads this directly (no copy-paste needed)
var LOG_PATH = "/Users/apostoliccollectivestudio/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/ABLEMATION/ablemation-log.txt";

// Runtime state — reset at start of each bang()
var _failures  = [];
var _logBuffer = [];

post("[ABLEMATION] ablemation.js v" + VERSION + " loaded\n");

function loadbang() {
    outlet(0, "v" + VERSION + " — click SETUP SESSION to begin");
}

// ─── Config ───────────────────────────────────────────────────────────────────

var RETURN_TRACKS = [
    { name: "BAND",  channel: "1"  },   // → Ext. Out 1/2
    { name: "VOX",   channel: "3"  },   // → Ext. Out 3/4
    { name: "CLICK", channel: "5"  },   // → Ext. Out 5
    { name: "GUIDE", channel: "6"  },   // → Ext. Out 6
    { name: "LTC",   channel: "7"  },   // → Ext. Out 7
    { name: "BASS",  channel: "8"  },   // → Ext. Out 8
    { name: "AG",    channel: "9"  },   // → Ext. Out 9/10
    { name: "PERC",  channel: "11" },   // → Ext. Out 11/12
    { name: "EGTR",  channel: "13" },   // → Ext. Out 13/14
    { name: "HOOK",  channel: "15" }    // → Ext. Out 15/16
];

var CUE_CHANNEL = "5";  // Cue/headphone output → same hardware channel as CLICK

var KEYWORD_MAP = {
    "BAND":  ["band", "synth", "keys", "keyboard", "pad", "piano", "organ", "strings", "fx", "rhodes", "wurli", "clav"],
    "VOX":   ["vox", "vocal", "lead", "bgv", "bgvs", "background", "choir", "bv"],
    "CLICK": ["click", "metronome", "met"],
    "GUIDE": ["guide", "ref", "reference", "scratch"],
    "LTC":   ["ltc", "timecode", "tc", "smpte"],
    "BASS":  ["bass", "sub"],
    "AG":    ["ag", "acoustic"],
    "PERC":  ["perc", "percussion", "drum", "loop", "conga", "shaker", "tamb", "bongo"],
    "EGTR":  ["egtr", "electric", "elec", "e gtr"],
    "HOOK":  ["hook", "feature", "solo", "vamp"]
};

var COLOR_WHITE    = 16777215;  // 0xFFFFFF
var COLOR_BLACK    = 0;         // 0x000000
var COLOR_DARK_RED = 11672627;  // 0xB21E33

var SEND_UNITY = 1.0;
var SEND_MIN   = 0.0003162277571;  // Ableton's minimum (not zero)

// ─── Logging ──────────────────────────────────────────────────────────────────

// Internal: Max Console + log buffer (no outlet update)
function appendLog(msg) {
    post("[ABLEMATION] " + msg + "\n");
    _logBuffer.push(msg);
}

// User-facing: Max Console + log buffer + status outlet
function log(msg) {
    post("[ABLEMATION] " + msg + "\n");
    _logBuffer.push(msg);
    outlet(0, msg);
}

function reportFailure(msg) {
    _failures.push(msg);
    appendLog("FAIL: " + msg);
}

// Write full run log to disk so it can be read without copy-paste
function flushLog() {
    var d = new Date();
    var timestamp = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() +
                    " " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
    var header  = "=== ABLEMATION v" + VERSION + " — " + timestamp + " ===";
    var content = header + "\n" + _logBuffer.join("\n") + "\n";
    try {
        var f = new File(LOG_PATH, "write");
        if (f.isopen) {
            f.writestring(content);
            f.close();
            post("[ABLEMATION] Log saved: " + LOG_PATH + "\n");
        } else {
            post("[ABLEMATION] WARNING: Could not open log file for writing\n");
        }
    } catch(e) {
        post("[ABLEMATION] Log write error: " + e.message + "\n");
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ls() { return new LiveAPI("live_set"); }

function extractIds(raw) {
    var ids = [];
    if (!raw) return ids;
    for (var i = 0; i < raw.length; i++) {
        if (typeof raw[i] === "number" && raw[i] > 0) ids.push(raw[i]);
    }
    return ids;
}

function getDisplayName(id) {
    var obj = new LiveAPI("id " + id);
    var dn  = obj.get("display_name");
    if (!dn) return "";
    if (typeof dn === "string") return dn.trim();
    return dn.length ? String(dn[0]).trim() : "";
}

// Match a channel display_name by leading digits — interface-agnostic
// "7" matches "7", "7 LTC", "7/8", "Output 7", etc.
function channelMatchesTarget(displayName, targetLeadingNum) {
    var dn  = String(displayName).trim();
    var tgt = String(targetLeadingNum).trim();
    if (dn === tgt) return true;
    return new RegExp("^" + tgt + "([^0-9]|$)").test(dn);
}

// ─── Output Routing (Live 12 API) ────────────────────────────────────────────
//
// Live 12 routing LOM: properties live on Track (not mixer_device).
// GET returns a single-element array containing a JSON string:
//   raw[0] = '{"available_output_routing_types": [{...}, ...]}'
// SET requires the full JSON object as a string — integer identifiers fail silently.

function parseRoutingJson(raw, key) {
    if (!raw || raw.length === 0) return [];
    try {
        var obj = JSON.parse(raw[0]);
        var val = obj[key];
        if (val === undefined || val === null) return [];
        return Array.isArray(val) ? val : [val];
    } catch (e) {
        appendLog("JSON parse error (" + key + "): " + e.message);
        return [];
    }
}

function setExtOutput(trackPath, targetLeadingNum) {
    var track    = new LiveAPI(trackPath);
    var types    = parseRoutingJson(track.get("available_output_routing_types"), "available_output_routing_types");
    var extNames = ["ext. out", "ext out", "external", "hardware output"];
    var extObj   = null;

    for (var i = 0; i < types.length; i++) {
        var dn = String(types[i].display_name || "").toLowerCase();
        for (var n = 0; n < extNames.length; n++) {
            if (dn.indexOf(extNames[n]) !== -1) { extObj = types[i]; break; }
        }
        if (extObj) break;
    }

    if (!extObj) {
        appendLog("WARNING: No Ext.Out type for " + trackPath);
        for (var i = 0; i < types.length; i++) {
            appendLog("  type available: '" + types[i].display_name + "' id=" + types[i].identifier);
        }
        return false;
    }

    track.set("output_routing_type", JSON.stringify(extObj));

    var channels = parseRoutingJson(track.get("available_output_routing_channels"), "available_output_routing_channels");
    var chObj    = null;

    for (var j = 0; j < channels.length; j++) {
        if (channelMatchesTarget(String(channels[j].display_name || ""), targetLeadingNum)) {
            chObj = channels[j];
            break;
        }
    }

    if (!chObj) {
        appendLog("WARNING: No channel matching '" + targetLeadingNum + "' for " + trackPath);
        for (var j = 0; j < channels.length; j++) {
            appendLog("  channel available: '" + channels[j].display_name + "' id=" + channels[j].identifier);
        }
        return false;
    }

    track.set("output_routing_channel", JSON.stringify(chObj));
    return true;
}

function setSendsOnly(trackPath) {
    var track       = new LiveAPI(trackPath);
    var types       = parseRoutingJson(track.get("available_output_routing_types"), "available_output_routing_types");
    var sendsNames  = ["sends only", "sends", "no output", "none", "---"];
    var masterNames = ["master", "main"];
    var firstNonMasterType = null;

    for (var i = 0; i < types.length; i++) {
        var dn = String(types[i].display_name || "").toLowerCase();
        for (var n = 0; n < sendsNames.length; n++) {
            if (dn === sendsNames[n] || dn.indexOf(sendsNames[n]) !== -1) {
                track.set("output_routing_type", JSON.stringify(types[i]));
                return true;
            }
        }
        if (!firstNonMasterType && dn !== "") {
            var isMaster = false;
            for (var m = 0; m < masterNames.length; m++) {
                if (dn.indexOf(masterNames[m]) !== -1) { isMaster = true; break; }
            }
            if (!isMaster) firstNonMasterType = types[i];
        }
    }

    if (firstNonMasterType) {
        track.set("output_routing_type", JSON.stringify(firstNonMasterType));
        return true;
    }
    return false;
}

// ─── Track / Name helpers ─────────────────────────────────────────────────────

function matchTrackToReturn(trackName) {
    var lower = trackName.toLowerCase().trim();
    if (/^eg[\s\d]/.test(lower)) return "EGTR";
    for (var r in KEYWORD_MAP) {
        if (!KEYWORD_MAP.hasOwnProperty(r)) continue;
        var kws = KEYWORD_MAP[r];
        for (var k = 0; k < kws.length; k++) {
            if (lower.indexOf(kws[k]) !== -1) return r;
        }
    }
    return null;
}

function returnIndexByName(name) {
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        if (RETURN_TRACKS[i].name === name) return i;
    }
    return -1;
}

// ─── Cue point reader (run BEFORE any modifications) ─────────────────────────

function readCuePoints() {
    var liveSet = ls();
    var count   = liveSet.getcount("cue_points");
    var cues    = [];
    for (var i = 0; i < count; i++) {
        var cp      = new LiveAPI("live_set cue_points " + i);
        var nameArr = cp.get("name");
        var timeArr = cp.get("time");
        var cpName  = (nameArr && nameArr.length) ? String(nameArr[0]).trim() : "";
        var cpTime  = (timeArr && timeArr.length) ? parseFloat(timeArr[0])   : 0;
        cues.push({ name: cpName, time: cpTime });
    }
    cues.sort(function(a, b) { return a.time - b.time; });
    appendLog("Read " + count + " cue points");
    return cues;
}

function getActualSongEnd(liveSet, beatsPerBar) {
    var actualEnd  = 0;
    var trackCount = liveSet.getcount("tracks");
    for (var t = 0; t < trackCount; t++) {
        var tr   = new LiveAPI("live_set tracks " + t);
        var nArr = tr.get("name");
        var name = nArr ? String(nArr[0]).toUpperCase() : "";
        if (name === "SECTIONS") continue;

        var clipCount = tr.getcount("arrangement_clips");
        for (var c = 0; c < clipCount; c++) {
            var clip    = new LiveAPI("live_set tracks " + t + " arrangement_clips " + c);
            var endArr  = clip.get("end_time");
            var clipEnd = 0;
            if (endArr && endArr.length > 0 && parseFloat(endArr[0]) > 0) {
                clipEnd = parseFloat(endArr[0]);
            } else {
                var startArr = clip.get("start_time");
                var lenArr   = clip.get("length");
                if (startArr && startArr.length > 0 && lenArr && lenArr.length > 0) {
                    clipEnd = parseFloat(startArr[0]) + parseFloat(lenArr[0]);
                }
            }
            if (clipEnd > actualEnd) actualEnd = clipEnd;
        }
    }
    if (actualEnd > 0) {
        var bars = Math.ceil(actualEnd / beatsPerBar);
        return (bars + 1) * beatsPerBar;
    }
    return 256;
}

// ─── Step 0: Delete existing return tracks ────────────────────────────────────

function step0_cleanup() {
    var liveSet = ls();
    var count   = liveSet.getcount("return_tracks");
    log("Step 0: Removing " + count + " existing return track(s)...");
    for (var i = count - 1; i >= 0; i--) {
        liveSet.call("delete_return_track", i);
    }
}

// ─── Step 1: Create 10 return tracks ─────────────────────────────────────────

function step1_createReturns() {
    log("Step 1: Creating return tracks...");
    var liveSet = ls();
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        liveSet.call("create_return_track");
        var rt = new LiveAPI("live_set return_tracks " + i);
        rt.set("name", RETURN_TRACKS[i].name);
    }
}

// ─── Step 2: Colors ───────────────────────────────────────────────────────────

function step2_colorTracks() {
    log("Step 2: Applying colors...");
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        var rt = new LiveAPI("live_set return_tracks " + i);
        rt.set("color", COLOR_WHITE);
    }
    var master = new LiveAPI("live_set master_track");
    master.set("color", COLOR_DARK_RED);
}

// ─── Step 3: Route return tracks to hardware outputs ──────────────────────────

function step3_routeOutputs() {
    log("Step 3: Routing return tracks to hardware outputs...");
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        var path = "live_set return_tracks " + i;
        var ok   = setExtOutput(path, RETURN_TRACKS[i].channel);
        if (!ok) {
            log("  WARNING: " + RETURN_TRACKS[i].name + " routing failed");
            reportFailure(RETURN_TRACKS[i].name + " output routing failed");
        }
    }
    log("  Step 3 done.");
}

// ─── Step 3b: Cue output notice ───────────────────────────────────────────────
//
// The Cue Out hardware routing dropdown is NOT exposed in the Live 12 LOM.
// Confirmed via official Cycling '74 LOM docs and AbletonOSC source.
// No property on Song, master_track, or MixerDevice gives access to it.
// The user must set this manually in the master track mixer.

function step3b_routeCueOutput() {
    log("Step 3b: CUE OUT must be set manually.");
    appendLog("Step 3b: Cue Out routing is not accessible in the Live 12 LOM (confirmed, not a bug).");
    appendLog("Step 3b: User action required: in master track mixer, set Cue Out to Ext. Out 5.");
}

// ─── Step 4: Audio tracks → Sends Only + route sends ─────────────────────────

function step4_routeSends() {
    log("Step 4: Routing audio tracks...");
    var liveSet    = ls();
    var trackCount = liveSet.getcount("tracks");
    var unmatched  = [];
    var matched    = 0;

    for (var i = 0; i < trackCount; i++) {
        var track  = new LiveAPI("live_set tracks " + i);
        var hasOut = track.get("has_audio_output");
        var hasIn  = track.get("has_audio_input");
        if (!hasOut || hasOut[0] !== 1) continue;
        if (!hasIn  || hasIn[0]  !== 1) continue;

        var nameArr   = track.get("name");
        var trackName = nameArr ? String(nameArr[0]) : "";
        if (trackName.toUpperCase() === "SECTIONS") continue;

        setSendsOnly("live_set tracks " + i);

        var matchedReturn = matchTrackToReturn(trackName);
        var returnIdx     = matchedReturn ? returnIndexByName(matchedReturn) : -1;
        var returnCount   = liveSet.getcount("return_tracks");

        for (var s = 0; s < returnCount; s++) {
            var send = new LiveAPI("live_set tracks " + i + " mixer_device sends " + s);
            send.set("value", s === returnIdx ? SEND_UNITY : SEND_MIN);
        }

        if (returnIdx === -1) {
            unmatched.push(trackName);
            reportFailure("Track \"" + trackName + "\" — no keyword match, send not assigned");
        } else {
            matched++;
        }
    }

    appendLog("Step 4: matched=" + matched + " unmatched=" + unmatched.length);
    if (unmatched.length > 0) {
        appendLog("  Unmatched tracks: " + unmatched.join(", "));
    }
    log("  Matched: " + matched + " | Unmatched: " + unmatched.length);
}

// ─── Step 5: Create SECTIONS MIDI track at position 0 ─────────────────────────

function step5_createSections() {
    log("Step 5: Creating SECTIONS track...");
    var liveSet    = ls();
    var trackCount = liveSet.getcount("tracks");

    for (var i = 0; i < trackCount; i++) {
        var tr      = new LiveAPI("live_set tracks " + i);
        var nameArr = tr.get("name");
        if (nameArr && String(nameArr[0]).toUpperCase() === "SECTIONS") {
            liveSet.call("delete_track", i);
            break;
        }
    }

    liveSet.call("create_midi_track", 0);
    var sections = new LiveAPI("live_set tracks 0");
    sections.set("name", "SECTIONS");
    sections.set("color", COLOR_BLACK);
    log("  Step 5 done.");
}

// ─── Step 6: Create ARRANGEMENT clips from cue points ─────────────────────────

function step6_buildArrangementClips(cues) {
    log("Step 6: Building arrangement clips on SECTIONS track...");
    var liveSet     = ls();
    var sigNum      = liveSet.get("signature_numerator");
    var beatsPerBar = (sigNum && sigNum.length) ? parseInt(sigNum[0]) : 4;
    var fallbackLen = 8 * beatsPerBar;

    var sectionsIdx = -1;
    var trackCount  = liveSet.getcount("tracks");
    for (var t = 0; t < trackCount; t++) {
        var tr = new LiveAPI("live_set tracks " + t);
        var n  = tr.get("name");
        if (n && String(n[0]).toUpperCase() === "SECTIONS") {
            sectionsIdx = t;
            break;
        }
    }

    if (sectionsIdx === -1) {
        log("  ERROR: SECTIONS track not found");
        reportFailure("SECTIONS track missing — clip creation skipped");
        return;
    }

    var clips = [];
    for (var i = 0; i < cues.length; i++) {
        if (cues[i].name !== "") clips.push(cues[i]);
    }

    if (clips.length === 0) {
        clips = [
            { name: "Intro",    time: 0 },
            { name: "Verse 1",  time: fallbackLen },
            { name: "Chorus 1", time: fallbackLen * 2 },
            { name: "Bridge",   time: fallbackLen * 3 },
            { name: "Outro",    time: fallbackLen * 4 }
        ];
    }

    var sectionsTrack = new LiveAPI("live_set tracks " + sectionsIdx);

    for (var j = 0; j < clips.length; j++) {
        var startBeat = clips[j].time;
        var clipLen   = (j < clips.length - 1)
            ? Math.max(clips[j + 1].time - clips[j].time, beatsPerBar)
            : fallbackLen;

        sectionsTrack.call("create_midi_clip", startBeat, clipLen);

        var clipCount = sectionsTrack.getcount("arrangement_clips");
        for (var k = 0; k < clipCount; k++) {
            var c        = new LiveAPI("live_set tracks " + sectionsIdx + " arrangement_clips " + k);
            var startArr = c.get("start_time");
            if (startArr && startArr.length > 0 && Math.abs(parseFloat(startArr[0]) - startBeat) < 0.5) {
                c.set("name", clips[j].name);
                c.set("color", COLOR_BLACK);
                break;
            }
        }
    }

    log("  Created " + clips.length + " arrangement clip(s).");
}

// ─── Step 7: Replace locators with song title + STOP ──────────────────────────
//
// Live 12 LOM: set_or_delete_cue() is the only way to create/delete locators.
// It toggles at current_song_time: locator exists there → deletes; none → creates.
//
// CRITICAL: calling set_or_delete_cue in a tight loop silently does nothing —
// Live 12 only processes it when the JS thread yields. Solution: use a repeating
// Task (50ms interval) that fires once per deletion, giving Live time to process
// each toggle before the next one. Step 7 is therefore async and takes a callback.

function step7_replaceLocators(cues, onDone) {
    log("Step 7: Replacing locators...");
    var liveSet = ls();

    var nameArr   = liveSet.get("name");
    var setName   = nameArr ? String(nameArr[0]) : "Song";
    var songTitle = setName
        .replace(/^Multitracks\.com[-_]/i, "")
        .replace(/[-_]\d+\.?\d*\s*bpm$/i, "")
        .replace(/[-_][A-Ga-g][b#]?\s*$/, "")
        .replace(/[-_]/g, " ")
        .trim() || setName.trim() || "Song";

    var sigNum      = liveSet.get("signature_numerator");
    var beatsPerBar = (sigNum && sigNum.length) ? parseInt(sigNum[0]) : 4;
    var stopBeat    = getActualSongEnd(liveSet, beatsPerBar);
    appendLog("Step 7: song end (STOP) = beat " + stopBeat);

    var savedTimeRaw = liveSet.get("current_song_time");
    var savedTime    = (savedTimeRaw && savedTimeRaw !== 0 && savedTimeRaw.length > 0)
                        ? parseFloat(savedTimeRaw[0]) : 0;

    var wasPlayingRaw = liveSet.get("is_playing");
    if (wasPlayingRaw && wasPlayingRaw[0] === 1) liveSet.call("stop_playing");

    // Build queue of beat times to delete
    var deleteQueue = [];
    for (var i = 0; i < cues.length; i++) deleteQueue.push(cues[i].time);
    appendLog("Step 7: " + deleteQueue.length + " locators to delete");

    var deleteIdx = 0;

    // After all deletes, create the two new locators
    function runCreate() {
        var remaining = liveSet.getcount("cue_points");
        appendLog("Step 7: " + remaining + " remain after delete pass");

        // Beat 0 — song title
        var pre0 = liveSet.getcount("cue_points");
        liveSet.set("current_song_time", 0.0);
        liveSet.call("set_or_delete_cue");
        var post0 = liveSet.getcount("cue_points");
        appendLog("Step 7: count " + pre0 + " -> " + post0 + " at beat 0");

        if (post0 > pre0) {
            for (var j = 0; j < post0; j++) {
                var cp0   = new LiveAPI("live_set cue_points " + j);
                var tArr0 = cp0.get("time");
                if (tArr0 && tArr0 !== 0 && tArr0.length > 0 && Math.abs(parseFloat(tArr0[0])) < 0.5) {
                    cp0.set("name", songTitle);
                    break;
                }
            }
        } else {
            appendLog("Step 7: WARNING — beat 0 toggle did not create (locator may already exist there)");
            reportFailure("Song title locator not created at beat 0");
        }

        // stopBeat — STOP
        var preS = liveSet.getcount("cue_points");
        liveSet.set("current_song_time", stopBeat);
        liveSet.call("set_or_delete_cue");
        var postS = liveSet.getcount("cue_points");
        appendLog("Step 7: count " + preS + " -> " + postS + " at beat " + stopBeat);

        if (postS > preS) {
            for (var k = 0; k < postS; k++) {
                var cpS   = new LiveAPI("live_set cue_points " + k);
                var tArrS = cpS.get("time");
                if (tArrS && tArrS !== 0 && tArrS.length > 0 && Math.abs(parseFloat(tArrS[0]) - stopBeat) < 0.5) {
                    cpS.set("name", "STOP");
                    break;
                }
            }
        } else {
            appendLog("Step 7: WARNING — stopBeat toggle did not create (existing locator there deleted instead)");
            reportFailure("STOP locator not created — existing locator was at beat " + stopBeat);
        }

        // Restore cursor
        liveSet.set("current_song_time", savedTime);

        log("  \"" + songTitle + "\" at beat 0 | STOP at beat " + stopBeat + " | final count: " + liveSet.getcount("cue_points"));
        if (onDone) onDone();
    }

    // Repeating Task: one deletion per tick (50ms) so Live processes each toggle
    var delTask = new Task(function() {
        if (deleteIdx < deleteQueue.length) {
            liveSet.set("current_song_time", deleteQueue[deleteIdx]);
            liveSet.call("set_or_delete_cue");
            appendLog("  del[" + deleteIdx + "] beat=" + deleteQueue[deleteIdx] + " remain=" + liveSet.getcount("cue_points"));
            deleteIdx++;
        } else {
            delTask.cancel();
            runCreate();
        }
    });
    delTask.interval = 50;
    delTask.repeat();
}

// ─── Main bang ────────────────────────────────────────────────────────────────

function bang() {
    var liveSet = ls();
    if (!liveSet || liveSet.id == 0) {
        log("ERROR: No Ableton session.");
        return;
    }

    _failures  = [];
    _logBuffer = [];
    outlet(1, "Running...");
    log("ABLEMATION v" + VERSION + " running...");

    var cues = readCuePoints();

    // Steps 0-6 run synchronously, then step7 runs async (Task-per-deletion).
    // Completion logging happens in the step7 callback so the log is complete.
    var t = new Task(function() {
        try {
            step0_cleanup();
            step1_createReturns();
            step2_colorTracks();
            step3_routeOutputs();
            step3b_routeCueOutput();
            step4_routeSends();
            step5_createSections();
            step6_buildArrangementClips(cues);
        } catch(e) {
            log("ERROR in setup: " + e.message);
            appendLog("Stack: " + (e.stack || "none"));
            reportFailure("Setup error: " + e.message);
        }

        step7_replaceLocators(cues, function() {
            log("DONE.");
            flushLog();
            if (_failures.length === 0) {
                outlet(1, "All steps completed successfully.");
            } else {
                outlet(1, "Issues (" + _failures.length + "): " + _failures.join(" | "));
            }
        });
    });
    t.interval = 0;
    t.execute();
}
