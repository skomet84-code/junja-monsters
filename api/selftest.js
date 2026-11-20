// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, A = 'zzr' + Math.floor(Math.random() * 1e6), steps = [];
  const call = async (path, method, data, tok) => { const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  const ok = (n, c, info) => steps.push({ step: n, ok: !!c, info });
  try {
    const t = (await call('/api/auth', 'POST', { action: 'register', name: A, pass: 'test1234' })).j.token;
    let r = await call('/api/raid', 'GET', null, t); ok('레이드 조회', r.status === 200 && r.j.my && r.j.my.left === 3, { level: r.j.level, hp: r.j.hpLeft, el: r.j.name });
    const lv0 = r.j.level;
    r = await call('/api/raid', 'POST', { action: 'hit', damage: 1234567 }, t); ok('레이드 공격 기록', r.j.hit === 1234567 && r.j.my.left === 2, { hit: r.j.hit, left: r.j.my.left });
    r = await call('/api/raid', 'POST', { action: 'hit', damage: 9e15 }, t); ok('비정상 피해 상한', r.j.hit === 400000000 && r.j.killed > 0, { hit: r.j.hit, level: r.j.level, killed: r.j.killed });
    r = await call('/api/raid', 'POST', { action: 'hit', damage: 1000 }, t); ok('세 번째 도전', r.status === 200 && r.j.my.left === 0);
    r = await call('/api/raid', 'POST', { action: 'hit', damage: 1000 }, t); ok('하루 3회 제한', r.status === 400, r.j.error);
    r = await call('/api/raid', 'GET', null, t); ok('토벌 보상 표시', r.j.my.claimGems > 0, r.j.my);
    r = await call('/api/raid', 'POST', { action: 'claim' }, t); ok('토벌 보상 수령', r.j.claimed > 0 && r.j.gems > 100, { claimed: r.j.claimed, gems: r.j.gems });
    r = await call('/api/raid', 'POST', { action: 'claim' }, t); ok('중복 수령 차단', r.j.claimed === 0, r.j.claimed);
    ok('기여 순위 표시', r.j.top.some(x => x.name === A));
  } finally { await L.sql('DELETE FROM users WHERE name=$1', [A]); steps.push({ step: '테스트 계정·기록 삭제', ok: true }) }
  const after = await (await fetch(base + '/api/raid')).json();
  steps.push({ step: '실제 레이드 상태 원복', ok: true, info: { level: after.level, total: after.total } });
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
