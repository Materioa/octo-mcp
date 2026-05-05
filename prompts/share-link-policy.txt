---
name: share-link-policy
version: 1.0.0
description: "Strict policy for how LLMs must handle PDF URLs, share links, and resource fetching in Materio MCP"
author: Materio Team
applyTo: "**"
---

# Share Link & PDF URL Policy

## Intent

Enforce strict separation between **internal PDF URLs** (for fetching/reading content) and **masked share links** (for presenting to users). LLMs must NEVER expose raw CDN or API proxy URLs in chat.

## Core Rules

### Rule 1 — NEVER expose raw PDF URLs to users

Raw CDN URLs (e.g., `https://cdn-materioa.vercel.app/pdfs/...`) and API proxy URLs (e.g., `.../api/pdfs/...`) are **internal-only**. They must NEVER appear in chat, markdown responses, or any user-facing output.

### Rule 2 — ALWAYS use ShareLinkGenerator for user-facing links

When a user asks for a link, download link, or share link to a document:
1. Call `ResourceAccess` to resolve the internal PDF URL.
2. Pass that internal URL into `ShareLinkGenerator` to get a masked share link.
3. Present **only** the masked share link (`https://materioa.vercel.app/?share=...`) to the user.

### Rule 3 — Share links are NOT fetchable

A share link (`https://materioa.vercel.app/?share=...`) is a **web UI page**. It is NOT a raw PDF file. You **cannot** use a share link to:
- Download or fetch a PDF
- Read or parse PDF content
- Extract text from a document

If you need to **read or fetch** a PDF (e.g., to answer a question about its content), use the **raw internal URL** returned by `ResourceAccess`. Never attempt to fetch the share link — it will return HTML, not a PDF.

### Rule 4 — Use the right URL for the right purpose

| Purpose | Use This | Tool |
|---------|----------|------|
| **Give user a link** | Masked share link | `ShareLinkGenerator` |
| **Fetch/read PDF content** | Raw internal URL | `ResourceAccess` |
| **Search for content** | Text search | `SnapSearch` or `DeepThink` |

## Workflow Examples

### User asks: "Give me the link for Deadlocks in OS"

1. Call `ResourceAccess(semester="4", subject="Operating System", topic="Deadlocks")`
   → Returns internal URL (DO NOT show this to user)
2. Call `ShareLinkGenerator(url=<internal_url>)`
   → Returns masked share link
3. Show ONLY the masked share link: `https://materioa.vercel.app/?share=abc123`

### User asks: "Explain what the Deadlocks chapter says"

1. Call `SnapSearch(query="Deadlocks", semester="4", subject="Operating System")`
   → Returns text chunks from the document
2. Use the returned content to formulate your answer
3. Do NOT generate or expose any URLs unless the user explicitly asks for a link

### User asks: "Pull up the Deadlocks PDF and summarize it"

1. Call `ResourceAccess(semester="4", subject="Operating System", topic="Deadlocks")`
   → Returns internal URL
2. Fetch the PDF using the **raw internal URL** (NOT a share link)
3. Summarize the content
4. If the user also wants a link, separately call `ShareLinkGenerator` for a masked link

## Anti-Patterns (NEVER do these)

❌ Showing `https://cdn-materioa.vercel.app/pdfs/4/Operating%20System/Deadlocks.pdf` in chat
❌ Attempting to fetch `https://materioa.vercel.app/?share=abc123` as if it were a PDF
❌ Generating a share link and then trying to use it to read PDF content
❌ Inventing or hallucinating URLs that were not returned by a tool
❌ Constructing CDN URLs manually without calling `ResourceAccess`
