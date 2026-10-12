export const EXTRACTED_VALUES_SQL = {
  // 18 placeholders. Count them against the bind list in extraction.service.ts
  // before changing either: better-sqlite3 throws on arity mismatch inside the
  // worker's catch, where it surfaces as a generic document failure rather than
  // as the off-by-one it is.
  upsert: `
        INSERT INTO extracted_values (
            document_id, column_id, llm_value, llm_quote,
            llm_confidence, llm_reasoning, basis, support,
            value_text, value_number, value_date,
            source_page, source_start, source_end,
            source_span_ids, source_boxes,
            match_kind, confidence
        ) VALUES(?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?)
        ON CONFLICT(document_id, column_id) DO UPDATE SET
            llm_value    = excluded.llm_value,
            llm_quote    = excluded.llm_quote,
            llm_confidence = excluded.llm_confidence,
            llm_reasoning  = excluded.llm_reasoning,
            basis        = excluded.basis,
            -- Always the incoming NULL: grounding runs after this statement, so a
            -- verdict left from the previous extraction describes an answer that
            -- no longer exists. Same reasoning as review_status below.
            support      = excluded.support,
            value_text   = excluded.value_text,
            value_number = excluded.value_number,
            value_date   = excluded.value_date,
            source_page  = excluded.source_page,
            source_start = excluded.source_start,
            source_end   = excluded.source_end,
            source_span_ids = excluded.source_span_ids,
            source_boxes    = excluded.source_boxes,
            match_kind   = excluded.match_kind,
            confidence   = excluded.confidence,
            -- A re-extraction produces a brand new model answer, so any verdict
            -- a reviewer left on the previous one no longer applies to it.
            review_status = 'unreviewed',
            reviewed_at   = NULL;
    `,

  // Written by the grounding check, after the extraction transaction commits.
  setSupport: `
        UPDATE extracted_values SET support = ?
         WHERE document_id = ? AND column_id = ?;
    `,

  getByDocument: `
        SELECT
            extracted_values.*,
            schema_columns.name AS column_name,
            schema_columns.data_type AS data_type,
            schema_columns.position AS position
        FROM extracted_values
        JOIN schema_columns ON schema_columns.id = extracted_values.column_id
        WHERE extracted_values.document_id = ?
        ORDER BY schema_columns.position;
    `,

  // Review payload: joined with column metadata the UI needs
  getForReview: `
        SELECT
            ev.column_id,
            sc.name,
            sc.data_type,
            sc.enum_options,
            ev.llm_value,
            ev.llm_quote,
            -- Three orthogonal signals, never blended in the UI:
            --   confidence     — does the quote exist?        (resolveQuote, deterministic)
            --   llm_confidence — does it support this answer? (the extracting model)
            --   support        — same question, asked of a    (grounding check)
            --                    model that never saw the document
            ev.llm_confidence,
            ev.llm_reasoning,
            ev.basis,
            ev.support,
            ev.value_text,
            ev.source_page,
            -- Offsets into pages_json[source_page-1].text, which is the exact
            -- string ReviewPage.text hands the client — so the text viewer can
            -- slice instead of searching.
            ev.source_start,
            ev.source_end,
            -- Normalized 0..1 rects, one per line, resolved server-side at
            -- extraction. Null for formats with no geometry (office, plain
            -- text), which is what sends the client down its search fallback.
            ev.source_boxes,
            ev.source_span_ids,
            ev.match_kind,
            ev.confidence,
            ev.review_status
        FROM extracted_values ev
        JOIN schema_columns sc ON sc.id = ev.column_id
        WHERE ev.document_id = ?
        ORDER BY sc.position;
    `,

  // Deliberately does not touch source_* or llm_*: after a human edits a value,
  // the stored quote and boxes still describe where the *model* looked, not
  // where the correction came from. Provenance survives a review save intact.
  updateReviewedValue: `
        UPDATE extracted_values
        SET value_text     = ?,
            value_number   = ?,
            value_date     = ?,
            review_status  = ?,
            reviewed_at    = datetime('now')
        WHERE document_id = ? AND column_id = ?;
    `,
};
