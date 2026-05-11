// ABLEMATION v5.0 - Automated Ableton Session Setup
// Max for Live JavaScript Device
autowatch = 1;
inlets  = 1;
outlets = 2; // 0: status text, 1: failure summary

var VERSION = "5.0";

// ─── Portable paths ───────────────────────────────────────────────────────────
// Derived from the .amxd file location — works on any machine, any username.
var DEVICE_FOLDER = "";
try {
    DEVICE_FOLDER = this.patcher.filepath.replace(/\/[^\/]+$/, "");
} catch(e) {
    post("[ABLEMATION] WARNING: could not determine device folder\n");
}
var CONFIG_PATH = DEVICE_FOLDER + "/config.json";
var LOG_PATH    = DEVICE_FOLDER + "/ablemation-log.txt";

// ─── Runtime state ────────────────────────────────────────────────────────────
var _failures  = [];
var _logBuffer = [];
var _delTask   = null;  // module-scope prevents GC during async locator cleanup

post("[ABLEMATION] ablemation.js v" + VERSION + " loaded\n");

// ─── Defaults (overridden by config.json on load) ─────────────────────────────
// These match the standard MultiTracks.com church production setup.
// To customize for your rig, edit config.json — do not edit these directly.

var RETURN_TRACKS = [
    { name: "BAND",  channel: "1"  },
    { name: "VOX",   channel: "3"  },
    { name: "CLICK", channel: "5"  },
    { name: "GUIDE", channel: "6"  },
    { name: "LTC",   channel: "7"  },
    { name: "BASS",  channel: "8"  },
    { name: "AG",    channel: "9"  },
    { name: "PERC",  channel: "11" },
    { name: "EGTR",  channel: "13" },
    { name: "HOOK",  channel: "15" }
];

// Ordered array — first match wins, so put more specific entries before general ones.
// Uses word-boundary matching, so short keywords like "ag" won't hit "Stage".
var KEYWORD_MAP = [
    { "return": "BAND",  keywords: ["band", "synth", "keys", "keyboard", "pad", "piano", "organ", "strings", "fx", "rhodes", "wurli", "clav"] },
    { "return": "VOX",   keywords: ["vox", "vocal", "lead", "bgv", "bgvs", "background", "choir", "bv"] },
    { "return": "CLICK", keywords: ["click", "metronome", "met"] },
    { "return": "GUIDE", keywords: ["guide", "ref", "reference", "scratch"] },
    { "return": "LTC",   keywords: ["ltc", "timecode", "smpte"] },
    { "return": "BASS",  keywords: ["bass", "sub"] },
    { "return": "AG",    keywords: ["ag", "acoustic"] },
    { "return": "PERC",  keywords: ["perc", "percussion", "drum", "loop", "conga", "shaker", "tamb", "bongo"] },
    { "return": "EGTR",  keywords: ["egtr", "electric", "elec"] },
    { "return": "HOOK",  keywords: ["hook", "feature", "solo", "vamp"] }
];

var COLOR_RETURN   = 16777215;  // 0xFFFFFF — return tracks
var COLOR_MASTER   = 11672627;  // 0xB21E33 — master track (dark red)
var COLOR_SECTIONS = 0;         // 0x000000 — SECTIONS track and clips

var SEND_UNITY = 1.0;
var SEND_OFF   = 0;

var FALLBACK_SECTIONS = ["Intro", "Verse 1", "Chorus 1", "Bridge", "Outro"];

// ─── Config loader ────────────────────────────────────────────────────────────
// Reads config.json from the device folder on every load.
// Only overrides values explicitly present in the file — missing keys keep defaults.

function loadConfig() {
    try {
        var f = new File(CONFIG_PATH, "read");
        if (!f.isopen) {
            post("[ABLEMATION] No config.json found — using built-in defaults\n");
            return;
        }
        var raw = f.readstring(65536);
        f.close();

        var cfg = JSON.parse(raw);

        if (Array.isArray(cfg.returnTracks)    && cfg.returnTracks.length > 0)    RETURN_TRACKS     = cfg.returnTracks;
        if (Array.isArray(cfg.keywordMap)       && cfg.keywordMap.length > 0)      KEYWORD_MAP       = cfg.keywordMap;
        if (Array.isArray(cfg.fallbackSections) && cfg.fallbackSections.length > 0) FALLBACK_SECTIONS = cfg.fallbackSections;
        if (cfg.colors) {
            if (cfg.colors.returnTracks  !== undefined) COLOR_RETURN   = cfg.colors.returnTracks;
            if (cfg.colors.masterTrack   !== undefined) COLOR_MASTER   = cfg.colors.masterTrack;
            if (cfg.colors.sectionsTrack !== undefined) COLOR_SECTIONS = cfg.colors.sectionsTrack;
        }

        post("[ABLEMATION] config.json loaded from " + CONFIG_PATH + "\n");
    } catch(e) {
        post("[ABLEMATION] config.json error: " + e.message + " — using defaults\n");
    }
}

function loadbang() {
    loadConfig();
    outlet(0, "v" + VERSION + " — click SETUP SESSION to begin");
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function appendLog(msg) {
    post("[ABLEMATION] " + msg + "\n");
    _logBuffer.push(msg);
}

function log(msg) {
    post("[ABLEMATION] " + msg + "\n");
    _logBuffer.push(msg);
    outlet(0, msg);
}

function reportFailure(msg) {
    _failures.push(msg);
    appendLog("FAIL: " + msg);
}

function flushLog() {
    var d  = new Date();
    var ts = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
             " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    var content = "=== ABLEMATION v" + VERSION + " — " + ts + " ===\n" + _logBuffer.join("\n") + "\n";
    try {
        var f = new File(LOG_PATH, "write");
        if (f.isopen) { f.writestring(content); f.close(); }
        else post("[ABLEMATION] WARNING: could not write log to " + LOG_PATH + "\n");
    } catch(e) {
        post("[ABLEMATION] Log error: " + e.message + "\n");
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ls() { return new LiveAPI("live_set"); }

// Match a channel display_name by leading digits — interface-agnostic.
// "7" matches "7", "7 LTC", "7/8", "Output 7", etc.
function channelMatchesTarget(displayName, targetLeadingNum) {
    var dn  = String(displayName).trim();
    var tgt = String(targetLeadingNum).trim();
    if (dn === tgt) return true;
    return new RegExp("^" + tgt + "([^0-9]|$)").test(dn);
}

// ─── Output Routing (Live 12 API) ────────────────────────────────────────────
//
// Live 12: routing properties live on Track, not mixer_device.
// GET returns a JSON string inside a 1-element array.
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
        appendLog("No Ext.Out type for " + trackPath + ". Available: " + JSON.stringify(types));
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
        appendLog("No channel '" + targetLeadingNum + "' for " + trackPath + ". Available: " + JSON.stringify(channels));
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
    var firstNonMaster = null;

    for (var i = 0; i < types.length; i++) {
        var dn = String(types[i].display_name || "").toLowerCase();
        for (var n = 0; n < sendsNames.length; n++) {
            if (dn === sendsNames[n] || dn.indexOf(sendsNames[n]) !== -1) {
                track.set("output_routing_type", JSON.stringify(types[i]));
                return true;
            }
        }
        if (!firstNonMaster && dn !== "") {
            var isMaster = false;
            for (var m = 0; m < masterNames.length; m++) {
                if (dn.indexOf(masterNames[m]) !== -1) { isMaster = true; break; }
            }
            if (!isMaster) firstNonMaster = types[i];
        }
    }

    if (firstNonMaster) {
        track.set("output_routing_type", JSON.stringify(firstNonMaster));
        return true;
    }
    return false;
}

// ─── Track matching ───────────────────────────────────────────────────────────

function escapeRe(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

// Match a track name to a return bus.
// KEYWORD_MAP is an ordered array — first match wins.
// Uses surroundings-based word boundary: keyword must be preceded and followed
// by a non-alphanumeric character (or string edge). Prevents "Stage" matching "ag",
// "Match" matching "tc", etc.
function matchTrackToReturn(trackName) {
    var lower = trackName.toLowerCase().trim();

    // Tracks starting with "EG" + space/digit always go to EGTR ("E GTR", "EG 1", etc.)
    if (/^eg[\s\d]/.test(lower)) return "EGTR";

    for (var i = 0; i < KEYWORD_MAP.length; i++) {
        var entry    = KEYWORD_MAP[i];
        var retName  = entry["return"] || "";
        var keywords = entry.keywords  || [];

        for (var k = 0; k < keywords.length; k++) {
            var escaped = escapeRe(keywords[k].toLowerCase());
            var re      = new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:[^a-z0-9]|$)");
            if (re.test(lower)) return retName;
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
        cues.push({
            name: (nameArr && nameArr.length) ? String(nameArr[0]).trim() : "",
            time: (timeArr && timeArr.length) ? parseFloat(timeArr[0])   : 0
        });
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
        if (nArr && String(nArr[0]).toUpperCase() === "SECTIONS") continue;

        var clipCount = tr.getcount("arrangement_clips");
        for (var c = 0; c < clipCount; c++) {
            var clip    = new LiveAPI("live_set tracks " + t + " arrangement_clips " + c);
            var endArr  = clip.get("end_time");
            var clipEnd = 0;
            if (endArr && endArr.length > 0 && parseFloat(endArr[0]) > 0) {
                clipEnd = parseFloat(endArr[0]);
            } else {
                var sArr = clip.get("start_time");
                var lArr = clip.get("length");
                if (sArr && sArr.length > 0 && lArr && lArr.length > 0) {
                    clipEnd = parseFloat(sArr[0]) + parseFloat(lArr[0]);
                }
            }
            if (clipEnd > actualEnd) actualEnd = clipEnd;
        }
    }
    if (actualEnd > 0) return (Math.ceil(actualEnd / beatsPerBar) + 1) * beatsPerBar;
    return 256;
}

// ─── Step 0: Delete existing return tracks ────────────────────────────────────

function step0_cleanup() {
    var liveSet = ls();
    var count   = liveSet.getcount("return_tracks");
    log("Step 0: Removing " + count + " existing return track(s)...");
    for (var i = count - 1; i >= 0; i--) liveSet.call("delete_return_track", i);
}

// ─── Step 1: Create return tracks ────────────────────────────────────────────

function step1_createReturns() {
    log("Step 1: Creating " + RETURN_TRACKS.length + " return tracks...");
    var liveSet = ls();
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        liveSet.call("create_return_track");
        new LiveAPI("live_set return_tracks " + i).set("name", RETURN_TRACKS[i].name);
    }
}

// ─── Step 2: Colors ───────────────────────────────────────────────────────────

function step2_colorTracks() {
    log("Step 2: Applying colors...");
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        new LiveAPI("live_set return_tracks " + i).set("color", COLOR_RETURN);
    }
    new LiveAPI("live_set master_track").set("color", COLOR_MASTER);
}

// ─── Step 3: Route return tracks to hardware outputs ──────────────────────────

function step3_routeOutputs() {
    log("Step 3: Routing return tracks to hardware outputs...");
    for (var i = 0; i < RETURN_TRACKS.length; i++) {
        var ok = setExtOutput("live_set return_tracks " + i, RETURN_TRACKS[i].channel);
        if (!ok) {
            log("  WARNING: " + RETURN_TRACKS[i].name + " routing failed");
            reportFailure(RETURN_TRACKS[i].name + " output routing failed");
        }
    }
    log("  Step 3 done.");
}

// ─── Step 3b: Cue Out notice ──────────────────────────────────────────────────
// Cue Out hardware routing is NOT exposed in the Live 12 LOM.
// Confirmed: Cycling '74 docs + AbletonOSC source. Cannot be automated.

function step3b_warnCueOut() {
    log("Step 3b: Set CUE OUT manually in master track mixer.");
    appendLog("Cue Out: not accessible in Live 12 LOM — user must set manually.");
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
            send.set("value", s === returnIdx ? SEND_UNITY : SEND_OFF);
        }

        if (returnIdx === -1) {
            unmatched.push(trackName);
            reportFailure("\"" + trackName + "\" unmatched — add keyword to config.json");
        } else {
            matched++;
        }
    }

    appendLog("Step 4: matched=" + matched + " unmatched=" + unmatched.length);
    if (unmatched.length > 0) appendLog("  Unmatched: " + unmatched.join(", "));
    log("  Matched: " + matched + " | Unmatched: " + unmatched.length);
}

// ─── Step 5: Create SECTIONS MIDI track at position 0 ─────────────────────────

function step5_createSections() {
    log("Step 5: Creating SECTIONS track...");
    var liveSet    = ls();
    var trackCount = liveSet.getcount("tracks");

    for (var i = 0; i < trackCount; i++) {
        var tr = new LiveAPI("live_set tracks " + i);
        var n  = tr.get("name");
        if (n && String(n[0]).toUpperCase() === "SECTIONS") {
            liveSet.call("delete_track", i);
            break;
        }
    }

    liveSet.call("create_midi_track", 0);
    var sections = new LiveAPI("live_set tracks 0");
    sections.set("name", "SECTIONS");
    sections.set("color", COLOR_SECTIONS);
    log("  Step 5 done.");
}

// ─── Step 6: Build arrangement clips from cue points ──────────────────────────

function step6_buildArrangementClips(cues) {
    log("Step 6: Building arrangement clips...");
    var liveSet     = ls();
    var sigNum      = liveSet.get("signature_numerator");
    var beatsPerBar = (sigNum && sigNum.length) ? parseInt(sigNum[0]) : 4;
    var fallbackLen = 8 * beatsPerBar;

    var sectionsIdx = -1;
    var trackCount  = liveSet.getcount("tracks");
    for (var t = 0; t < trackCount; t++) {
        var tr = new LiveAPI("live_set tracks " + t);
        var n  = tr.get("name");
        if (n && String(n[0]).toUpperCase() === "SECTIONS") { sectionsIdx = t; break; }
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
        for (var fs = 0; fs < FALLBACK_SECTIONS.length; fs++) {
            clips.push({ name: FALLBACK_SECTIONS[fs], time: fallbackLen * fs });
        }
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
                c.set("color", COLOR_SECTIONS);
                break;
            }
        }
    }

    log("  Created " + clips.length + " arrangement clip(s).");
}

// ─── Step 7: Replace locators with song title + STOP ──────────────────────────
//
// Live 12 locator API: set_or_delete_cue() toggles a locator at current_song_time.
// CRITICAL: rapid-fire calls in a loop silently fail — Live 12 only processes one
// per event-loop tick. _delTask is module-scope to prevent garbage collection
// from killing the loop mid-run.

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
    appendLog("Step 7: title=\"" + songTitle + "\" STOP=beat " + stopBeat);

    var savedTimeRaw = liveSet.get("current_song_time");
    var savedTime    = (savedTimeRaw && savedTimeRaw !== 0 && savedTimeRaw.length > 0)
                        ? parseFloat(savedTimeRaw[0]) : 0;

    var wasPlayingRaw = liveSet.get("is_playing");
    if (wasPlayingRaw && wasPlayingRaw[0] === 1) liveSet.call("stop_playing");

    var deleteQueue = [];
    for (var i = 0; i < cues.length; i++) deleteQueue.push(cues[i].time);
    appendLog("Step 7: " + deleteQueue.length + " locators queued for deletion");

    var deleteIdx = 0;

    function runCreate() {
        appendLog("Step 7: " + liveSet.getcount("cue_points") + " remain after delete pass");

        // Create song title locator at beat 0
        var pre0 = liveSet.getcount("cue_points");
        liveSet.set("current_song_time", 0.0);
        liveSet.call("set_or_delete_cue");
        var post0 = liveSet.getcount("cue_points");
        appendLog("Step 7: beat-0 count " + pre0 + " -> " + post0);

        if (post0 > pre0) {
            for (var j = 0; j < post0; j++) {
                var cp0 = new LiveAPI("live_set cue_points " + j);
                var t0  = cp0.get("time");
                if (t0 && t0 !== 0 && t0.length > 0 && Math.abs(parseFloat(t0[0])) < 0.5) {
                    cp0.set("name", songTitle);
                    break;
                }
            }
        } else {
            reportFailure("Song title locator not created at beat 0");
        }

        // Create STOP locator at actual song end
        var preS = liveSet.getcount("cue_points");
        liveSet.set("current_song_time", stopBeat);
        liveSet.call("set_or_delete_cue");
        var postS = liveSet.getcount("cue_points");
        appendLog("Step 7: stop-beat count " + preS + " -> " + postS);

        if (postS > preS) {
            for (var k = 0; k < postS; k++) {
                var cpS = new LiveAPI("live_set cue_points " + k);
                var tS  = cpS.get("time");
                if (tS && tS !== 0 && tS.length > 0 && Math.abs(parseFloat(tS[0]) - stopBeat) < 0.5) {
                    cpS.set("name", "STOP");
                    break;
                }
            }
        } else {
            reportFailure("STOP locator not created at beat " + stopBeat);
        }

        liveSet.set("current_song_time", savedTime);
        log("  \"" + songTitle + "\" + STOP | final count: " + liveSet.getcount("cue_points"));
        if (onDone) onDone();
    }

    _delTask = new Task(function() {
        if (deleteIdx < deleteQueue.length) {
            liveSet.set("current_song_time", deleteQueue[deleteIdx]);
            liveSet.call("set_or_delete_cue");
            appendLog("  del[" + deleteIdx + "] beat=" + deleteQueue[deleteIdx] + " remain=" + liveSet.getcount("cue_points"));
            deleteIdx++;
        } else {
            _delTask.cancel();
            _delTask = null;
            runCreate();
        }
    });
    _delTask.interval = 50;
    _delTask.repeat();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function bang() {
    // Cancel any in-flight locator task from a previous run
    if (_delTask) { _delTask.cancel(); _delTask = null; }

    var liveSet = ls();
    if (!liveSet || liveSet.id == 0) { log("ERROR: No Ableton session."); return; }

    _failures  = [];
    _logBuffer = [];
    outlet(1, "Running...");
    log("ABLEMATION v" + VERSION + " running...");

    var cues = readCuePoints();

    // Steps 0-6 run synchronously. Step 7 is async (50ms/locator Task).
    // Completion callback handles log flush and failure summary.
    var t = new Task(function() {
        try {
            step0_cleanup();
            step1_createReturns();
            step2_colorTracks();
            step3_routeOutputs();
            step3b_warnCueOut();
            step4_routeSends();
            step5_createSections();
            step6_buildArrangementClips(cues);
        } catch(e) {
            log("ERROR: " + e.message);
            appendLog("Stack: " + (e.stack || "none"));
            reportFailure("Unexpected error: " + e.message);
        }

        step7_replaceLocators(cues, function() {
            log("DONE.");
            flushLog();
            outlet(1, _failures.length === 0
                ? "All steps completed successfully."
                : "Issues (" + _failures.length + "): " + _failures.join(" | "));
        });
    });
    t.interval = 0;
    t.execute();
}
