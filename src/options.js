const form = document.getElementById("settings-form");
const statusNode = document.getElementById("status");
const outputLanguage = document.getElementById("outputLanguage");
const customLanguageRow = document.getElementById("custom-language-row");
const openRouterLoginButton = document.getElementById("openrouter-login");

init();

async function init() {
  await finishOpenRouterOAuthIfNeeded();
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
openRouterLoginButton.addEventListener("click", startOpenRouterOAuth);

function updateCustomLanguageVisibility() {
  customLanguageRow.classList.toggle("hidden", outputLanguage.value !== "custom");
}

async function startOpenRouterOAuth() {
  statusNode.textContent = "Opening OpenRouter login...";
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem("openrouter_code_verifier", verifier);
  const callbackUrl = location.href.split("?")[0];
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  location.href = `https://openrouter.ai/auth?${params.toString()}`;
}

async function finishOpenRouterOAuthIfNeeded() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;
  const verifier = sessionStorage.getItem("openrouter_code_verifier");
  history.replaceState(null, "", location.pathname);
  if (!verifier) {
    statusNode.textContent = "OpenRouter login failed: missing PKCE verifier.";
    return;
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" })
    });
    const payload = await response.json();
    if (!response.ok || !payload.key) throw new Error(payload.error?.message || payload.message || `HTTP ${response.status}`);
    const current = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: {
        ...current,
        provider: "openai-chat",
        baseUrl: "https://openrouter.ai/api",
        apiKey: payload.key,
        model: document.getElementById("model").value || "openai/gpt-4o"
      }
    });
    sessionStorage.removeItem("openrouter_code_verifier");
    statusNode.textContent = "OpenRouter connected.";
  } catch (error) {
    statusNode.textContent = `OpenRouter login failed: ${error.message || String(error)}`;
  }
}

function randomBase64Url(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
