const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  const u = await L.auth(req);
  if (!u || !L.isAdmin(u)) return L.json(res, 403, { error: '관리자만 사용할 수 있어요' });
  const q = req.query || {};
  if (req.method === 'GET') {
    if (q.view === 'users') {
      const s = '%' + String(q.q || '') + '%';
      const rows = await L.sql(`SELECT u.id,u.name,u.gems,u.banned,u.created_at,u.last_login,u.owned,
        (SELECT max(wave) FROM scores WHERE user_id=u.id AND mode='stage') AS best,
        (SELECT count(*) FROM plays WHERE user_id=u.id) AS plays
        FROM users u WHERE u.name ILIKE $1 ORDER BY u.last_login DESC NULLS LAST LIMIT 100`, [s]);
      return L.json(res, 200, { users: rows });
    }
    if (q.view === 'user') {
      const id = Number(q.id);
      const info = (await L.sql('SELECT id,name,gems,banned,owned,equip,created_at,last_login FROM users WHERE id=$1', [id]))[0];
      const gems = await L.sql('SELECT amount,reason,created_at FROM gem_log WHERE user_id=$1 ORDER BY id DESC LIMIT 30', [id]);
      const plays = await L.sql('SELECT mode,wave,kills,created_at FROM plays WHERE user_id=$1 ORDER BY id DESC LIMIT 30', [id]);
      return L.json(res, 200, { info, gems, plays });
    }
    const today = L.kstDate(), week = L.kstWeek();
    const st = (await L.sql(`SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '1 day') AS new24,
      (SELECT count(*) FROM users WHERE last_login > now() - interval '1 day') AS active24,
      (SELECT count(*) FROM plays) AS plays,
      (SELECT count(*) FROM plays WHERE created_at > now() - interval '1 day') AS plays24,
      (SELECT coalesce(avg(wave),0) FROM plays WHERE created_at > now() - interval '7 day') AS avgwave7,
      (SELECT count(*) FROM purchases) AS purchases,
      (SELECT coalesce(sum(price),0) FROM purchases) AS gemsSpent,
      (SELECT coalesce(sum(gems),0) FROM users) AS gemsHeld`))[0];
    const weekTop = await L.sql(`SELECT u.name,s.wave,s.kills FROM scores s JOIN users u ON u.id=s.user_id WHERE s.mode='stage' AND s.period=$1 ORDER BY s.wave DESC,s.kills DESC LIMIT 10`, [week]);
    const dailyTop = await L.sql(`SELECT u.name,s.wave,s.kills FROM scores s JOIN users u ON u.id=s.user_id WHERE s.mode='daily' AND s.period=$1 ORDER BY s.wave DESC,s.kills DESC LIMIT 10`, [today]);
    const items = await L.sql('SELECT item,count(*) AS n FROM purchases GROUP BY item ORDER BY n DESC');
    return L.json(res, 200, { stats: st, week, today, weekTop, dailyTop, items });
  }
  if (req.method === 'POST') {
    const b = L.body(req); const id = Number(b.uid);
    if (b.action === 'gems') {
      const amt = Math.floor(Number(b.amount));
      if (!amt || Math.abs(amt) > 100000) return L.json(res, 400, { error: '수량을 확인해 주세요' });
      const g = await L.addGems(id, amt, '운영자 지급: ' + String(b.reason || '').slice(0, 60));
      return L.json(res, 200, { ok: true, gems: g });
    }
    if (b.action === 'ban') { await L.sql('UPDATE users SET banned=$2 WHERE id=$1', [id, !!b.banned]); return L.json(res, 200, { ok: true }); }
    if (b.action === 'resetpw') {
      const p = String(b.pass || '');
      if (p.length < 4) return L.json(res, 400, { error: '새 비밀번호는 4자 이상' });
      const salt = L.newSalt();
      await L.sql('UPDATE users SET pass=$2,salt=$3 WHERE id=$1', [id, L.hashPass(p, salt), salt]);
      return L.json(res, 200, { ok: true });
    }
    if (b.action === 'delscore') { await L.sql('DELETE FROM scores WHERE user_id=$1', [id]); return L.json(res, 200, { ok: true }); }
    return L.json(res, 400, { error: 'action' });
  }
  return L.json(res, 405, { error: 'method' });
});
