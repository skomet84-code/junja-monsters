// 대결: 상대의 이번 주 최고기록(없으면 역대 최고)을 목표로 한 판 도전
const L = require('./_lib');
const WIN_GEMS = 15, DAILY_REWARD_LIMIT = 3;

module.exports = L.wrap(async (req, res) => {
  const u = await L.auth(req);
  if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
  if (req.method === 'GET') {
    const rows = await L.sql(`SELECT d.id,d.target_wave,d.my_wave,d.status,d.created_at,d.finished_at,
        f.name AS from_name, t.name AS to_name, (d.from_id=$1) AS mine
      FROM duels d JOIN users f ON f.id=d.from_id JOIN users t ON t.id=d.to_id
      WHERE (d.from_id=$1 OR d.to_id=$1) AND d.status<>'expired' ORDER BY d.id DESC LIMIT 20`, [u.id]);
    return L.json(res, 200, { duels: rows });
  }
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const b = L.body(req);
  if (b.action === 'start') {
    const t = (await L.sql('SELECT id,name,banned FROM users WHERE lower(name)=lower($1)', [String(b.target || '')]))[0];
    if (!t || t.banned) return L.json(res, 404, { error: '상대를 찾을 수 없어요' });
    if (t.id === u.id) return L.json(res, 400, { error: '자기 자신과는 대결할 수 없어요' });
    const wk = (await L.sql("SELECT wave FROM scores WHERE user_id=$1 AND mode='stage' AND period=$2", [t.id, L.kstWeek()]))[0];
    const all = (await L.sql("SELECT coalesce(max(wave),0) AS w FROM plays WHERE user_id=$1 AND mode='stage'", [t.id]))[0];
    const target = wk ? wk.wave : all.w;
    if (!target) return L.json(res, 400, { error: '상대가 아직 판을 클리어한 기록이 없어요' });
    await L.sql("UPDATE duels SET status='expired' WHERE from_id=$1 AND status='open'", [u.id]);
    const d = (await L.sql('INSERT INTO duels(from_id,to_id,target_wave) VALUES($1,$2,$3) RETURNING id,target_wave', [u.id, t.id, target]))[0];
    return L.json(res, 200, { id: d.id, target: t.name, target_wave: d.target_wave });
  }
  if (b.action === 'finish') {
    const wave = Math.floor(Number(b.wave));
    if (!(wave >= 0 && wave <= 300)) return L.json(res, 400, { error: '기록이 올바르지 않아요' });
    const d = (await L.sql(`SELECT d.id,d.target_wave,t.name AS to_name FROM duels d JOIN users t ON t.id=d.to_id
      WHERE d.id=$1 AND d.from_id=$2 AND d.status='open' AND d.created_at > now() - interval '6 hours'`, [Number(b.id), u.id]))[0];
    if (!d) return L.json(res, 400, { error: '진행 중인 대결이 없어요' });
    const status = wave >= d.target_wave ? 'win' : 'lose';
    let reward = 0;
    if (status === 'win') {
      const n = (await L.sql("SELECT count(*) AS n FROM duels WHERE from_id=$1 AND rewarded>0 AND finished_at > now() - interval '1 day'", [u.id]))[0].n;
      if (n < DAILY_REWARD_LIMIT) reward = WIN_GEMS;
    }
    await L.sql('UPDATE duels SET my_wave=$2,status=$3,rewarded=$4,finished_at=now() WHERE id=$1', [d.id, wave, status, reward]);
    let gems = u.gems;
    if (reward) gems = await L.addGems(u.id, reward, '대결 승리: ' + d.to_name);
    return L.json(res, 200, { status, wave, target_wave: d.target_wave, target: d.to_name, reward, gems });
  }
  return L.json(res, 400, { error: 'action' });
});
