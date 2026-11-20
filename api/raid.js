// 협동 레이드: 모든 플레이어가 함께 깎는 주간 월드 보스
const L = require('./_lib');
const BASE_HP = 50000000;          // 1단계 보스 체력 (단계마다 2배)
const DAILY_TRIES = 3, MAX_HIT = 400000000;
const NAMES = ['염옥의 대마왕', '심해의 리바이어던', '태고의 세계수', '뇌정의 신룡', '월식의 마녀왕', '대지의 거신', '빙하의 군주', '폭풍의 대붕', '타락한 성좌', '심연의 군주'];

function hpOf(level) { return BASE_HP * Math.pow(2, level - 1); }
function weekEl(week) { let h = 0; for (const c of week) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 10; }
function stateOf(total) {
  let level = 1, used = 0;
  while (total - used >= hpOf(level)) { used += hpOf(level); level++; }
  return { level, hpMax: hpOf(level), hpLeft: hpOf(level) - (total - used), killed: level - 1 };
}
function reward(level) { return 30 + level * 10; }

async function info(uid) {
  const week = L.kstWeek();
  const tot = Number((await L.sql('SELECT coalesce(sum(damage),0) AS t FROM raid_hits WHERE week=$1', [week]))[0].t);
  const st = stateOf(tot);
  const top = await L.sql(`SELECT u.name, u.rep, sum(r.damage) AS dmg, count(*) AS tries FROM raid_hits r JOIN users u ON u.id=r.user_id
    WHERE r.week=$1 AND NOT u.banned GROUP BY u.id ORDER BY dmg DESC LIMIT 20`, [week]);
  const el = weekEl(week);
  const out = { week, element: el, name: NAMES[el], total: tot, ...st, players: top.length, top: top.map((t, i) => ({ rank: i + 1, name: t.name, rep: t.rep, damage: Number(t.dmg), tries: t.tries })) };
  if (uid) {
    const my = (await L.sql(`SELECT coalesce(sum(damage),0) AS d, count(*) FILTER (WHERE created_at > date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS today FROM raid_hits WHERE week=$1 AND user_id=$2`, [week, uid]))[0];
    const claimed = (await L.sql('SELECT level FROM raid_claims WHERE user_id=$1 AND week=$2', [uid, week])).map(r => r.level);
    const can = [];
    if (Number(my.d) > 0) for (let lv = 1; lv <= st.killed; lv++) if (!claimed.includes(lv)) can.push(lv);
    out.my = { damage: Number(my.d), today: my.today, left: Math.max(0, DAILY_TRIES - my.today), claimable: can, claimGems: can.reduce((a, lv) => a + reward(lv), 0) };
  }
  return out;
}

module.exports = L.wrap(async (req, res) => {
  const u = await L.auth(req);
  if (req.method === 'GET') return L.json(res, 200, await info(u && u.id));
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
  const b = L.body(req);
  const week = L.kstWeek();
  if (b.action === 'hit') {
    const before = await info(u.id);
    if (before.my.left <= 0) return L.json(res, 400, { error: '오늘의 레이드 도전 횟수를 모두 썼어요 (하루 ' + DAILY_TRIES + '회)' });
    const dmg = Math.max(0, Math.min(MAX_HIT, Math.floor(Number(b.damage) || 0)));
    await L.sql('INSERT INTO raid_hits(user_id,week,damage) VALUES($1,$2,$3)', [u.id, week, dmg]);
    const after = await info(u.id);
    return L.json(res, 200, Object.assign(after, { hit: dmg, killedNow: after.killed - before.killed }));
  }
  if (b.action === 'claim') {
    const st = await info(u.id);
    let gems = 0;
    for (const lv of st.my.claimable) {
      const r = await L.sql('INSERT INTO raid_claims(user_id,week,level,gems) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING level', [u.id, week, lv, reward(lv)]);
      if (r[0]) gems += reward(lv);
    }
    let total = null;
    if (gems) total = await L.addGems(u.id, gems, '월드 보스 토벌 보상');
    return L.json(res, 200, Object.assign(await info(u.id), { claimed: gems, gems: total }));
  }
  return L.json(res, 400, { error: 'action' });
});
