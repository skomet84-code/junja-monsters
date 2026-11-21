const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  const u = await L.auth(req);
  if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
  if (req.method === 'GET') {
    const r = await L.sql('SELECT meta,run,updated_at FROM saves WHERE user_id=$1', [u.id]);
    return L.json(res, 200, { save: r[0] || null, user: L.publicUser(u) });
  }
  if (req.method === 'POST') {
    const b = L.body(req);
    const meta = b.meta && typeof b.meta === 'object' ? b.meta : null;
    const run = b.run === null || typeof b.run === 'object' ? b.run : undefined;
    const size = JSON.stringify({ meta, run }).length;
    if (size > 60000) return L.json(res, 413, { error: '저장 데이터가 너무 커요' });
    // 데이터 보존: 서버에 저장된 기록보다 낮은 최고기록·도감으로 덮어쓰지 않도록 병합
    const cur = (await L.sql('SELECT meta FROM saves WHERE user_id=$1', [u.id]))[0];
    let m = meta;
    if (cur && cur.meta && m) {
      const c = cur.meta;
      m = Object.assign({}, c, m);
      m.best = Math.max(c.best || 0, meta.best || 0);
      m.stage = Math.max(c.stage || 0, meta.stage || 0);
      m.dex = Object.assign({}, c.dex || {}, meta.dex || {});
      m.fuse = Object.assign({}, c.fuse || {}, meta.fuse || {});
      m.ach = Object.assign({}, c.ach || {}, meta.ach || {});
      m.tri = Object.assign({}, c.tri || {}, meta.tri || {});
      m.myth = Object.assign({}, c.myth || {}, meta.myth || {});
      m.god = Math.max(c.god || 0, meta.god || 0);
    }
    if (run === undefined) await L.sql('INSERT INTO saves(user_id,meta,updated_at) VALUES($1,$2,now()) ON CONFLICT(user_id) DO UPDATE SET meta=$2,updated_at=now()', [u.id, JSON.stringify(m)]);
    else await L.sql('INSERT INTO saves(user_id,meta,run,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(user_id) DO UPDATE SET meta=$2,run=$3,updated_at=now()', [u.id, JSON.stringify(m), JSON.stringify(run)]);
    return L.json(res, 200, { ok: true });
  }
  return L.json(res, 405, { error: 'method' });
});
