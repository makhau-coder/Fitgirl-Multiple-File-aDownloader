(function () {
  const CHECKBOX_CLASS = "ff-batch-checkbox";

  function injectCheckboxes() {
    const anchors = document.querySelectorAll('#plaintext a[href^="https://fuckingfast.co/"]');
    if (anchors.length === 0) return 0;

    anchors.forEach((a) => {
      if (a.dataset.ffCheckboxAdded) return;
      a.dataset.ffCheckboxAdded = "true";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.className = CHECKBOX_CLASS;
      cb.dataset.url = a.href;
      Object.assign(cb.style, {
        marginRight: "8px",
        transform: "scale(1.2)",
        cursor: "pointer",
        verticalAlign: "middle"
      });

      cb.addEventListener("change", updateSelectedCount);
      a.parentNode.insertBefore(cb, a);
    });

    return anchors.length;
  }

  function getSelectedLinks() {
    const checked = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`);
    return Array.from(checked).map((cb) => cb.dataset.url);
  }

  function updateSelectedCount() {
    const statusText = document.getElementById("ff-batch-status");
    if (!statusText) return;
    const total = document.querySelectorAll(`.${CHECKBOX_CLASS}`).length;
    const selected = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`).length;
    statusText.textContent = `Selected: ${selected} / ${total} files`;
  }

  function setSelection(mode) {
    const boxes = document.querySelectorAll(`.${CHECKBOX_CLASS}`);
    boxes.forEach((cb) => {
      if (mode === "all") cb.checked = true;
      else if (mode === "none") cb.checked = false;
      else if (mode === "parts") {
        const url = cb.dataset.url.toLowerCase();
        cb.checked = !url.includes("selective") && !url.includes("optional");
      }
    });
    updateSelectedCount();
  }

  function makeSmallBtn(text, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    Object.assign(btn.style, {
      flex: "1",
      padding: "4px 6px",
      background: "#27272a",
      color: "#e4e4e7",
      fontSize: "12px",
      border: "1px solid #3f3f46",
      borderRadius: "5px",
      cursor: "pointer"
    });
    btn.addEventListener("click", onClick);
    return btn;
  }

  function injectUI() {
    if (document.getElementById("ff-batch-panel")) return;

    const panel = document.createElement("div");
    panel.id = "ff-batch-panel";
    Object.assign(panel.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "99999",
      background: "#18181b",
      color: "#fff",
      padding: "14px 18px",
      borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      minWidth: "260px"
    });

    const statusText = document.createElement("div");
    statusText.id = "ff-batch-status";
    statusText.textContent = "Scanning links...";

    const filterRow = document.createElement("div");
    filterRow.style.display = "flex";
    filterRow.style.gap = "6px";
    filterRow.append(
      makeSmallBtn("All", () => setSelection("all")),
      makeSmallBtn("None", () => setSelection("none")),
      makeSmallBtn("Parts Only", () => setSelection("parts"))
    );

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";

    const startBtn = document.createElement("button");
    startBtn.textContent = "Download Selected";
    Object.assign(startBtn.style, {
      flex: "1",
      padding: "8px 12px",
      background: "#22c55e",
      color: "#000",
      fontWeight: "600",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer"
    });

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "Stop";
    Object.assign(stopBtn.style, {
      padding: "8px 12px",
      background: "#ef4444",
      color: "#fff",
      fontWeight: "600",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer"
    });

    startBtn.addEventListener("click", () => {
      const urls = getSelectedLinks();
      if (urls.length === 0) {
        statusText.textContent = "No files selected.";
        return;
      }
      chrome.runtime.sendMessage({ type: "START_QUEUE", urls }, () => {
        statusText.textContent = `Queued ${urls.length} files (10 at a time)...`;
      });
    });

    stopBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_QUEUE" }, () => {
        statusText.textContent = "Queue stopped.";
      });
    });

    btnRow.append(startBtn, stopBtn);
    panel.append(statusText, filterRow, btnRow);
    document.body.appendChild(panel);

    const checkInterval = setInterval(() => {
      const count = injectCheckboxes();
      if (count > 0) {
        updateSelectedCount();
        clearInterval(checkInterval);
      }
    }, 500);

    setInterval(() => {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
        if (res && res.isRunning) {
          statusText.textContent = `Active: ${res.inProgress} | Remaining: ${res.remaining}`;
        }
      });
    }, 2000);
  }

  injectUI();
})();