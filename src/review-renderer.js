globalThis.PaperScorecardRenderer = {
  renderReview,
  renderList,
  renderDimension,
  formatScore,
  escapeHtml
};

function renderReview(review) {
  const dimensions = Array.isArray(review.dimensions) ? review.dimensions : [];
  return `
    <div class="ps-summary">
      <div class="ps-score-row">
        <div>
          <div class="ps-score">${escapeHtml(formatScore(review.overall_score))}</div>
          <div class="ps-small">Overall score / 10</div>
        </div>
        <div class="ps-venue">${escapeHtml(review.estimated_level || "Level unclear")}</div>
      </div>
      <div class="ps-confidence">Confidence: ${escapeHtml(review.confidence || "Unknown")} · Scope: ${escapeHtml(review.review_scope || "abstract metadata")}</div>
    </div>

    <section class="ps-section">
      <h4>One-line Judgment</h4>
      <p class="ps-status">${escapeHtml(review.one_line_judgment || "")}</p>
    </section>

    <section class="ps-section">
      <h4>Dimensions</h4>
      ${dimensions.map(renderDimension).join("")}
    </section>

    <section class="ps-section">
      <h4>Strengths</h4>
      ${renderList(review.strengths)}
    </section>

    <section class="ps-section">
      <h4>Reviewer Concerns</h4>
      ${renderList(review.weaknesses)}
    </section>

    <section class="ps-section">
      <h4>Related Work Context</h4>
      ${renderList(review.related_work_context)}
    </section>

    <section class="ps-section">
      <h4>Decision Guidance</h4>
      ${renderList(review.decision_guidance)}
    </section>

    <section class="ps-section">
      <p class="ps-small">This scorecard is an auxiliary reading signal, not peer-review ground truth. Scores should be checked against the paper and related work.</p>
    </section>
  `;
}

function renderDimension(item) {
  return `
    <div class="ps-dimension">
      <div class="ps-dim-name">${escapeHtml(item.name || "Dimension")}</div>
      <div class="ps-dim-score">${escapeHtml(formatScore(item.score))}</div>
      <div class="ps-dim-reason">${escapeHtml(item.reason || "")}</div>
    </div>
  `;
}

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) return `<p class="ps-small">No specific items returned.</p>`;
  return `<ul class="ps-list">${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
}

function formatScore(score) {
  const number = Number(score);
  if (!Number.isFinite(number)) return "N/A";
  return number.toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
