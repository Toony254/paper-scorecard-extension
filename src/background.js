const DEFAULT_SETTINGS = {
  provider: "openai-responses",
  baseUrl: "https://api.openai.com",
  apiKey: "",
  model: "gpt-5.4",
  reasoningEffort: "high",
  disableResponseStorage: true,
  outputLanguage: "zh-CN",
  customOutputLanguage: "",
  themeMode: "auto",
  reviewPdfOnAbs: true,
  cachePdfText: false,
  enableRelatedWorkSearch: true,
  relatedWorkLimit: 10,
  temperature: 0.2,
  maxTokens: 2200
};

const REVIEW_SCHEMA_HINT = {
  overall_score: "number from 0 to 10",
  estimated_level: "one of: CCF-A potential, CCF-B potential, workshop-level, technical-report/preliminary, unclear",
  confidence: "High, Medium, or Low",
  review_scope: "what was analyzed",
  one_line_judgment: "single sentence",
  dimensions: [
    {
      name: "dimension name",
      score: "number from 0 to 10",
      reason: "brief evidence-based reason grounded in paper text and related work"
    }
  ],
  strengths: ["specific strength"],
  weaknesses: ["specific reviewer concern"],
  related_work_context: ["how a retrieved related paper affects novelty judgment"],
  decision_guidance: ["practical reading or decision guidance"]
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) next[key] = value;
  }
  if (Object.keys(next).length) await chrome.storage.sync.set(next);
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await openReviewSurface(tab, { markActive: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "GET_SETTINGS":
      return getSettings();
    case "SAVE_SETTINGS":
      return saveSettings(message.settings || {});
    case "OPEN_OPTIONS":
      chrome.runtime.openOptionsPage();
      return { ok: true };
    case "OPEN_SIDE_PANEL":
      return openReviewSurface(sender.tab, { markActive: true });
    case "AUTO_OPEN_SIDE_PANEL":
      return openReviewSurface(sender.tab, { markActive: false });
    case "GET_CACHED_REVIEW":
      return getCachedReview(message.paperId);
    case "REVIEW_PAPER":
      return reviewPaper(message.paper, Boolean(message.force));
    case "GET_CURRENT_TAB_PAPER":
      return getCurrentTabPaper(message.tabId);
    default:
      return { ok: false, error: "Unknown message type." };
  }
}

async function getSettings() {
  const settings = await chrome.storage.sync.get({ ...DEFAULT_SETTINGS, endpoint: "" });
  if (!settings.baseUrl && settings.endpoint) settings.baseUrl = deriveBaseUrl(settings.endpoint);
  return settings;
}

async function saveSettings(settings) {
  const next = {
    provider: normalizeProvider(settings.provider),
    baseUrl: normalizeBaseUrl(settings.baseUrl || settings.endpoint || DEFAULT_SETTINGS.baseUrl),
    apiKey: String(settings.apiKey || "").trim(),
    model: String(settings.model || DEFAULT_SETTINGS.model).trim(),
    reasoningEffort: normalizeReasoningEffort(settings.reasoningEffort),
    disableResponseStorage: parseBoolean(settings.disableResponseStorage, DEFAULT_SETTINGS.disableResponseStorage),
    outputLanguage: normalizeOutputLanguage(settings.outputLanguage),
    customOutputLanguage: String(settings.customOutputLanguage || "").trim(),
    themeMode: normalizeThemeMode(settings.themeMode),
    reviewPdfOnAbs: parseBoolean(settings.reviewPdfOnAbs, DEFAULT_SETTINGS.reviewPdfOnAbs),
    cachePdfText: parseBoolean(settings.cachePdfText, DEFAULT_SETTINGS.cachePdfText),
    enableRelatedWorkSearch: parseBoolean(settings.enableRelatedWorkSearch, DEFAULT_SETTINGS.enableRelatedWorkSearch),
    relatedWorkLimit: Math.round(clampNumber(settings.relatedWorkLimit, 0, 100, DEFAULT_SETTINGS.relatedWorkLimit)),
    temperature: clampNumber(settings.temperature, 0, 1, DEFAULT_SETTINGS.temperature),
    maxTokens: Math.round(clampNumber(settings.maxTokens, 500, 12000, DEFAULT_SETTINGS.maxTokens))
  };
  await chrome.storage.sync.set(next);
  return { ok: true, settings: next };
}

async function getCachedReview(paperId) {
  if (!paperId) return { ok: true, review: null };
  const key = cacheKey(paperId);
  const result = await chrome.storage.local.get(key);
  return { ok: true, review: result[key] || null };
}

async function reviewPaper(paper, force) {
  if (!paper?.arxivId) return { ok: false, error: "No arXiv paper metadata found." };

  const settings = await getSettings();
  if (!settings.apiKey) return { ok: false, error: "Missing API key. Open the extension settings first." };

  const key = cacheKey(paper.arxivId);
  if (!force) {
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) return { ok: true, review: cached[key], cached: true };
  }

  const enrichedPaper = await enrichPaperForReview(paper, settings);
  const review = await callReviewModel(enrichedPaper, settings);
  review.generated_at = new Date().toISOString();
  review.paper_id = enrichedPaper.arxivId;
  review.paper_title = enrichedPaper.title;
  review.review_scope = review.review_scope || enrichedPaper.reviewScope;
  review.diagnostics = enrichedPaper.diagnostics || [];
  await chrome.storage.local.set({ [key]: review });
  return { ok: true, review };
}

async function enrichPaperForReview(paper, settings) {
  const enriched = { ...paper, diagnostics: [] };
  try {
    Object.assign(enriched, await fetchArxivMetadata(paper.arxivId));
    enriched.diagnostics.push("Loaded arXiv metadata from export.arxiv.org.");
  } catch (error) {
    enriched.diagnostics.push(`arXiv metadata fetch failed: ${error.message || String(error)}`);
  }

  const shouldFetchPdf = paper.source === "arXiv PDF" || settings.reviewPdfOnAbs;

  if (shouldFetchPdf && paper.pdfUrl) {
    try {
      enriched.pdfText = await getPdfText(enriched, settings);
      enriched.diagnostics.push(`Extracted ${enriched.pdfText.length} characters of PDF text.`);
    } catch (error) {
      enriched.pdfError = error.message || String(error);
      enriched.diagnostics.push(`PDF extraction failed: ${enriched.pdfError}`);
    }
  }

  if (settings.enableRelatedWorkSearch) {
    try {
      enriched.relatedWork = await searchRelatedWork(enriched, settings.relatedWorkLimit);
      enriched.diagnostics.push(`Retrieved ${enriched.relatedWork.length} related arXiv records.`);
    } catch (error) {
      enriched.relatedWorkError = error.message || String(error);
      enriched.diagnostics.push(`Related-work search failed: ${enriched.relatedWorkError}`);
    }
  }

  const scopes = [];
  if (enriched.abstract) scopes.push("arXiv metadata and abstract");
  if (enriched.pdfText) scopes.push("PDF text");
  if (enriched.relatedWork?.length) scopes.push("arXiv related-work search");
  enriched.reviewScope = scopes.join(" + ") || "available metadata";
  return enriched;
}

async function fetchArxivMetadata(arxivId) {
  if (!arxivId) throw new Error("Missing arXiv ID.");
  const baseId = String(arxivId).replace(/v\d+$/i, "");
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(baseId)}`;
  const response = await fetch(url);
  if (!response.ok) return fetchArxivAbsMetadata(baseId, `arXiv API failed (${response.status}).`);
  const xml = await response.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return fetchArxivAbsMetadata(baseId, "No arXiv API entry returned.");
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)]
    .map((match) => normalizeSpace(decodeXml(match[1])))
    .join(", ");
  const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)]
    .map((match) => match[1])
    .join(", ");
  return {
    title: normalizeSpace(decodeXml(extractXml(entry, "title"))),
    authors,
    abstract: normalizeSpace(decodeXml(extractXml(entry, "summary"))),
    subjects: categories,
    comments: normalizeSpace(decodeXml(extractXml(entry, "arxiv:comment")))
  };
}

async function fetchArxivAbsMetadata(arxivId, reason) {
  const url = `https://arxiv.org/abs/${encodeURIComponent(arxivId)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${reason}; abs page fetch failed (${response.status}).`);
  const html = await response.text();
  const title = normalizeSpace(stripTags(extractHtml(html, /<h1 class="title[^"]*">([\s\S]*?)<\/h1>/i))).replace(/^Title:\s*/i, "");
  const authors = normalizeSpace(stripTags(extractHtml(html, /<div class="authors">([\s\S]*?)<\/div>/i))).replace(/^Authors?:\s*/i, "");
  const abstract = normalizeSpace(stripTags(extractHtml(html, /<blockquote class="abstract[^"]*">([\s\S]*?)<\/blockquote>/i))).replace(/^Abstract:\s*/i, "");
  const subjects = normalizeSpace(stripTags(extractHtml(html, /<td class="tablecell subjects">([\s\S]*?)<\/td>/i)));
  const comments = normalizeSpace(stripTags(extractHtml(html, /<td class="tablecell comments">([\s\S]*?)<\/td>/i)));
  return { title, authors, abstract, subjects, comments };
}

async function getPdfText(paper, settings) {
  const key = pdfTextCacheKey(paper.arxivId);
  if (settings.cachePdfText) {
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) return cached[key];
  }

  const response = await fetch(paper.pdfUrl);
  if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const text = await extractPdfTextInOffscreen(bytes);
  const trimmed = text.slice(0, 85000);
  if (settings.cachePdfText) await chrome.storage.local.set({ [key]: trimmed });
  return trimmed;
}

async function extractPdfTextInOffscreen(arrayBuffer) {
  await ensureOffscreenDocument();
  const bytes = Array.from(new Uint8Array(arrayBuffer));
  const response = await chrome.runtime.sendMessage({ type: "EXTRACT_PDF_TEXT_OFFSCREEN", bytes });
  if (!response?.ok) throw new Error(response?.error || "Offscreen PDF extraction failed.");
  return response.text || "";
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) return;
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("src/offscreen.html")]
  });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "src/offscreen.html",
    reasons: ["DOM_PARSER"],
    justification: "Extract text from arXiv PDFs with PDF.js for paper review."
  });
}

async function searchRelatedWork(paper, limit) {
  if (!limit) return [];
  const htmlResults = await searchRelatedWorkHtml(paper, limit);
  if (htmlResults.length) return htmlResults;
  const query = buildRelatedWorkQuery(paper);
  if (!query) return [];
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${limit + 3}&sortBy=relevance&sortOrder=descending`;
  const response = await fetch(url);
  if (!response.ok) return searchRelatedWorkFallback(paper, limit);
  const xml = await response.text();
  return parseArxivFeed(xml, paper.arxivId).slice(0, limit);
}

async function searchRelatedWorkHtml(paper, limit) {
  const terms = encodeURIComponent(String(paper.title || paper.abstract || paper.arxivId).replace(/[^\w\s-]/g, " ").split(/\s+/).filter((word) => word.length > 4).slice(0, 10).join(" "));
  const primary = await searchRelatedWorkHtmlQuery(terms, paper, limit);
  if (primary.length) return primary;
  return searchRelatedWorkHtmlQuery("world+model+latent+state+representation+agent", paper, limit);
}

async function searchRelatedWorkHtmlQuery(terms, paper, limit) {
  const url = `https://arxiv.org/search/?query=${terms}&searchtype=all&abstracts=show&order=-announced_date_first&size=${Math.min(200, Math.max(25, limit))}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`arXiv HTML related-work search failed (${response.status}).`);
  const html = await response.text();
  const anchors = [...html.matchAll(/<p class="list-title[^"]*">[\s\S]*?<a href="([^"]+)"/gi)];
  return anchors
    .map((match, index) => {
      const start = match.index || 0;
      const end = anchors[index + 1]?.index || html.length;
      const chunk = html.slice(start, end);
      const idUrl = decodeXml(match[1]);
      const id = idUrl.split("/abs/").pop() || "";
      return {
        id,
        title: normalizeSpace(stripTags(extractHtml(chunk, /<p class="title[^"]*">([\s\S]*?)<\/p>/i))),
        summary: normalizeSpace(stripTags(extractHtml(chunk, /<span class="abstract-full[^"]*">([\s\S]*?)<\/span>/i))).slice(0, 900),
        published: "",
        url: idUrl
      };
    })
    .filter((item) => item.id && item.title && !sameArxivId(item.id, paper.arxivId))
    .slice(0, limit);
}

async function searchRelatedWorkFallback(paper, limit) {
  const fallbackQuery = "all:world+OR+all:model+OR+all:latent+OR+all:state+OR+all:representation+OR+all:agent";
  const url = `https://export.arxiv.org/api/query?search_query=${fallbackQuery}&start=0&max_results=${limit + 5}&sortBy=relevance&sortOrder=descending`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const xml = await response.text();
  return parseArxivFeed(xml, paper.arxivId).slice(0, limit);
}

function buildRelatedWorkQuery(paper) {
  const stop = new Set(["this", "that", "with", "from", "under", "model", "models", "paper", "state", "latent", "world"]);
  const titleTerms = String(`${paper.title || ""} ${paper.abstract || ""}`)
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 4 && !stop.has(word))
    .slice(0, 10)
    .map((word) => `all:${word}`)
    .join("+OR+");
  const subject = String(paper.subjects || "").split(";")[0]?.trim();
  if (titleTerms) return titleTerms;
  if (subject) return `cat:${subject}`;
  return "";
}

function parseArxivFeed(xml, currentId) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  return entries
    .map((entry) => {
      const idUrl = decodeXml(extractXml(entry, "id"));
      const id = idUrl.split("/abs/").pop() || idUrl.split("/").pop() || "";
      return {
        id,
        title: normalizeSpace(decodeXml(extractXml(entry, "title"))),
        summary: normalizeSpace(decodeXml(extractXml(entry, "summary"))).slice(0, 900),
        published: decodeXml(extractXml(entry, "published")).slice(0, 10),
        url: idUrl
      };
    })
    .filter((item) => item.id && !sameArxivId(item.id, currentId));
}

async function getCurrentTabPaper(tabId) {
  const rememberedTabId = tabId || await getRememberedSidebarTab();
  const tab = rememberedTabId
    ? await chrome.tabs.get(Number(rememberedTabId))
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.url) return { ok: false, error: "No active tab found." };
  const paper = paperFromArxivUrl(tab.url);
  if (!paper) return { ok: false, error: `Open an arXiv abstract or PDF page first. Current tab URL: ${tab.url}` };
  return { ok: true, paper };
}

async function openReviewSurface(tab, options = {}) {
  if (chrome.sidePanel?.open && tab?.windowId) {
    try {
      if (tab?.id) await rememberSidebarTab(tab.id);
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return { ok: true, surface: "sidePanel" };
    } catch (error) {
      return { ok: false, error: `Browser sidebar could not be opened: ${error.message || String(error)}` };
    }
  }
  return { ok: false, error: "This browser does not support the Chrome/Edge sidePanel API. Use the Firefox-specific sidebar build instead." };
}

function paperFromArxivUrl(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/(abs|pdf)\/([^?#]+)/);
  if (!match) return null;
  const kind = match[1];
  const arxivId = match[2].replace(/\.pdf$/i, "");
  return {
    source: kind === "pdf" ? "arXiv PDF" : "arXiv",
    url,
    arxivId,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    title: "",
    authors: "",
    abstract: "",
    subjects: "",
    comments: ""
  };
}

async function callReviewModel(paper, settings) {
  const provider = normalizeProvider(settings.provider);
  if (provider === "claude-messages") return callClaudeMessages(paper, settings);
  if (provider === "openai-responses") return callOpenAIResponses(paper, settings);
  return callOpenAIChatCompletions(paper, settings);
}

async function callOpenAIChatCompletions(paper, settings) {
  const endpoint = buildEndpoint(settings.baseUrl, "/v1/chat/completions");
  const body = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(settings) },
      { role: "user", content: buildUserPrompt(paper, settings) }
    ]
  };
  if (!isReasoningModel(settings.model)) body.temperature = settings.temperature;
  return parseChatLikeReviewResponse(await postJson(endpoint, settings, body), "openai-chat");
}

async function callOpenAIResponses(paper, settings) {
  const endpoint = buildEndpoint(settings.baseUrl, "/v1/responses");
  const body = {
    model: settings.model,
    max_output_tokens: settings.maxTokens,
    instructions: buildSystemPrompt(settings),
    input: buildUserPrompt(paper, settings),
    text: { format: { type: "json_object" } },
    store: !settings.disableResponseStorage
  };
  if (settings.reasoningEffort !== "none") body.reasoning = { effort: settings.reasoningEffort };
  if (!isReasoningModel(settings.model)) body.temperature = settings.temperature;
  return parseResponsesReviewResponse(await postJson(endpoint, settings, body));
}

async function callClaudeMessages(paper, settings) {
  const endpoint = buildEndpoint(settings.baseUrl, "/v1/messages");
  const body = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    system: buildSystemPrompt(settings),
    messages: [{ role: "user", content: `${buildUserPrompt(paper, settings)}\n\nReturn only valid JSON. Do not wrap it in markdown.` }]
  };
  if (!isReasoningModel(settings.model)) body.temperature = settings.temperature;
  return parseChatLikeReviewResponse(await postJson(endpoint, settings, body, "claude"), "claude");
}

async function postJson(endpoint, settings, body, provider = "openai") {
  const headers = provider === "claude"
    ? { "Content-Type": "application/json", "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" }
    : { "Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}` };
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`API request failed (${response.status}): ${summarizeResponse(rawText, contentType, endpoint)}`);
  if (looksLikeHtml(rawText, contentType)) throw new Error(`Endpoint returned HTML instead of JSON. Final endpoint: ${endpoint}`);
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(`API response was not valid JSON: ${rawText.slice(0, 300)}`);
  }
}

function parseResponsesReviewResponse(payload) {
  const content = extractOpenAIResponseText(payload);
  if (!content) throw new Error("Model returned an empty response.");
  return parseReviewJson(content);
}

function parseChatLikeReviewResponse(payload, provider) {
  const content = provider === "claude" ? extractClaudeText(payload) : payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned an empty response.");
  return parseReviewJson(content);
}

function parseReviewJson(content) {
  try {
    return normalizeReview(JSON.parse(stripJsonFence(content)));
  } catch (error) {
    throw new Error(`Model response was not valid scorecard JSON: ${String(content).slice(0, 500)}`);
  }
}

function buildSystemPrompt(settings) {
  return [
    "You are Paper Scorecard, an AI research reviewer for arXiv papers.",
    "Your job is to help readers triage papers, not to replace peer review.",
    "Be evidence-driven, skeptical, concise, and explicit about uncertainty.",
    "Do not rely only on internal model knowledge. Use the provided PDF text and retrieved arXiv related-work context when available.",
    "If PDF text is provided, do not say you cannot view the full paper in general terms. You may only say that extracted text may miss table layout, figures, formulas, appendices, or exact hyperparameter details if they are not present in the excerpt.",
    "Never claim a definitive venue outcome. Estimate only from the evidence provided.",
    "Use the Stanford Agentic Reviewer dimensions as the base rubric: originality, research question importance, claims support, experiment soundness, writing clarity, value to the research community, and prior work contextualization.",
    "Also apply strict top-tier review checks: novelty is fragile, improvements are not conclusions, every strong claim needs evidence, missing baselines weaken confidence, and overclaiming should be flagged.",
    `Write every natural-language field in ${getOutputLanguageName(settings)}. Keep JSON keys in English exactly as specified.`,
    "Return only valid JSON matching this shape:",
    JSON.stringify(REVIEW_SCHEMA_HINT)
  ].join("\n");
}

function buildUserPrompt(paper, settings) {
  return `
Analyze this arXiv paper from a reviewer-like perspective.

Paper metadata:
- arXiv ID: ${paper.arxivId}
- URL: ${paper.url}
- PDF: ${paper.pdfUrl}
- Title: ${paper.title || "Unknown from current page"}
- Authors: ${paper.authors || "Unknown from current page"}
- Subjects: ${paper.subjects || "Unknown"}
- Comments: ${paper.comments || "N/A"}

Abstract:
${paper.abstract || "Not available from current page."}

PDF text excerpt:
${paper.pdfText || "Not available."}

Extraction diagnostics:
${formatDiagnostics(paper)}

Retrieved arXiv related work:
${formatRelatedWork(paper)}

Scoring instructions:
- Use 0-10 scores.
- Include exactly these seven dimensions:
  1. Originality
  2. Research Question Importance
  3. Claims Support
  4. Experiment Soundness
  5. Writing Clarity
  6. Value to Research Community
  7. Prior Work Contextualization
- Estimate level conservatively as CCF-A potential, CCF-B potential, workshop-level, technical-report/preliminary, or unclear.
- Explicitly judge novelty and theoretical value against the retrieved related work when available.
- If PDF text is present, distinguish between unavailable content and content that is merely not reliably represented by text extraction.
- If only partial PDF text or metadata is available, lower confidence.
- Strengths and weaknesses must be specific to this paper, not generic.
- Decision guidance should help a reader decide whether to read deeply, skim, monitor, or skip.
- Output language for all prose values: ${getOutputLanguageName(settings)}.
`;
}

function formatRelatedWork(paper) {
  if (paper.relatedWork?.length) {
    return paper.relatedWork
      .map((item, index) => `${index + 1}. ${item.title} (${item.published}, ${item.id})\nSummary: ${item.summary}`)
      .join("\n\n");
  }
  return paper.relatedWorkError || "Not available.";
}

function formatDiagnostics(paper) {
  if (paper.diagnostics?.length) return paper.diagnostics.map((item) => `- ${item}`).join("\n");
  return "No diagnostics.";
}

function normalizeReview(review) {
  const dimensions = Array.isArray(review.dimensions) ? review.dimensions : [];
  return {
    overall_score: clampNumber(review.overall_score, 0, 10, 0),
    estimated_level: String(review.estimated_level || "unclear"),
    confidence: String(review.confidence || "Low"),
    review_scope: String(review.review_scope || ""),
    one_line_judgment: String(review.one_line_judgment || ""),
    dimensions: dimensions.slice(0, 7).map((item) => ({
      name: String(item.name || "Dimension"),
      score: clampNumber(item.score, 0, 10, 0),
      reason: String(item.reason || "")
    })),
    strengths: normalizeStringList(review.strengths),
    weaknesses: normalizeStringList(review.weaknesses),
    related_work_context: normalizeStringList(review.related_work_context),
    decision_guidance: normalizeStringList(review.decision_guidance)
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => String(item));
}

function cacheKey(paperId) {
  return `review:v2:${paperId}`;
}

function pdfTextCacheKey(paperId) {
  return `pdfText:v2:${paperId}`;
}

function normalizeProvider(provider) {
  if (provider === "claude-messages") return "claude-messages";
  if (provider === "openai-responses") return "openai-responses";
  return "openai-chat";
}

function normalizeReasoningEffort(value) {
  const allowed = new Set(["none", "minimal", "low", "medium", "high"]);
  return allowed.has(value) ? value : DEFAULT_SETTINGS.reasoningEffort;
}

function normalizeOutputLanguage(value) {
  const allowed = new Set(["zh-CN", "en", "ja", "ko", "fr", "de", "es", "custom"]);
  return allowed.has(value) ? value : DEFAULT_SETTINGS.outputLanguage;
}

function normalizeThemeMode(value) {
  if (value === "light" || value === "dark") return value;
  return "auto";
}

function getOutputLanguageName(settings = {}) {
  const language = normalizeOutputLanguage(settings.outputLanguage);
  if (language === "custom") return settings.customOutputLanguage || "the user's custom language";
  const names = {
    "zh-CN": "Simplified Chinese",
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    fr: "French",
    de: "German",
    es: "Spanish"
  };
  return names[language] || names[DEFAULT_SETTINGS.outputLanguage];
}

function normalizeBaseUrl(url) {
  return deriveBaseUrl(String(url || DEFAULT_SETTINGS.baseUrl).trim());
}

function deriveBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/v1\/responses$/i, "")
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/v1$/i, "");
}

function buildEndpoint(baseUrl, path) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function extractOpenAIResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") return part.text;
    }
  }
  return "";
}

function extractClaudeText(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : [];
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function stripJsonFence(text) {
  return String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function looksLikeHtml(text, contentType) {
  const sample = String(text || "").trim().toLowerCase();
  return contentType.includes("text/html") || sample.startsWith("<!doctype") || sample.startsWith("<html");
}

function summarizeResponse(text, contentType, endpoint) {
  if (looksLikeHtml(text, contentType)) return `endpoint returned HTML instead of JSON. Current endpoint: ${endpoint}`;
  return String(text || "").slice(0, 500);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function parseBoolean(value, fallback) {
  if (value === true || value === "true" || value === "on") return true;
  if (value === false || value === "false" || value === "off") return false;
  return fallback;
}

function isReasoningModel(model) {
  return /^(gpt-5|o\d|o\d-|o\d\.)/i.test(String(model || ""));
}

function extractXml(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1] : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sameArxivId(a, b) {
  return String(a || "").replace(/v\d+$/i, "") === String(b || "").replace(/v\d+$/i, "");
}

function extractHtml(html, regex) {
  const match = String(html || "").match(regex);
  return match ? match[1] : "";
}

function stripTags(html) {
  return decodeXml(String(html || "").replace(/<[^>]+>/g, " "));
}

async function rememberSidebarTab(tabId) {
  await chrome.storage.session.set({ sidebarTabId: Number(tabId) });
}

async function getRememberedSidebarTab() {
  const result = await chrome.storage.session.get("sidebarTabId");
  return result.sidebarTabId || null;
}

globalThis.__paperScorecardTest = {
  enrichPaperForReview,
  fetchArxivMetadata,
  searchRelatedWork,
  getPdfText
};
