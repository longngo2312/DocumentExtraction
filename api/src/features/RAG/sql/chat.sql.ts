export const CHAT_SQL = {
  insertSession: `INSERT INTO chat_sessions (title) VALUES (?);`,

  insertMessage: `
        INSERT INTO chat_messages (session_id, role, content, citations_json, ungrounded)
        VALUES (?, ?, ?, ?, ?);
    `,

  touchSession: `UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?;`,

  getSession: `SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ?;`,

  listSessions: `
        SELECT s.id, s.title, s.updated_at, COUNT(m.id) AS message_count
          FROM chat_sessions s
          LEFT JOIN chat_messages m ON m.session_id = s.id
         GROUP BY s.id
         ORDER BY s.updated_at DESC, s.id DESC
         LIMIT ?;
    `,

  getMessages: `
        SELECT id, role, content, citations_json, ungrounded, created_at
          FROM chat_messages WHERE session_id = ? ORDER BY id;
    `,

  // The newest turns, newest first — the caller reverses them.
  recentMessages: `
        SELECT role, content FROM chat_messages
         WHERE session_id = ? ORDER BY id DESC LIMIT ?;
    `,

  deleteSession: `DELETE FROM chat_sessions WHERE id = ?;`,
};
