export const QUEUE_SQLS = {
  claimJob: `
        UPDATE extraction_jobs
            SET status = 'running',
                attempts = attempts + 1, 
                started_at = datetime('now')
        WHERE id = (
            SELECT id FROM extraction_jobs 
                WHERE status = 'queued'
                ORDER BY id 
                LIMIT 1
        )
        RETURNING *;
    `,
  complete: `
        UPDATE extraction_jobs 
            SET status = 'done', error=NULL, finished_at = datetime('now')
        WHERE id = ?;
    `,

  fail: `
        UPDATE extraction_jobs 
            SET status = CASE WHEN ? = 0 AND attempts < max_attempts 
                                THEN 'queued' ELSE 'failed' END,
                error = ?, 
                finished_at = CASE WHEN ? = 0 AND attempts < max_attempts
                                THEN NULL ELSE datetime('now') END 
        WHERE id = ? 
        RETURNING status;
    `,

  resetStale: `
        UPDATE extraction_jobs SET status = 'queued', started_at = NULL
            WHERE status = 'running';
    `,
};
