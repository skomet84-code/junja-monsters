// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, A = 'zzi' + Math.floor(Math.random() * 1e6), steps = [];
  const call = async (path, method, data, tok) => { const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  const ok = (n, c, info) => steps.push({ step: n, ok: !!c, info });
  try {
    const t = (await call('/api/auth', 'POST', { action: 'register', name: A, pass: 'test1234' })).j.token;
    let r = await call('/api/score', 'POST', { mode: 'normal', wave: 15, kills: 100 }, t); ok('15웨이브: 보상 없음', (r.j.milestones || []).length === 0);
    r = await call('/api/score', 'POST', { mode: 'normal', wave: 30, kills: 300 }, t); ok('30웨이브: 20·30 보상', (r.j.milestones || []).map(m => m.w).join() === '20,30' && r.j.gems === 230, { ms: r.j.milestones, gems: r.j.gems });
    r = await call('/api/score', 'POST', { mode: 'normal', wave: 30, kills: 300 }, t); ok('같은 보상 중복 지급 없음', (r.j.milestones || []).length === 0 && r.j.gems === 230);
    r = await call('/api/auth', 'GET', null, t); ok('칭호 보유', (r.j.user.owned || []).includes('title_inf30'));
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'aura_inf' }, t); ok('전용 오라 구매 차단', r.status === 400, r.j.error);
    r = await call('/api/score', 'POST', { mode: 'normal', wave: 52, kills: 600 }, t); ok('50웨이브: 오라 보상', (r.j.milestones || []).map(m => m.w).join() === '50' && r.j.gems === 330);
    r = await call('/api/shop', 'POST', { action: 'equip', slot: 'aura', item: 'aura_inf' }, t); ok('전용 오라 장착', r.j.user && r.j.user.equip.aura === 'aura_inf');
  } finally { await L.sql('DELETE FROM users WHERE name=$1', [A]); steps.push({ step: '테스트 계정 삭제', ok: true }) }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
