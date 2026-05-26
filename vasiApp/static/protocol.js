
// ── State ──────────────────────────────────────────────────────────
let sessionId   = null;
let trialNum    = 0;          // 1-based current trial
let totalTrials = 40;
let waiting     = false;
let answered    = true;

const UI = window.VASI_UI;
if (UI && UI.buildDirectionGrid) {
  UI.buildDirectionGrid({ gridId: "dir-grid", onSelect: submitGuess, centerLabel: "you" });
}

// ── Start / restart ────────────────────────────────────────────────
async function startTest() {
  document.getElementById("start-btn").disabled = true;
  const resp = await fetch("/api/protocol/start", { method:"POST" });
  const data = await resp.json();
  sessionId   = data.session_id;
  totalTrials = data.total_trials;
  trialNum    = 1;

  document.getElementById("start-screen").style.display = "none";
  document.getElementById("stats-area").style.display   = "none";
  document.getElementById("test-area").style.display    = "block";

  updateProgress(0);
  UI.setStatus("", "Press play to hear the stimulus");
}

function restartTest() {
  sessionId = null; trialNum = 0;
  document.getElementById("stats-area").style.display   = "none";
  document.getElementById("test-area").style.display    = "none";
  document.getElementById("start-screen").style.display = "block";
  document.getElementById("start-btn").disabled = false;
  updateProgress(0);
  UI.hideAnswerResult("result-flash");
}

// ── Play trial ─────────────────────────────────────────────────────
async function playTrial() {
  if (waiting) return;
  waiting = true;
  answered = false;

  UI.setPlayBtn(true);
  UI.disableButtons(true);
  UI.hideAnswerResult("result-flash");
  UI.setStatus("active", "Rendering HRTF… please wait");
  UI.setWave(true);

  try {
    const resp = await fetch(`/api/protocol/play?session=${sessionId}`, { method:"POST" });
    if (!resp.ok) throw new Error("Server error " + resp.status);

    const blob  = await resp.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);

    UI.setStatus("active", "Playing — listen carefully…");
    audio.onended = () => {
      URL.revokeObjectURL(url);
      waiting = false;
      UI.setWave(false);
      UI.setStatus("", "Which direction did you hear?");
      UI.disableButtons(false);
    };
    await audio.play();
  } catch(err) {
    waiting = false;
    UI.setWave(false);
    UI.setPlayBtn(false);
    UI.setStatus("error", "Error: " + err.message);
  }
}

// ── Submit guess ───────────────────────────────────────────────────
async function submitGuess(id) {
  if (waiting || answered) return;
  UI.disableButtons(true);
  answered = true;

  const resp = await fetch(`/api/protocol/answer?session=${sessionId}`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ id })
  });
  const data = await resp.json();

  UI.highlightDirectionButtons({ selectedId: id, correctId: data.correct_id });

  UI.showAnswerResult({ wrapperId: "result-flash", data, variant: "protocol" });
  updateProgress(data.trial_index);
  document.getElementById("trial-counter").innerHTML =
    `${Math.min(data.trial_index + 1, totalTrials)} <span>/ ${totalTrials}</span>`;

  if (data.finished) {
    setTimeout(() => showStats(data.stats), 1200);
    UI.setStatus("", "Test complete!");
    UI.setPlayBtn(true);
  } else {
    UI.setPlayBtn(false);
    UI.setStatus("", "Round done — press play for the next stimulus");
  }
}

// ── Stats display ──────────────────────────────────────────────────
function showStats(stats) {
  document.getElementById("test-area").style.display  = "none";
  document.getElementById("stats-area").style.display = "block";

  const accuracyBucket = (pct) => (pct >= 80 ? "hi" : pct >= 50 ? "mid" : "lo");
  const colorVarForBucket = (bucket) => (
    bucket === "hi" ? "var(--accent2)" : bucket === "lo" ? "var(--danger)" : "var(--warn)"
  );

  // Overall
  document.getElementById("overall-pct").textContent =
    Math.round(stats.overall * 100) + "%";

  // Per-azimuth table
  const tbody = document.getElementById("az-tbody");
  tbody.innerHTML = "";
  stats.per_direction.forEach(d => {
    const pct = Math.round(d.accuracy * 100);
    const cls = accuracyBucket(pct);
    tbody.innerHTML += `
      <tr>
        <td>${d.label}</td>
        <td class="bar-cell">
          <div class="mini-bar"><div class="mini-fill ${cls}" style="width:${pct}%"></div></div>
        </td>
        <td style="color:var(--muted)">${d.correct} / ${d.total}</td>
        <td><span class="pct-badge ${cls}">${pct}%</span></td>
      </tr>`;
  });

  // Hemisphere & front-back cards
  const hg = document.getElementById("hemi-grid");
  hg.innerHTML = "";
  const groups = [
    { label:"Right hemisphere",  sub:"45°, 90°, 135° right", val: stats.right_acc },
    { label:"Left hemisphere",   sub:"45°, 90°, 135° left",  val: stats.left_acc  },
    { label:"Front hemisphere",  sub:"0°, 45° L, 45° R",     val: stats.front_acc },
    { label:"Back hemisphere",   sub:"180°, 135° L, 135° R", val: stats.back_acc  },
  ];
  groups.forEach(g => {
    const pct = Math.round(g.val * 100);
    const cls = accuracyBucket(pct);
    const colorVar = colorVarForBucket(cls);
    hg.innerHTML += `
      <div class="conf-card">
        <div class="conf-label">${g.label}</div>
        <div class="conf-val"
             style="font-family:var(--display);font-size:1.5rem;font-weight:700;color:${colorVar}">${pct}%</div>
        <div class="conf-sub">${g.sub}</div>
      </div>`;
  });

  // Confusion matrix (direction × direction)
  const cmTableBody = document.getElementById("cm-tbody");
  const cmTableHead = document.getElementById("cm-thead");
  if (cmTableBody && cmTableHead && stats.confusion_matrix) {
    const dirOrder = stats.per_direction.map(d => d.id);
    const labelById = new Map(stats.per_direction.map(d => [d.id, d.label]));

    cmTableHead.innerHTML = `
      <tr>
        <th>Actual \\ Guessed</th>
        ${dirOrder.map(did => `<th>${labelById.get(did)}</th>`).join("")}
      </tr>`;

    cmTableBody.innerHTML = "";
    stats.confusion_matrix.forEach(row => {
      const actualId = row.actual_id;
      const cells = row.guesses.map(cell => {
        const pct = Math.round(cell.pct * 100);
        const cls = accuracyBucket(pct);
        const diag = cell.guessed_id === actualId ? " cm-diag" : "";
        return `<td class="cm-cell ${cls}${diag}" title="${cell.count} / ${row.total}">${pct}%</td>`;
      }).join("");
      cmTableBody.innerHTML += `
        <tr>
          <th class="cm-row-label">${row.label}</th>
          ${cells}
        </tr>`;
    });
  }

  // Scroll to stats
  document.getElementById("stats-area").scrollIntoView({ behavior:"smooth", block:"start" });
}

function updateProgress(done) {
  const pct = (done / totalTrials) * 100;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent = `${done} / ${totalTrials} trials`;
}
function scrollToDocs(e) {
  e.preventDefault();
  document.getElementById("docs").scrollIntoView({ behavior:"smooth" });
}