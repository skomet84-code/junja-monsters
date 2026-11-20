// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host;
  const name = 'zzt' + Math.floor(Math.random() * 1e6);
  const steps = [];
  const call = async (path, method, data, tok) => {
    const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  };
  const ok = (n, cond, info) => steps.push({ step: n, ok: !!cond, info });
  try {
    let r = await call('/api/auth', 'POST', { action: 'register', name, pass: 'test1234' });
    ok('회원가입', r.status === 200 && r.j.token, { status: r.status, gems: r.j.user && r.j.user.gems, reward: r.j.reward });
    const tok = r.j.token;
    r = await call('/api/auth', 'POST', { action: 'register', name, pass: 'x1234' }); ok('중복 닉네임 거부', r.status === 409, r.status);
    r = await call('/api/auth', 'POST', { action: 'login', name, pass: 'wrong' }); ok('틀린 비밀번호 거부', r.status === 401, r.status);
    r = await call('/api/auth', 'POST', { action: 'login', name, pass: 'test1234' }); ok('로그인', r.status === 200 && r.j.token, r.status);
    r = await call('/api/save', 'POST', { meta: { best: 7, dex: { '0_1': 1 }, crystal: 5 }, run: { wave: 8, hp: 15 } }, tok); ok('저장', r.status === 200, r.status);
    r = await call('/api/save', 'POST', { meta: { best: 3, dex: { '1_1': 1 }, crystal: 9 } }, tok); ok('낮은 기록 덮어쓰기 저장', r.status === 200, r.status);
    r = await call('/api/save', 'GET', null, tok); ok('불러오기·기록 보존', r.j.save && r.j.save.meta.best === 7 && r.j.save.meta.dex['0_1'] && r.j.save.meta.dex['1_1'] && r.j.save.run.wave === 8, r.j.save);
    r = await call('/api/score', 'POST', { mode: 'normal', wave: 12, kills: 200 }, tok); ok('주간 점수 등록', r.status === 200 && r.j.me && r.j.me.wave === 12, { me: r.j.me, total: r.j.total });
    r = await call('/api/score', 'POST', { mode: 'normal', wave: 9, kills: 100 }, tok); ok('낮은 점수는 최고기록 유지', r.j.me && r.j.me.wave === 12, r.j.me);
    r = await call('/api/score', 'POST', { mode: 'daily', wave: 10, kills: 150 }, tok); ok('오늘의 도전 등록·보상', r.status === 200 && r.j.reward > 0, { reward: r.j.reward, gems: r.j.gems });
    r = await call('/api/score', 'POST', { mode: 'normal', wave: 9999, kills: 1 }, tok); ok('비정상 점수 거부', r.status === 400, r.status);
    r = await call('/api/score?mode=normal', 'GET', null, tok); ok('랭킹 조회', r.status === 200 && Array.isArray(r.j.top), { total: r.j.total, me: r.j.me });
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'title_tamer' }, tok); ok('상점 구매', r.status === 200 && r.j.user.owned.includes('title_tamer'), { gems: r.j.user && r.j.user.gems, err: r.j.error });
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'title_tamer' }, tok); ok('중복 구매 거부', r.status === 400, r.j.error);
    r = await call('/api/shop', 'POST', { action: 'buy', item: 'title_heaven' }, tok); ok('보석 부족 거부', r.status === 400, r.j.error);
    r = await call('/api/shop', 'POST', { action: 'equip', slot: 'title', item: null }, tok); ok('장착 해제', r.status === 200 && !r.j.user.equip.title, r.j.user && r.j.user.equip);
    r = await call('/api/admin', 'GET', null, tok); ok('일반 회원 관리자 접근 차단', r.status === 403, r.status);
  } finally {
    await L.sql('DELETE FROM users WHERE name=$1', [name]);
    steps.push({ step: '테스트 계정 삭제', ok: true });
  }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
