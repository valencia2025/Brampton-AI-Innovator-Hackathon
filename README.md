# Field Desk

Field Desk is a local prototype for Brampton AI Innovator Challenge 3B. It turns industry topics, article links, and pasted articles into short-video packages for a coordinator to review. Job Site Scout serves Brampton-area crews. Starter serves drivers considering their first dump truck.

## Live first-time buyer demo

The **Generate a first-time buyer script** form is the current presentation flow. Paste 1–8 buyer questions (one per line), then 1–5 public HTML article URLs (one per line). The persona is fixed to **Starter**. The backend reads the pages at submission time, selects short passages relevant to the questions, and asks the configured model to write an answer, video script, caption, and storyboard. Each factual sentence should have a source ID and the exact passage offered in support. The review screen shows those passages next to claims; a coordinator must decide whether each passage genuinely supports the wording.

Set `OPENAI_API_KEY` in the backend `.env` to enable this live generation path and restart the server. The key is never sent to the browser. ChatGPT subscriptions do not provide API billing by themselves. The existing topic form below the live form remains a deterministic template demo without a key.

For a dependable presentation, try a question such as “What should I check before becoming an Ontario owner-operator?” with the Ontario CVOR URL in `config/sources.json`. If the live page cannot be fetched, the app clearly marks that it used the preloaded snapshot for that known URL. Other pages must be public readable HTML. Some sites block automated reading or rely on browser-only JavaScript; the app reports this as an error instead of pretending it read them. Forum questions are pasted by the team, not scraped. The URLs supplied for answers are not automatically deemed credible.

This stage deliberately does not include a research agent, persona selection, video rendering, or social publishing. Approval stays local.

## Run locally

Install Node.js 22.16 or later, then run these commands from the project directory. On Windows PowerShell, use `npm.cmd` if your execution policy blocks `npm.ps1`.

```sh
npm ci
npm run build
npm start
```

Open [Field Desk](http://127.0.0.1:4173). The default mode uses deterministic sample outputs and needs no API key. Edits and decisions persist as JSON in `local-data/`. The server listens on loopback and is intended for a single local process.

## Demo walkthrough

Select a sample and click **Create review**.

| Sample | Expected result |
| --- | --- |
| Brampton job-site news | Job Site Scout builds a pre-dispatch briefing from public map guidance. The submitted news scenario is fictional. |
| First truck | Starter gives a prospective owner-operator a buying checklist and links the Ontario CVOR guidance. |
| Outside scope | The submission is set aside with a reason. |
| Both personas | The coordinator can compare a crew dispatch briefing with a first-time owner's haul-planning angle. |
| Unsupported claim | The deliberately seeded “48 hours” line appears without evidence and blocks approval. Remove it from the script and save to rerun checks. |
| Approve locally | Approve a clean draft. Reload the review queue to see its saved status. The workflow ends at the local review record. |

For a URL demo, submit the City of Brampton Construction Projects URL from `config/sources.json`. For pasted text, use a public or fictional Brampton road project summary. Do not enter real customer or contact data.

```sh
npm run check
npm run build
npm run verify
```

The verification command exercises the local HTTP API and checks routing, citations, editing, rejection, blocked approval, local persistence, and URL and pasted-text handling.

## Configuration

| Setting | Default and behavior |
| --- | --- |
| `OPENAI_API_KEY` | When unset, use demo mode. When set, the backend sends submissions, relevant sources, and persona configuration to OpenAI for routing and drafting. |
| `OPENAI_MODEL` | `gpt-4.1-mini`. Select a model that supports Chat Completions JSON mode. |
| `PORT` | `4173`. The service binds to `127.0.0.1`. |

Copy `.env.example` to `.env` for an optional API key or port override. Restart after changing environment settings or JSON configuration. Keep submissions public or fictional in either mode.

- `config/brand.json` holds the working name, shared editorial voice, and brand rules. In the absence of the guidebook, “Field Desk” is an assumed internal workspace name and the editorial voice is plainspoken and practical.
- `config/personas.json` holds audiences, allowed and excluded topics, voice rules, and demo routing signals. The demo is scoped to Brampton for Scout and Ontario for Starter.
- `config/sources.json` holds public evidence and a fictional audience question. Each evidence record includes an approved factual sentence and exact source excerpt. The fictional question can inform the angle and has no URL.

## Limits

The prototype produces scripts and storyboards for coordinator review. Approved URLs resolve to local records. An unfamiliar URL contributes only its path for routing and prompts the user to paste the article; the backend does not fetch it. Pasted articles provide context and require an approved source before they support a claim.

Demo routing is keyword-based and drafts are templates. The backend validates AI response shapes and uses a conservative sentence checker for unsupported copy. The checker can flag harmless declarative wording and can miss implied claims, fabricated experiences, or out-of-scope language. Source excerpts are snapshots. The coordinator should review wording, geography, and current source details before approval.

## Connect a research agent next

1. Add optional source intake and credibility evaluation if the team expands beyond manually supplied URLs.
2. Add freshness checks and evidence versioning. Send uncertain or conflicting claims to the coordinator with competing passages for adjudication.
