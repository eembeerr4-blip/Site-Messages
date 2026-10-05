// D1's atomic conditional writes coordinate concurrent Function instances.
export function store(db) {
  return {
    get: (id) => db.prepare("SELECT payload_hash, status, updated_at FROM submissions WHERE request_id = ?").bind(id).first(),
    async claim(id, hash, now) {
      const inserted = await db.prepare("INSERT OR IGNORE INTO submissions (request_id, payload_hash, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)").bind(id, hash, now, now).run();
      if (inserted.meta.changes === 1) return true;
      const retried = await db.prepare("UPDATE submissions SET status = 'pending', updated_at = ? WHERE request_id = ? AND payload_hash = ? AND status = 'failed'").bind(now, id, hash).run();
      return retried.meta.changes === 1;
    },
    set: (id, status, now) => db.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE request_id = ? AND status = 'pending'").bind(status, now, id).run(),
    rate: (key, expires) => db.prepare("INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count").bind(key, expires).first(),
    cleanup: (now) => db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now).run()
  };
}
