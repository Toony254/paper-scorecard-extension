const body = document.getElementById("sidepanel-body");
const reviewButton = document.querySelector('[data-action="review"]');
const fixedTabId = new URLSearchParams(location.search).get("tabId");

let state = {
  loading: false,
  paper: null,
  review: null,
  error: null,
  diagnostics: null
};

document.querySelector('[data-action="options"]').addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
});

reviewButton.addEventListener("click", () => runReview(true));

init();

async function init() {
  await loadPaper();
  render();
}

async function loadPaper() {
  const response = await chrome.runtime.sendMessage({ type: "GET_CURRENT_TAB_PAPER", tabId: fixedTabId });
  if (!response?.ok) {
    state.error = response?.error || "No arXiv page detected.";
    return;
  }
  state.paper = response.paper;
  state.diagnostics = {
    source: state.paper.source,
    arxivId: state.paper.arxivId,
    pdfUrl: state.paper.pdfUrl,
    url: state.paper.url
  };
  const cached = await chrome.runtime.sendMessage({ type: "GET_CACHED_REVIEW", paperId: state.paper.arxivId });
  state.review = cached?.review || null;
}

async function runReview(force = false) {
  if (!state.paper) await loadPaper();
  if (!state.paper) return render();

  state.loading = true;
  state.error = null;
  render();

  try {
    const response = await chrome.runtime.sendMessage({ type: "REVIEW_PAPER", paper: state.paper, force });
    if (!response?.ok) throw new Error(response?.error || "Review failed.");
    state.review = response.review;
  } catch (error) {
    state.error = error.message || String(error);
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  reviewButton.disabled = state.loading;
  reviewButton.textContent = state.review ? "Refresh" : "Review";

  if (state.loading) {
    body.innerHTML = `${renderDiagnostics()}<p class="ps-status">Fetching PDF text, searching related work, and generating the scorecard. This may take 30-90 seconds.</p>`;
    return;
  }
  if (state.error) {
    body.innerHTML = `<div class="ps-error">${PaperScorecardRenderer.escapeHtml(state.error)}</div>`;
    return;
  }
  if (state.review) {
    body.innerHTML = renderDiagnostics() + renderReviewDiagnostics() + PaperScorecardRenderer.renderReview(state.review);
    return;
  }
  body.innerHTML = `
    <p class="ps-status">Ready to review the current arXiv paper.</p>
    ${renderDiagnostics()}
  `;
}

function renderDiagnostics() {
  if (!state.diagnostics) return "";
  return `
    <section class="ps-section">
      <h4>Detected Paper</h4>
      <p class="ps-small">Source: ${PaperScorecardRenderer.escapeHtml(state.diagnostics.source || "Unknown")}</p>
      <p class="ps-small">arXiv ID: ${PaperScorecardRenderer.escapeHtml(state.diagnostics.arxivId || "Unknown")}</p>
      <p class="ps-small">PDF: ${PaperScorecardRenderer.escapeHtml(state.diagnostics.pdfUrl || "Unknown")}</p>
    </section>
  `;
}

function renderReviewDiagnostics() {
  if (!Array.isArray(state.review?.diagnostics) || state.review.diagnostics.length === 0) return "";
  return `
    <section class="ps-section">
      <h4>Extraction Diagnostics</h4>
      <ul class="ps-list">${state.review.diagnostics.map((item) => `<li>${PaperScorecardRenderer.escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}
