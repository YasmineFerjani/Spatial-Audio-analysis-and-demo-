
// State
let scores    = { correct: 0, wrong: 0 };
let round     = 0;
let waiting   = false;       // true while audio is playing
let answered  = true;        // true = ready for next round
const UI = window.VASI_UI;
if (UI && UI.buildDirectionGrid) {
  UI.buildDirectionGrid({ gridId: "dir-grid", onSelect: submitGuess, centerLabel: "you" });
}

// ── API helpers ───────────────────────────────────────────────────────
async function playRound() {
  if (waiting) return;

  UI.setStatus("active", "Rendering HRTF… please wait");
  UI.setWave(true);
  UI.setPlayBtn(true);
  UI.hideAnswerResult("result-panel");
  UI.disableButtons(true);
  answered = false;
  waiting  = true;

  try {
    const resp = await fetch("/api/play", { method: "POST" });
    if (!resp.ok) throw new Error("Server error: " + resp.status);

    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
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
  } catch (err) {
    waiting = false;
    UI.setWave(false);
    UI.setPlayBtn(false);
    UI.setStatus("error", "Error: " + err.message);
  }
}

async function submitGuess(id) {
  if (waiting || answered) return;
  UI.disableButtons(true);
  answered = true;
  round++;

  const resp = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await resp.json();

  UI.highlightDirectionButtons({ selectedId: id, correctId: data.correct_id });

  // Update scores
  if (data.correct) scores.correct++; else scores.wrong++;
  updateScores();

  // Show result
  UI.showAnswerResult({ wrapperId: "result-panel", data, variant: "free" });
  UI.setPlayBtn(false);
  UI.setStatus("", "Round done — press play for the next");
  document.getElementById("round-count").textContent = `round ${round}`;
}


function updateScores() {
  const total = scores.correct + scores.wrong;
  document.getElementById("sc-correct").textContent = scores.correct;
  document.getElementById("sc-wrong").textContent   = scores.wrong;
  document.getElementById("sc-acc").textContent     = total
    ? Math.round(scores.correct / total * 100) + "%"
    : "—";
}