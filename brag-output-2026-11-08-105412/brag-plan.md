# DocExtract — 45s Pipeline Brag

## Angle
The whole loop in one take: **Schema in. File in. Answers out.** The viewer watches one syllabus go through
every stage of the real app — define a schema, upload the PDF, watch fields come back with the quote they were
taken from, accept them, then ask the chat a question and get a cited answer. A pipeline rail at the top lights
up step by step so a stranger always knows where they are.

Length is 45s at the user's request (overrides the 20s default) so each of the four stages gets real screen time.

## Hook
Dark stage, three lines landing on beats: "Schema in." / "File in." / "Answers out." (blue).

## Highlights
1. Schema editor: fields typed in (`course_title`, `key_dates`, `late_policy`) → "Schema saved."
2. Upload: PDF dragged onto the drop zone → Uploading → Uploaded.
3. Extraction: Processing → Extracted, fields arrive with source quotes; click a quote, the sentence lights up on the PDF; accept all three → Reviewed.
4. RAG chat: "When are the exams, and what's the late policy?" → cited answer, sources expand.

## Punchline / outro
Brand mark + DocExtract + "Schema in. File in. Answers out." + "Runs on your own machine · Ollama · Qdrant · SQLite".

## Tone
`polished` leaning `app-store`: dark stage, the app's light UI in a window, smooth slides, no gimmicks.

## Visual identity (from frontend/src/theme.ts)
- Primary #2563EB, canvas #F8FAFC, paper #FFFFFF, sunken #F1F5F9, viewer desk #E2E8F0, divider #E2E8F0
- Text #0F172A / #475569; success #15803D; warning #B45309; info #0369A1; pending row #FEF3C7
- Stage: dark canvas #0A0B0C, dark accent #56AAFF
- Inter 400–700; JetBrains Mono for schema field names (as in FieldRow.tsx)
- Brand: DescriptionOutlined icon in a blue rounded square + "DocExtract"

## Privacy stand-ins
Screenshots show a real username/email; the video uses a fictional user "Jordan Lee" with no email.
The syllabus is a re-typed excerpt of the public course syllabus shown in docs/screenshots.

## Music
120 BPM (beat = 0.5s = 15 frames, bar = 2s), A minor / C major: Am – F – C – G, one chord per bar.
0–4 pad + plucks on the hook words; 4–8 bass + soft kick; 8–41 full groove (kick, offbeat hat, soft clap 2&4,
8th-note arp); arp lifts an octave at 31 for the chat; 41 final chord, drums stop, ring-out and fade.
SFX on the same grid: soft whoosh ending on each cut, low clicks on cursor clicks, in-key chimes on status changes.

## Storyboard (45s, 30fps = 1350 frames; every cut on a beat)

| # | Time | Scene | On screen |
|---|------|-------|-----------|
| 1 | 0–4 | Hook | "Schema in." (0.5) "File in." (1.5) "Answers out." (2.5) |
| 2 | 4–8 | Reveal | Brand + "Structured data from any document — checked against the source." Pipeline rail draws in, then flies to the top as the app window rises |
| 3 | 8–15 | 01 Define a schema | New schema "Syllabus", three fields typed in on beats, click Save → "Schema saved." |
| 4 | 15–20 | 02 Upload a file | Schema select = Syllabus, PDF dragged onto drop zone ("Drop to add"), queue item Uploading → Uploaded |
| 5 | 20–31 | 03 Extract & review | Processing (scan sweep) → Extracted; fields + source quotes arrive; click key_dates quote → PDF highlight; accept ×3 → 3 of 3 reviewed → Reviewed |
| 6 | 31–41 | 04 Ask | Type question, send, cited answer reveals, citation chips, "2 SOURCES" expands |
| 7 | 41–45 | Outro | Brand, callback line, local-stack line, fade |

Poster: scene 5 at ~26s (quote highlighted on the PDF, fields visible).
