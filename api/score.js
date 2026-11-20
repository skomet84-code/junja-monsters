const L = require('./_lib');

function period(mode) { return mode === 'daily' ? L.kstDate() : L.kstWeek(); }

async function board(mode, per, uid) {
  const top = await L.sql(`SELECT s.wave,s.kills,u.name,u.equip,u.id FROM scores s JOIN users u ON u.id=s.user_id
    WHERE s.mode=$1 AND s.period=$2 AND NOT u.banned ORDER BY s.wave DESC,s.kills DESC,s.created_at ASC LIMIT 50`, [mode, per]);
  let me = null;
  if (uid) {
    const r = await L.sql(`SELECT wave,kills,(SELECT count(*)+1 FROM scores s2 JOIN users u2 ON u2.id=s2.user_id WHERE s2.mode=$1 AND s2.period=$2 AND NOT u2.banned
      AND (s2.wave>s.wave OR (s2.wave=s.wave AND s2.kills>s.kills))) AS rank FROM scores s WHERE s.mode=$1 AND s.period=$2 AND s.user_id=$3`, [mode, per, uid]);
    me = r[0] || null;
  }
  const total = (await L.sql('SELECT count(*) AS n FROM scores WHERE mode=$1 AND period=$2', [mode, per]))[0].n;
  return { mode, period: per, total, top: top.map((t, i) => ({ rank: i + 1, name: t.name, title: (t.equip || {}).title || null, wave: t.wave, kills: t.kills, me: t.id === uid })), me };
}

module.exports = L.wrap(async (req, res) => {
  const mode = (req.query && req.query.mode) || (L.body(req).mode) || 'normal';
  if (!['normal', 'daily'].includes(mode)) return L.json(res, 400, { error: 'mode' });
  if (req.method === 'GET') {
    const u = await L.auth(req);
    return L.json(res, 200, await board(mode, period(mode), u && u.id));
  }
  if (req.method === 'POST') {
    const u = await L.auth(req);
    if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
    const b = L.body(req);
    const wave = Math.floor(Number(b.wave)), kills = Math.floor(Number(b.kills) || 0);
    if (!(wave >= 0 && wave <= 300) || kills < 0 || kills > wave * 120 + 50) return L.json(res, 400, { error: '기록이 올바르지 않아요' });
    const per = period(mode);
    const prev = (await L.sql('SELECT wave,kills FROM scores WHERE user_id=$1 AND mode=$2 AND period=$3', [u.id, mode, per]))[0];
    await L.sql('INSERT INTO plays(user_id,mode,wave,kills) VALUES($1,$2,$3,$4)', [u.id, mode, wave, kills]);
    if (!prev || wave > prev.wave || (wave === prev.wave && kills > prev.kills))
      await L.sql('INSERT INTO scores(user_id,mode,period,wave,kills) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,mode,period) DO UPDATE SET wave=$4,kills=$5,created_at=now()', [u.id, mode, per, wave, kills]);
    let reward = 0;
    if (mode === 'daily' && !prev) { reward = Math.min(60, 10 + wave * 2); await L.addGems(u.id, reward, '오늘의 도전 보상'); }
    const bd = await board(mode, per, u.id);
    const gems = (await L.sql('SELECT gems FROM users WHERE id=$1', [u.id]))[0].gems;
    return L.json(res, 200, Object.assign(bd, { newBest: !prev || wave > prev.wave, reward, gems }));
  }
  return L.json(res, 405, { error: 'method' });
});
