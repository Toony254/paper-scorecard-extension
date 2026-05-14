const form = document.getElementById("settings-form");
const statusNode = document.getElementById("status");
const outputLanguage = document.getElementById("outputLanguage");
const customLanguageRow = document.getElementById("custom-language-row");

init();

async function init() {
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  for (const [key, value] of Object.entries(settings)) {
    const input = document.getElementById(key);
    if (!input) continue;
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value;
    }
  }
  updateCustomLanguageVisibility();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusNode.textContent = "";

  const formData = new FormData(form);
  const settings = Object.fromEntries(formData.entries());
  settings.disableResponseStorage = document.getElementById("disableResponseStorage").checked;
  settings.reviewPdfOnAbs = document.getElementById("reviewPdfOnAbs").checked;
  settings.cachePdfText = document.getElementById("cachePdfText").checked;
  settings.enableRelatedWorkSearch = document.getElementById("enableRelatedWorkSearch").checked;
  const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });

  if (response?.ok) {
    statusNode.textContent = "Saved.";
  } else {
    statusNode.textContent = response?.error || "Failed to save settings.";
  }
});

outputLanguage.addEventListener("change", updateCustomLanguageVisibility);

function updateCustomLanguageVisibility() {
  customLanguageRow.classList.toggle("hidden", outputLanguage.value !== "custom");
}
