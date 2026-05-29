# Store Listing Draft

Use this as the first version of the Chrome Web Store and Microsoft Edge Add-ons listing.

## Product Details

- Name: Paper Scorecard
- Short description: AI reviewer sidebar scorecards for arXiv papers.
- Category: Productivity
- Language: English

## Full Description

Paper Scorecard helps researchers triage arXiv papers from the browser sidebar. It extracts arXiv metadata and PDF text, searches related arXiv work, and sends the paper context to a user-configured AI model endpoint to generate a reviewer-style scorecard.

The scorecard evaluates originality, research question importance, claims support, experiment soundness, writing clarity, value to the research community, and prior work contextualization. It also uses publication timing, related-work context, citation signals, and author signals as auxiliary evidence when available.

Paper Scorecard is an auxiliary reading signal, not peer-review ground truth. Users should verify scores against the paper and the surrounding literature.

## Key Features

- Browser sidebar review for arXiv abstract and PDF pages
- PDF text extraction with bundled PDF.js
- Related-work search through arXiv
- Optional citation and author signals through Semantic Scholar
- User-configured OpenAI-compatible, Claude-compatible, or OpenRouter OAuth model access
- Multilingual review output
- Local review cache by arXiv ID

## Privacy Summary

Paper Scorecard stores API keys locally in the browser. It does not operate a backend service. When a user clicks Review, paper metadata, extracted PDF text, related-work context, and optional citation/author signals are sent to the model endpoint configured by the user. Generated reviews and optional PDF text cache are stored locally in the browser.

## Permission Justification

- `storage`: save settings, API key, local review cache, and optional PDF text cache.
- `activeTab` and `tabs`: identify the current arXiv page for sidebar review.
- `sidePanel`: display the review UI in the browser sidebar.
- `offscreen`: extract PDF text with PDF.js in a Manifest V3-compatible offscreen document.
- `https://arxiv.org/*` and `https://export.arxiv.org/*`: read arXiv pages, PDFs, and metadata.
- `https://api.semanticscholar.org/*`: fetch optional citation and author signals.
- `https://openrouter.ai/*`: support optional OpenRouter OAuth login.
- Optional host permissions: request access only to the user-configured model endpoint.

## Required Store Assets

- Extension package: `dist/paper-scorecard-extension.zip`
- Icon: `icons/icon128.png`
- Screenshot: `assets/paper-scorecard-preview.png`
- Privacy policy URL: required before submission

