document.getElementById("sidebar").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (chrome.sidePanel?.open && tab?.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
      return;
    } catch (error) {
      document.body.querySelector("p").textContent = `Sidebar could not be opened: ${error.message || String(error)}`;
      return;
    }
  }
  document.body.querySelector("p").textContent = "This browser does not support the Chrome/Edge sidePanel API.";
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
