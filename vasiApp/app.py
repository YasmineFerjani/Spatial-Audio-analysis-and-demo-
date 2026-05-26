"""
VASI Spatial Audio Test — Flask Backend
Serves spatialised audio rendered with real HRTF convolution via pyfar.
"""
import io
import random
import uuid
import numpy as np
import scipy.io.wavfile
import scipy.signal
from slab import HRTF, Sound
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# ── Configuration ──────────────────────────────────────────────────────────────
AUDIO_PATH = "dataset/dataset/audio/500ms.wav"

# VASI test directions  (label, azimuth_deg, elevation_deg)
# pyfar convention: 0=front, +90=left, -90=right (counter-clockwise from above)
DIRECTIONS = [
    {"id": 0,   "label": "Front",      "az_deg":    0, "el_deg": 0},
    {"id": 1,   "label": "45° right",  "az_deg":  -45, "el_deg": 0},
    {"id": 2,   "label": "90° right",  "az_deg":  -90, "el_deg": 0},
    {"id": 3,   "label": "135° right", "az_deg": -135, "el_deg": 0},
    {"id": 4,   "label": "Back",       "az_deg":  180, "el_deg": 0},
    {"id": 5,   "label": "135° left",  "az_deg":  135, "el_deg": 0},
    {"id": 6,   "label": "90° left",   "az_deg":   90, "el_deg": 0},
    {"id": 7,   "label": "45° left",   "az_deg":   45, "el_deg": 0},
]

# ── Load resources once at startup ────────────────────────────────────────────
print("Loading HRTF database…")
hrtf = HRTF.kemar()
print(hrtf)
FS=int(hrtf.samplerate)
all_positions = np.vstack(hrtf.sources)   # shape (N, 3) — Cartesian x, y, z
print("positions shape:", all_positions.shape)

def cartesian_to_angles(x, y, z):
    """Exact copy of your working snippet."""
    az = np.degrees(np.arctan2(y, x))
    el = np.degrees(np.arctan2(z, np.hypot(x, y)))
    return az, el
_source_angles = np.array(
    [cartesian_to_angles(x, y, z) for x, y, z in all_positions]
)  # shape (N, 2): columns = [azimuth, elevation]
 
print(f"KEMAR loaded: {len(_source_angles)} sources @ {FS} Hz")


 
def _find_nearest_source(az_deg: float, el_deg: float) -> int:
    """Return the KEMAR source index closest to (az_deg, el_deg).
    Uses the same distance metric as your snippet: np.linalg.norm on [az, el].
    """
    target    = np.array([az_deg, el_deg])
    distances = np.linalg.norm(_source_angles - target, axis=1)
    idx       = int(np.argmin(distances))
    actual_az, actual_el = _source_angles[idx]
    print(f"  → target ({az_deg:+.0f}°, {el_deg:+.0f}°) "
          f"→ source {idx} ({actual_az:+.1f}°, {actual_el:+.1f}°)")
    return idx



print("Loading audio stimulus…")
stimulus = Sound.read(AUDIO_PATH)   # slab Sound, preserves original samplerate
print(stimulus)
if stimulus.n_channels > 1:
    mono_array = stimulus.data.mean(axis=1)          # shape (N,)
    stimulus   = Sound(mono_array, stimulus.samplerate)
# Resample to KEMAR's samplerate if needed
if int(stimulus.samplerate) != FS:
    print(f"  Resampling {int(stimulus.samplerate)} Hz → {FS} Hz")
    n_out      = int(stimulus.data.shape[0] * FS / int(stimulus.samplerate))
    resampled  = scipy.signal.resample(stimulus.data.squeeze(), n_out)
    stimulus   = Sound(resampled, FS)
 
print(f"Stimulus ready: {stimulus.data.shape[0] / FS:.2f}s mono @ {FS} Hz")
print("Server ready.\n")


def spatialise(az_deg: float, el_deg: float = 0.0) -> io.BytesIO:
    """Apply the nearest KEMAR HRIR and return stereo 16-bit WAV bytes.
 
        sourceidx = _find_nearest_source(az_deg, el_deg)
        spatial_sound = hrtf.apply(sourceidx, sound)
    Then encodes the result to WAV for the browser.
    """
    src_idx      = _find_nearest_source(az_deg, el_deg)
    binaural     = hrtf.apply(src_idx, stimulus)   # returns a 2-channel slab Sound
 
    # binaural.data shape: (samples, 2)  — left channel col 0, right col 1
    data = np.array(binaural.data, dtype=np.float32)
    if data.ndim == 1:
        # Safety fallback: shouldn't happen for a 2-ch HRTF apply
        data = np.column_stack((data, data))
 
    # Normalise to 88 % FS to avoid clipping
    peak = np.abs(data).max()
    if peak > 0:
        data = data / peak * 0.88
 
    # Encode to 16-bit PCM WAV in memory
    pcm = (data * 32767).astype(np.int16)
    buf = io.BytesIO()
    scipy.io.wavfile.write(buf, FS, pcm)
    buf.seek(0)
    return buf



current_direction_id = None

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/protocol")
def protocol():
    return app.send_static_file("protocol.html")


@app.route("/api/directions")
def get_directions():
    """Return the full list of directions for rendering the UI."""
    return jsonify(DIRECTIONS)


@app.route("/api/play", methods=["POST"])
def play_random():
    """Free-mode: pick a random direction, render and return WAV."""
    global current_direction_id
    direction = random.choice(DIRECTIONS)
    current_direction_id = direction["id"]
    wav_buf = spatialise(direction["az_deg"], direction["el_deg"])
    return send_file(wav_buf, mimetype="audio/wav", as_attachment=False, download_name="stimulus.wav")


@app.route("/api/answer", methods=["POST"])
def check_answer():
    """Free-mode: check answer against stored direction."""
    if current_direction_id is None:
        return jsonify({"error": "No active round. Play a sound first."}), 400
    data    = request.get_json(force=True)
    guessed = int(data.get("id", -1))
    correct = guessed == current_direction_id
    correct_dir = next(d for d in DIRECTIONS if d["id"] == current_direction_id)
    guessed_dir = next((d for d in DIRECTIONS if d["id"] == guessed), None)
    return jsonify({
        "correct":       correct,
        "correct_id":    current_direction_id,
        "correct_label": correct_dir["label"],
        "guessed_label": guessed_dir["label"] if guessed_dir else "unknown",
    })


# ── Protocol session state ────────────────────────────────────────────────────
TRIALS_PER_AZ = 5
TOTAL_TRIALS  = len(DIRECTIONS) * TRIALS_PER_AZ   # 40

# direction id → group membership
RIGHT_IDS = {1, 2, 3}   # 45°, 90°, 135° right
LEFT_IDS  = {5, 6, 7}   # 45°, 90°, 135° left
FRONT_IDS = {0, 1, 7}   # 0°, 45° right, 45° left
BACK_IDS  = {4, 3, 5}   # 180°, 135° right, 135° left

# active sessions: { session_id: { trial_queue, trial_index, current_dir_id, results } }
sessions: dict = {}


def build_trial_queue() -> list:
    """5 copies of each direction, shuffled."""
    q = [d["id"] for d in DIRECTIONS] * TRIALS_PER_AZ
    random.shuffle(q)
    return q


def compute_stats(results: list) -> dict:
    """
    results: list of { correct_id, guessed_id }
    Returns overall, per_direction, hemisphere, front/back accuracies.
    """
    per_dir = {d["id"]: {"correct": 0, "total": 0, "label": d["label"]} for d in DIRECTIONS}
    dir_ids = [d["id"] for d in DIRECTIONS]
    # confusion_counts[actual_dir_id][guessed_dir_id] = #trials
    confusion_counts = {aid: {gid: 0 for gid in dir_ids} for aid in dir_ids}
    for r in results:
        cid = r["correct_id"]
        per_dir[cid]["total"]  += 1
        confusion_counts[cid][r["guessed_id"]] += 1
        if r["correct_id"] == r["guessed_id"]:
            per_dir[cid]["correct"] += 1

    overall_correct = sum(v["correct"] for v in per_dir.values())
    overall_total   = len(results)

    def group_acc(ids):
        """Fraction of trials where stimulus was in `ids` AND guess was also in `ids`."""
        in_group = [r for r in results if r["correct_id"] in ids]
        stayed   = [r for r in in_group  if r["guessed_id"] in ids]
        return round(len(stayed) / len(in_group), 4) if in_group else 0.0

    return {
        "overall":        round(overall_correct / overall_total, 4) if overall_total else 0.0,
        "per_direction":  [
            {
                "id":       did,
                "label":    per_dir[did]["label"],
                "correct":  per_dir[did]["correct"],
                "total":    per_dir[did]["total"],
                "accuracy": round(per_dir[did]["correct"] / per_dir[did]["total"], 4)
                            if per_dir[did]["total"] else 0.0,
            }
            for did in [d["id"] for d in DIRECTIONS]
        ],
        # Direction confusion: rows = actual stimulus direction,
        # columns = participant guess direction.
        # Each cell pct = count / total_trials_for_that_actual_direction.
        "confusion_matrix": [
            {
                "actual_id": did,
                "label": per_dir[did]["label"],
                "total": per_dir[did]["total"],
                "guesses": [
                    {
                        "guessed_id": gid,
                        "count": confusion_counts[did][gid],
                        "pct": round(confusion_counts[did][gid] / per_dir[did]["total"], 4)
                                if per_dir[did]["total"] else 0.0,
                    }
                    for gid in dir_ids
                ],
            }
            for did in dir_ids
        ],
        "right_acc":  group_acc(RIGHT_IDS),
        "left_acc":   group_acc(LEFT_IDS),
        "front_acc":  group_acc(FRONT_IDS),
        "back_acc":   group_acc(BACK_IDS),
    }


@app.route("/api/protocol/start", methods=["POST"])
def protocol_start():
    """Create a new 40-trial session and return its id."""
    sid = str(uuid.uuid4())
    sessions[sid] = {
        "trial_queue":   build_trial_queue(),
        "trial_index":   0,
        "current_dir_id": None,
        "results":       [],
    }
    return jsonify({"session_id": sid, "total_trials": TOTAL_TRIALS})


@app.route("/api/protocol/play", methods=["POST"])
def protocol_play():
    """Render and return the WAV for the current trial in a session."""
    sid = request.args.get("session")
    if sid not in sessions:
        return jsonify({"error": "Unknown session"}), 400

    sess = sessions[sid]
    idx  = sess["trial_index"]
    if idx >= TOTAL_TRIALS:
        return jsonify({"error": "Session already complete"}), 400

    dir_id = sess["trial_queue"][idx]
    sess["current_dir_id"] = dir_id

    direction = next(d for d in DIRECTIONS if d["id"] == dir_id)
    wav_buf   = spatialise(direction["az_deg"], direction["el_deg"])
    return send_file(wav_buf, mimetype="audio/wav", as_attachment=False, download_name="stimulus.wav")


@app.route("/api/protocol/answer", methods=["POST"])
def protocol_answer():
    """Record the user's guess for the current trial; advance; return feedback + stats if done."""
    sid = request.args.get("session")
    if sid not in sessions:
        return jsonify({"error": "Unknown session"}), 400

    sess = sessions[sid]
    if sess["current_dir_id"] is None:
        return jsonify({"error": "No stimulus played yet"}), 400

    data     = request.get_json(force=True)
    guessed  = int(data.get("id", -1))
    correct_id = sess["current_dir_id"]
    correct    = guessed == correct_id

    sess["results"].append({"correct_id": correct_id, "guessed_id": guessed})
    sess["trial_index"] += 1
    sess["current_dir_id"] = None

    correct_dir = next(d for d in DIRECTIONS if d["id"] == correct_id)
    guessed_dir = next((d for d in DIRECTIONS if d["id"] == guessed), None)

    finished = sess["trial_index"] >= TOTAL_TRIALS
    resp = {
        "correct":       correct,
        "correct_id":    correct_id,
        "correct_label": correct_dir["label"],
        "guessed_label": guessed_dir["label"] if guessed_dir else "unknown",
        "trial_index":   sess["trial_index"],
        "finished":      finished,
    }
    if finished:
        resp["stats"] = compute_stats(sess["results"])

    return jsonify(resp)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
