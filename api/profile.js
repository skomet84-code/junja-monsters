const L = require('./_lib');

async function profileOf(name) {
  const u = (await L.sql('SELECT id,name,equip,rep,bio,created_at,banned FROM users WHERE lower(name)=lower($1)', [name]))[0];
  if (!u || u.banned) return null;
  const sv = (await L.sql('SELECT meta FROM saves WHERE user_id=$1', [u.id]))[0];
  const m = (sv && sv.meta) || {};
  const dex = m.dex || {};
  const week = (await L.sql("SELECT wave FROM scores WHERE user_id=$1 AND mode='stage' AND period=$2", [u.id, L.kstWeek()]))[0];
  const all = (await L.sql("SELECT coalesce(max(wave) FILTER (WHERE mode='stage'),0) AS w, coalesce(max(wave) FILTER (WHERE mode='normal'),0) AS ow, count(*) AS n FROM plays WHERE user_id=$1", [u.id]))[0];
  const d = (await L.sql(`SELECT
      count(*) FILTER (WHERE from_id=$1 AND status='win') AS wins,
      count(*) FILTER (WHERE from_id=$1 AND status='lose') AS losses,
      count(*) FILTER (WHERE to_id=$1 AND status='lose') AS defends
    FROM duels WHERE from_id=$1 OR to_id=$1`, [u.id]))[0];
  return {
    name: u.name, title: (u.equip || {}).title || null, aura: (u.equip || {}).aura || null, rep: u.rep || null, bio: u.bio || '',
    since: u.created_at, weekBest: week ? week.wave : 0, best: Math.max(all.w || 0, m.stage || 0), oldBest: Math.max(all.ow || 0, m.best || 0), plays: all.n,
    dex: Object.keys(dex).length, mythic: Object.keys(dex).filter(k => k.endsWith('_7')).length, awaken: Object.keys(dex).filter(k => k.endsWith('_6')).length,
    ach: Object.keys(m.ach || {}).length, duel: d
  };
}

module.exports = L.wrap(async (req, res) => {
  if (req.method === 'GET') {
    const name = String((req.query || {}).name || '');
    const p = await profileOf(name);
    if (!p) return L.json(res, 404, { error: '플레이어를 찾을 수 없어요' });
    return L.json(res, 200, { profile: p });
  }
  if (req.method === 'POST') {
    const u = await L.auth(req);
    if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
    const b = L.body(req);
    let rep = null;
    if (b.rep) {
      const e = Math.floor(Number(b.rep.e)), s = Math.floor(Number(b.rep.s)), f = b.rep.f == null ? null : Math.floor(Number(b.rep.f));
      if (!(e >= 0 && e <= 9 && s >= 1 && s <= 7) || (f != null && !(f >= 0 && f <= 9))) return L.json(res, 400, { error: '잘못된 몬스터예요' });
      const sv = (await L.sql('SELECT meta FROM saves WHERE user_id=$1', [u.id]))[0];
      const dex = (sv && sv.meta && sv.meta.dex) || {};
      if (!dex[e + '_' + s]) return L.json(res, 400, { error: '도감에 등록된 몬스터만 대표로 설정할 수 있어요' });
      rep = { e, s, f };
    }
    const bio = String(b.bio == null ? (u.bio || '') : b.bio).slice(0, 40);
    const r = await L.sql('UPDATE users SET rep=$2, bio=$3 WHERE id=$1 RETURNING id,name,gems,owned,equip,rep,bio,items,crystal_pending,att_day,last_daily_reward', [u.id, rep ? JSON.stringify(rep) : (b.rep === null ? null : (u.rep ? JSON.stringify(u.rep) : null)), bio]);
    return L.json(res, 200, { user: L.publicUser(r[0]) });
  }
  return L.json(res, 405, { error: 'method' });
});
