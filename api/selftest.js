// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, A = 'zzr' + Math.floor(Math.random() * 1e6), steps = [];
  const call = async (path, method, data, tok) => { const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  const ok = (n, c, info) => steps.push({ step: n, ok: !!c, info });
  let uid;
  try {
    const reg = (await call('/api/auth', 'POST', { action: 'register', name: A, pass: 'test1234' })).j; const t = reg.token; uid = reg.user && reg.user.id;
    if (!uid) uid = (await L.sql('SELECT id FROM users WHERE name=$1', [A]))[0].id;
    let r = await call('/api/raid', 'GET', null, t); ok('지난주 기록 없으면 보상 없음', r.j.my && r.j.my.lastWeek === null && r.j.rankGems.top1 === 500);
    await L.sql('INSERT INTO raid_hits(user_id,week,damage) VALUES($1,$2,$3)', [uid, L.kstWeek(-1), 999999999999]);
    r = await call('/api/raid', 'GET', null, t); ok('지난주 1위 표시', r.j.my.lastWeek && r.j.my.lastWeek.rank === 1 && r.j.my.lastWeek.gems === 500, r.j.my.lastWeek);
    r = await call('/api/raid', 'POST', { action: 'claimRank' }, t); ok('순위 보상 수령', r.j.claimed === 500 && r.j.gems === 600, { claimed: r.j.claimed, gems: r.j.gems });
    r = await call('/api/raid', 'POST', { action: 'claimRank' }, t); ok('중복 수령 차단', r.status === 400, r.j.error);
    r = await call('/api/raid', 'POST', { action: 'hit', damage: 5000 }, t); ok('이번 주 내 순위', r.j.my.rank >= 1, r.j.my.rank);
  } finally { await L.sql('DELETE FROM users WHERE name=$1', [A]); steps.push({ step: '테스트 계정·기록 삭제', ok: true }) }
  const left = await L.sql('SELECT count(*) AS c FROM raid_hits WHERE user_id=$1', [uid || 0]);
  steps.push({ step: '테스트 기록 남지 않음', ok: Number(left[0].c) === 0 });
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
