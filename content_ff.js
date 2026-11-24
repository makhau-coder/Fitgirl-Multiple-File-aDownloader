(function () {
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
        // First click (triggers ad / primes button)
        dlBtn.click();

        // Second click (triggers actual HTMX download), then close tab
        setTimeout(() => {
          dlBtn.click();
          closeTabAfterDelay(2500);
        }, 1500);
      } else {
        // Also close on manual 2nd click if you open a link yourself
        let clicks = 0;
        dlBtn.addEventListener("click", () => {
          clicks++;
          if (clicks >= 2) {
            closeTabAfterDelay(2500);
          }
        });
      }
    }, 500);
  });
})();