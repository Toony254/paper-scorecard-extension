(function () {
  if (!/^\/(abs|pdf)\//.test(location.pathname)) return;

  chrome.runtime.sendMessage({ type: "AUTO_OPEN_SIDE_PANEL" }).catch(() => {
    // Browsers may block automatic sidebar opening. The toolbar button remains the manual path.
  });
})();
