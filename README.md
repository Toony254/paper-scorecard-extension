# Paper Scorecard

Paper Scorecard is an open-source browser extension prototype that shows an AI reviewer scorecard for arXiv papers in the browser sidebar.

It is designed for paper triage: helping readers quickly judge whether a paper deserves deep reading, monitoring, or skipping. It does not replace peer review.

## Features

- Runs on `https://arxiv.org/abs/*` and supports arXiv PDF URLs through the browser sidebar
- Extracts arXiv title, authors, abstract, subjects, comments, PDF link, and optional PDF text
- Reviews PDF text using bundled PDF.js
- Uses the browser sidebar for arXiv abstract and PDF review
- Supports auto, light, and dark theme rendering
- Uses a user-configured OpenAI Responses, OpenAI Chat Completions, or Claude Messages compatible API
- Scores papers on seven reviewer dimensions inspired by Stanford Agentic Reviewer:
  - Originality
  - Research Question Importance
  - Claims Support
  - Experiment Soundness
  - Writing Clarity
  - Value to Research Community
  - Prior Work Contextualization
- Estimates publication level conservatively:
  - CCF-A potential
  - CCF-B potential
  - workshop-level
  - technical-report/preliminary
  - unclear
- Caches generated reviews locally by arXiv ID
- Supports multilingual review output from settings
- Optionally caches extracted PDF text locally
- Searches arXiv related work and uses retrieved papers to judge novelty and theoretical value
- Related-work retrieval can request up to 100 arXiv papers
- Uses the native Chrome/Edge browser sidebar through the `sidePanel` API

## Install Locally

1. Open Chrome or Edge.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the cloned `paper-scorecard-extension` folder.

6. Open the extension settings and configure:
   - API format: `OpenAI Responses compatible`, `OpenAI Chat Completions compatible`, or `Claude Messages compatible`
   - Base URL, for example `https://api.openai.com`
   - API key
   - model, for example `gpt-5.4`
   - reasoning effort, for example `high`
   - review output language, for example `简体中文` or `English`
   - max tokens, default `2200`
   - related work limit, default `10`

## Use

1. Open an arXiv abstract page, such as `https://arxiv.org/abs/1706.03762`.
2. The extension attempts to open the browser sidebar automatically.
3. If the browser blocks automatic sidebar opening, click the Paper Scorecard toolbar icon and choose `Open Sidebar`.
4. Click `Review` inside the sidebar. If enabled, this fetches PDF text and arXiv related work.

For PDF pages such as `https://arxiv.org/pdf/1706.03762`, use the browser sidebar. The extension does not show an in-page floating window.

## Browser Compatibility

- Chrome / Edge: supports the native `sidePanel` API and is the primary target of `manifest.json`.
- Firefox: does not support Chrome's `sidePanel` API. Use `manifest.firefox.json` as the starting point for a Firefox build based on `sidebar_action`.
- Other Chromium browsers: support depends on whether they implement Chrome's `sidePanel` API.

## API Compatibility

The extension uses a cc-switch-style Base URL. You do not need to enter the full path.

| API format | User fills Base URL | Extension calls |
|---|---|---|
| OpenAI Responses compatible | `https://api.openai.com` | `https://api.openai.com/v1/responses` |
| OpenAI Chat Completions compatible | `https://api.openai.com` | `https://api.openai.com/v1/chat/completions` |
| Claude Messages compatible | `https://api.anthropic.com` | `https://api.anthropic.com/v1/messages` |

For OpenAI-compatible proxy services, fill only the service root, for example:

```text
https://your-proxy.example.com
```

The extension will append `/v1/responses` when `OpenAI Responses compatible` is selected. For services that only support the older Chat Completions API, select `OpenAI Chat Completions compatible`.

For a custom OpenAI-compatible provider like:

```toml
wire_api = "responses"
base_url = "https://your-openai-compatible-proxy.example.com"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true
```

Use:

```text
API format: OpenAI Responses compatible
Base URL: https://your-openai-compatible-proxy.example.com
Model: gpt-5.4
Reasoning effort: high
Disable response storage: checked
Review output language: 简体中文
Max tokens: 2200
Related work limit: 10
```

For Claude-compatible proxy services, fill only the service root and select `Claude Messages compatible`. The extension will append `/v1/messages`.

Because the API endpoint is user-configurable, the local prototype requests broad host permissions. Before publishing to a browser store, replace this with a narrower allowlist or optional host permission flow.

## Rubric Philosophy

The scorecard combines:

- Stanford Agentic Reviewer-style dimensions
- strict academic reviewer checks: novelty, soundness, claim support, baseline sufficiency, evidence quality, clarity, and community value
- conservative uncertainty handling

Scores should be interpreted as an auxiliary reading signal. PDF review is implemented with bundled PDF.js. Extraction quality depends on the PDF text layer; scanned PDFs or unusual layouts may produce incomplete text.

## Development Notes

This is a Manifest V3 extension with no build step:

```text
manifest.json
src/background.js
src/content.js
src/content.css
src/review-renderer.js
src/sidepanel.html
src/sidepanel.css
src/sidepanel.js
src/options.html
src/options.css
src/options.js
src/popup.html
src/popup.js
icons/
```

## Planned Improvements

- Field-specific rubrics
- User-adjustable scoring weights
- Export scorecards as Markdown
- Batch review for arXiv search pages
