(function () {
  if (window.__ffBatchRunning) return;
  window.__ffBatchRunning = true;

  let htmxTriggered = false;
  document.body.addEventListener("htmx:beforeRequest", () => {
    htmxTriggered = true;
  });

  function closeTabAfterDelay(ms = 2500) {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "CLOSE_ME" });
    }, ms);
  }

  chrome.runtime.sendMessage({ type: "IS_MANAGED_TAB" }, (res) => {
    const isManaged = Boolean(res && res.managed);

    const waitForButton = setInterval(() => {
      const dlBtn = document.querySelector('a.link-button[hx-post]');
      if (!dlBtn) return;

      clearInterval(waitForButton);

      if (isManaged) {
        // Click once
        dlBtn.click();

        // Only click a second time if the first click didn't trigger HTMX
        setTimeout(() => {
          if (!htmxTriggered) {
            dlBtn.click();
          }
          closeTabAfterDelay(2500);
        }, 1500);
      } else {
        // Manual browsing: close once HTMX actually triggers the download
        dlBtn.addEventListener("click", () => {
          setTimeout(() => {
            if (htmxTriggered) {
              closeTabAfterDelay(2500);
            }
          }, 300);
        });
      }
    }, 500);
  });
})();