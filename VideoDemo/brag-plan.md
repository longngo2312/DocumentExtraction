# DocExtract — Narrated Demo (v2)

## Brief from the user
Add voiceover. Open with the problem (manual extraction, manual review, human time, nothing searchable,
important data lost in thousands of documents), then the solution (this project), then close on a mission
statement: Capture → Extract → Search → Share. No length cap: as long as a complete demo needs (~100s).

## Rubric
1. **What is it?** A local-first app that turns PDFs, scans and Office files into structured data with source quotes, then answers questions across reviewed documents with citations.
2. **Who for?** Anyone who copies values out of piles of documents by hand: ops, admin, finance, students.
3. **What it does for them:** replaces reading-and-retyping and page-flipping verification with one review screen and a searchable, cited chat.
4. **What sets it apart:** every value carries the quote it came from, highlighted on the page; nothing reaches search before a human reviews it; it runs entirely on your machine.
5. **Most impressive claim:** "Each citation is checked before you see it" (README: the server checks each citation before it reaches the browser).
6. **Visual hook:** a screen filling with thousands of documents.
7. **Real UI shown:** schema editor, upload drop zone + queue, document review (PDF + fields + source quotes), Query chat with citations. Real copy from the frontend.
8. **Tone:** `polished` with a cinematic problem act: dark, quiet and sparse for the problem; music arrives with the solution.
9. **Share caption:** see share-copy.txt.

## Structure
| Act | Scenes | VO lines |
|---|---|---|
| Problem | P1 The pile · P2 Retyping · P3 Checking · P4 Unsearchable/lost | p1–p4 |
| Solution | S1 Reveal: the pile collapses into the DocExtract mark | s1 |
| Demo | 01 Schema · 02 Upload · 03 Extract · 03b Review · 04 Ask (pipeline rail on top) | d1–d5 |
| Mission | Capture → Extract → Search → Share, then brand lockup | m1–m5 |

Scene durations flex to the generated narration: each scene = its VO line + breathing room, never shorter than its animation.

## Problem act visuals (animated illustrations, drawn in the video's own style)
- **P1 The pile:** document cards (Contract, Invoice, Syllabus, Scanned form; PDF/DOCX/XLSX/JPG badges) drop in, then the camera pulls back to a wall of thousands of tiny documents.
- **P2 Retyping:** a paper invoice on the left with a reading line crawling down it; a spreadsheet on the right filling one cell at a time with a typing caret; a clock in the corner spinning. Caption: "Read. Type. Repeat."
- **P3 Checking:** a spreadsheet cell with a question mark; pages flip by under a magnifier hunting for the source line; clock keeps spinning. Caption: "Hours of checking."
- **P4 Lost:** a search box types "late submission policy" → "No results". The one document that held it glows, then sinks into the wall of thousands and disappears. Caption: "Lost in thousands of files."
- **Transition to S1:** the wall of documents collapses into the DocExtract mark.

## Demo act
Reuses the v1 screens (rebuilt from frontend theme tokens and copy), now paced to the narration.
Fictional user "Jordan Lee"; syllabus excerpt from the public course syllabus in docs/screenshots.

## Mission act
Four nodes light up as each word is spoken: Capture (scan) → Extract (table) → Search (magnifier) → Share
(share). Then "No important detail lost in the pile." and the brand lockup:
DocExtract · "Runs on your own machine · Ollama · Qdrant · SQLite".
Note: "Share" is the stated mission, not a shipped feature; it is presented as mission, not as a capability.

## Audio
- Problem act: no music. Sparse diegetic SFX: paper/card slides as documents land, keypresses while typing, an error buzz on "No results".
- Solution reveal: music (bundled `happy-beats-business-moves-vol-12`, steady and clean) starts with a soft impact.
- Music sits at ~0.13 under narration, lifts in the gaps and on the final lockup, fades out at the end.
- SFX: clicks on cursor clicks, drop on fields landing, a soft bell on "Reviewed" and on the final logo.

## Voiceover script (Kokoro, af_heart)
- **p1:** Every organization is buried in documents. Contracts, invoices, syllabi, scanned forms. Thousands of them.
- **p2:** Getting the data out still means someone reading every page and typing each value into a spreadsheet, one cell at a time.
- **p3:** Then someone else has to check that work, flipping back through the pages to find where each number came from. It takes hours.
- **p4:** And when it's done, none of it is searchable. The one detail you need is lost somewhere in thousands of files.
- **s1:** DocExtract changes that. It turns PDFs, scans and Office files into structured data you can check against the source.
- **d1:** Start with a schema. Name the fields you want from every document, like a course title, key dates, and a late policy.
- **d2:** Then drop in a file. PDFs, Office documents and images all work, and scanned pages go through OCR.
- **d3:** A local model fills in your schema, and every value comes back with the exact quote it was taken from.
- **d4:** Click a quote, and it lights up on the page. Accept, edit or reject each value. Nothing reaches search until you've reviewed it.
- **d5:** Now ask questions across everything you've reviewed. Every answer cites its sources, and each citation is checked before you see it.
- **m1–m4:** Capture. / Extract. / Search. / Share.
- **m5:** That's our mission. No important detail lost in the pile. And it all runs on your own machine.

Grounding: every product claim above maps to README.md ("How it works", Features) or the UI copy.
