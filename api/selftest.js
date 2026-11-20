// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, A = 'zzh' + Math.floor(Math.random() * 1e6), steps = [];
  const call = async (path, method, data, tok) => { const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  const ok = (n, c, info) => steps.push({ step: n, ok: !!c, info });
  try {
    const t = (await call('/api/auth', 'POST', { action: 'register', name: A, pass: 'test1234' })).j.token;
    let r = await call('/api/shop', 'GET', null, t); ok('상점 목록', r.j.items.length >= 50 && r.j.user.gems === 130, { n: r.j.items.length, gems: r.j.user.gems });
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'revive', qty: 2 }, t); ok('부활의 깃털 2개 구매', r.j.user.items.revive === 2 && r.j.user.gems === 10, r.j.user && { it: r.j.user.items, g: r.j.user.gems });
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'shield' }, t); ok('보석 부족 차단', r.status === 400, r.j.error);
    r = await call('/api/shop', 'POST', { action: 'use', items: ['revive', 'shield'] }, t); ok('아이템 사용 (보유한 것만)', r.j.used.length === 1 && r.j.used[0] === 'revive' && r.j.user.items.revive === 1, r.j.used);
    await L.addGems((await L.sql('SELECT id FROM users WHERE name=$1', [A]))[0].id, 500, '테스트');
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'cr_300' }, t); ok('연구 포인트 구매 대기', r.j.user.crystalPending === 300);
    r = await call('/api/shop', 'POST', { action: 'claimCrystal' }, t); ok('연구 포인트 수령', r.j.amount === 300 && r.j.user.crystalPending === 0);
    r = await call('/api/shop', 'POST', { action: 'claimCrystal' }, t); ok('중복 수령 차단', r.j.amount === 0);
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'skin_3_gold' }, t); ok('스킨 구매·장착', r.j.user.equip.skin_3 === 'skin_3_gold');
    r = await call('/api/shop', 'POST', { action: 'equip', slot: 'skin_3', item: null }, t); ok('스킨 해제', !r.j.user.equip.skin_3);
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'skin_3_gold' }, t); ok('중복 구매 차단', r.status === 400);
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'myth_call' }, t); ok('궁극 소환서 구매', r.j.user.items.myth_call === 1);
  } finally { await L.sql('DELETE FROM users WHERE name=$1', [A]); steps.push({ step: '테스트 계정 삭제', ok: true }) }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
