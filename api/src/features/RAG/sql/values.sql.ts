/**
 * query_values is assembled from these fragments and nothing else. The model
 * chooses a column, an operator and a value; the server picks the matching
 * fragment and binds the value. No model-written text ever reaches SQL — and
 * constrained decoding is not a security boundary, so the choices are
 * re-validated in values.service.ts before any of this runs.
 */
/**
 * The value a field actually holds. coerce() stores dates only in value_date,
 * leaving value_text null, so anything reading value_text alone treats every
 * date as missing.
 */
const VALUE = `COALESCE(NULLIF(ev.value_text, ''), ev.value_date)`;

export const VALUES_SQL = {
  // Collapsed by name across schemas: two schemas with an "invoice_total"
  // column are one question from the user's side.
  listColumns: `
        SELECT name, MIN(data_type) AS data_type
          FROM schema_columns
         GROUP BY name COLLATE NOCASE
         ORDER BY name;
    `,

  // Only values a person has accepted or corrected. An unreviewed extraction
  // has not been checked by anyone, and an aggregate built on it would report
  // the model's guesses as counts.
  base: `
        SELECT ev.document_id, d.filename, sc.name AS column_name,
               ${VALUE} AS value_text,
               ev.llm_quote, ev.source_page, ev.source_start, ev.source_end,
               ev.source_boxes,
               COUNT(*) OVER () AS total
          FROM extracted_values ev
          JOIN schema_columns sc ON sc.id = ev.column_id
          JOIN documents d ON d.id = ev.document_id
         WHERE sc.name = ? COLLATE NOCASE
           AND ev.review_status IN ('accepted', 'edited')
           AND ${VALUE} IS NOT NULL
    `,

  predicate: {
    any: ``,
    eq: `AND lower(trim(${VALUE})) = lower(trim(?))`,
    contains: `AND ${VALUE} LIKE ? ESCAPE '\\'`,
    gt_number: `AND ev.value_number > ?`,
    gte_number: `AND ev.value_number >= ?`,
    lt_number: `AND ev.value_number < ?`,
    lte_number: `AND ev.value_number <= ?`,
    // ISO dates compare correctly as strings.
    gt_date: `AND ev.value_date > ?`,
    gte_date: `AND ev.value_date >= ?`,
    lt_date: `AND ev.value_date < ?`,
    lte_date: `AND ev.value_date <= ?`,
  },

  scopeDocument: `AND ev.document_id = ?`,

  tail: `ORDER BY d.uploaded_at DESC, d.id DESC LIMIT ?;`,
} as const;
