(function () {
  if (window.__ffBatchRunning) return;
  window.__ffBatchRunning = true;

  async function resolveDirectUrl(hxPost) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(hxPost, {
        method: "POST",
        credentials: "include",
        headers: {
          "HX-Request": "true",
          "HX-Current-URL": window.location.href
        }
      });

      const headerUrl =
        res.headers.get("HX-Redirect") || res.headers.get("Location");
      if (headerUrl && headerUrl.includes("/dl/")) {
        return headerUrl;
      }

      const body = await res.text();
      const match = body.match(/https?:\/\/[^\s"'<>]*\/dl\/[^\s"'<>]+/i);
      if (match) {
        return match[0];
      }

      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 600));
      } else if (headerUrl) {
        return headerUrl;
      }
    }
    return null;
  }

  async function startDirectDownload(hxPost) {
    try {
      const directUrl = await resolveDirectUrl(hxPost);
      if (!directUrl) return false;

      chrome.runtime.sendMessage({
        type: "DOWNLOAD_DIRECT",
        url: directUrl
      });
      return true;
    } catch (err) {
      console.error("FF Batch Downloader error:", err);
      return false;
    }
  }

  chrome.runtime.sendMessage({ type: "IS_MANAGED_TAB" }, (res) => {
    const isManaged = Boolean(res && res.managed);

    const waitForButton = setInterval(() => {
      const dlBtn = document.querySelector("a.link-button[hx-post]");
      if (!dlBtn) return;

      clearInterval(waitForButton);
      const hxPost = dlBtn.getAttribute("hx-post");

      if (isManaged) {
        // Bypass the DOM click & ad popup completely
        startDirectDownload(hxPost);
      } else {
        // Manual browsing: 1-click ad-free download + auto-close
        dlBtn.removeAttribute("hx-post");
        dlBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          startDirectDownload(hxPost);
        });
      }
    }, 500);
  });
})();