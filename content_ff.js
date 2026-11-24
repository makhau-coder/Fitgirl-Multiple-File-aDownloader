(function () {
  chrome.runtime.sendMessage({ type: "IS_MANAGED_TAB" }, (res) => {
    if (!res || !res.managed) return;

    const waitForButton = setInterval(() => {
      const dlBtn = document.querySelector('a.link-button[hx-post]');
      if (!dlBtn) return;

      clearInterval(waitForButton);

      dlBtn.click();

      setTimeout(() => {
        dlBtn.click();
      }, 1500);
    }, 500);
  });
})();
