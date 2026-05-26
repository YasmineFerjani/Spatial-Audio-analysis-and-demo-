(function () {
  "use strict";

  // Shared direction layout (id/label/deg + 3x3 grid positions)
  const DIR_LAYOUT = [
    { id: 5, label: "135° left", deg: "135°", row: 0, col: 0 },
    { id: 0, label: "Front", deg: "0°", row: 0, col: 1 },
    { id: 1, label: "45° right", deg: "45°", row: 0, col: 2 },
    { id: 6, label: "90° left", deg: "90°", row: 1, col: 0 },
    // center (1,1) is the listener dot
    { id: 2, label: "90° right", deg: "90°", row: 1, col: 2 },
    { id: 3, label: "135° right", deg: "135°", row: 2, col: 2 },
    { id: 4, label: "Back", deg: "180°", row: 2, col: 1 },
    { id: 7, label: "45° left", deg: "45°", row: 2, col: 0 },
  ];

  function buildDirectionGrid(opts) {
    const gridId = opts && opts.gridId;
    const onSelect = opts && opts.onSelect;
    const dirLayout = (opts && opts.dirLayout) || DIR_LAYOUT;
    const centerLabel = (opts && opts.centerLabel) || "you";

    const grid = document.getElementById(gridId);
    if (!grid) return;
    if (typeof onSelect !== "function") return;

    // Clear existing content so both pages can safely call this once.
    grid.innerHTML = "";

    dirLayout.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "dir-btn";
      btn.dataset.id = d.id;
      btn.disabled = true;
      btn.style.gridRow = String(d.row + 1);
      btn.style.gridColumn = String(d.col + 1);
      btn.innerHTML = `<span class="dir-deg">${d.deg}</span><span class="dir-name">${d.label}</span>`;
      btn.addEventListener("click", () => onSelect(d.id));
      grid.appendChild(btn);
    });

    const centre = document.createElement("div");
    centre.className = "center-cell";
    centre.style.gridRow = "2";
    centre.style.gridColumn = "2";
    centre.innerHTML = `
      <div class="listener-dot"></div>
      <div class="listener-label">${centerLabel}</div>`;
    grid.appendChild(centre);
  }

  function highlightDirectionButtons(opts) {
    const selectedId = opts && opts.selectedId;
    const correctId = opts && opts.correctId;

    document.querySelectorAll(".dir-btn").forEach((btn) => {
      const bId = parseInt(btn.dataset.id, 10);

      // Remove only "state" classes; keep base class + listeners.
      btn.classList.remove("correct", "wrong", "reveal");

      if (bId === correctId && bId === selectedId) btn.classList.add("correct");
      else if (bId === correctId) btn.classList.add("reveal");
      else if (bId === selectedId) btn.classList.add("wrong");
    });
  }

  // ---- Status / decoration helpers (shared ids) ----
  function setStatus(type, msg) {
    const dot = document.getElementById("status-dot");
    if (dot) dot.className = "status-dot" + (type ? " " + type : "");
    const text = document.getElementById("status-text");
    if (text) text.textContent = msg;
  }

  function setWave(on) {
    const el = document.getElementById("wave");
    if (!el) return;
    el.classList.toggle("active", on);
  }

  function setPlayBtn(disabled) {
    const btn = document.getElementById("play-btn");
    if (!btn) return;
    btn.disabled = disabled;
    btn.classList.toggle("playing", disabled);
  }

  function disableButtons(off) {
    document.querySelectorAll(".dir-btn").forEach((b) => {
      b.disabled = off;
      // When re-enabling, reset any correctness colours.
      if (!off) b.className = "dir-btn";
    });
  }

  // ---- Result flash ----
  function hideAnswerResult(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.classList.remove("show");
    wrapper.style.display = "none";
  }

  function showAnswerResult(opts) {
    const wrapperId = opts && opts.wrapperId;
    const data = opts && opts.data;
    const variant = (opts && opts.variant) || "protocol";
    const verdictId = (opts && opts.verdictId) || "result-verdict";
    const detailId = (opts && opts.detailId) || "result-detail";

    const wrapper = document.getElementById(wrapperId);
    const verdict = document.getElementById(verdictId);
    const detail = document.getElementById(detailId);
    if (!wrapper || !verdict || !detail || !data) return;

    wrapper.style.display = "block";
    requestAnimationFrame(() => wrapper.classList.add("show"));

    if (data.correct) {
      verdict.textContent = "Correct!";
      verdict.className = "result-verdict ok";

      const correctLabel = data.correct_label;
      if (variant === "free") {
        detail.innerHTML = `Sound came from <strong>${correctLabel}</strong>. Well done.`;
      } else {
        detail.innerHTML = `Sound came from <strong>${correctLabel}</strong>.`;
      }
    } else {
      verdict.textContent = "Not quite.";
      verdict.className = "result-verdict err";

      const guessedLabel = data.guessed_label;
      const correctLabel = data.correct_label;
      if (variant === "free") {
        detail.innerHTML = `You guessed <strong>${guessedLabel}</strong> — it was actually <strong>${correctLabel}</strong>.`;
      } else {
        detail.innerHTML = `You guessed <strong>${guessedLabel}</strong> — it was <strong>${correctLabel}</strong>.`;
      }
    }
  }

  window.VASI_UI = Object.assign(window.VASI_UI || {}, {
    DIR_LAYOUT,
    buildDirectionGrid,
    highlightDirectionButtons,
    setStatus,
    setWave,
    setPlayBtn,
    disableButtons,
    hideAnswerResult,
    showAnswerResult,
  });
})();

