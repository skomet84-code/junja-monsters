// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host;
  const A = 'zza' + Math.floor(Math.random() * 1e6), B = 'zzb' + Math.floor(Math.random() * 1e6);
  const steps = [];
  const call = async (path, method, data, tok) => {
    const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  };
  const ok = (n, cond, info) => steps.push({ step: n, ok: !!cond, info });
  try {
    const ta = (await call('/api/auth', 'POST', { action: 'register', name: A, pass: 'test1234' })).j.token;
    const tb = (await call('/api/auth', 'POST', { action: 'register', name: B, pass: 'test1234' })).j.token;
    ok('두 계정 가입', ta && tb);
    let r = await call('/api/save', 'POST', { meta: { best: 20, dex: { '0_1': 1, '0_7': 1 }, ach: { evo2: 1 } } }, ta); ok('A 저장', r.status === 200);
    r = await call('/api/save', 'POST', { meta: { best: 15, dex: { '1_1': 1 }, ach: { w10: 1 } } }, ta);
    r = await call('/api/save', 'GET', null, ta); ok('업적·도감 병합 보존', r.j.save.meta.ach.evo2 && r.j.save.meta.ach.w10 && r.j.save.meta.dex['0_7'] && r.j.save.meta.best === 20, r.j.save.meta);
    r = await call('/api/profile', 'POST', { rep: { e: 0, s: 7, f: 1 }, bio: '안녕하세요' }, ta); ok('대표 몬스터(신수) 설정', r.status === 200 && r.j.user.rep && r.j.user.rep.s === 7, r.j.user && r.j.user.rep);
    r = await call('/api/profile', 'POST', { rep: { e: 5, s: 5 } }, ta); ok('도감에 없는 몬스터 거부', r.status === 400, r.j.error);
    await call('/api/score', 'POST', { mode: 'normal', wave: 20, kills: 300 }, ta);
    r = await call('/api/score?mode=normal', 'GET', null, tb); ok('랭킹에 대표 몬스터 표시', r.j.top.some(t => t.name === A && t.rep && t.rep.s === 7), r.j.top.slice(0, 3));
    r = await call('/api/profile?name=' + encodeURIComponent(A), 'GET'); ok('프로필 조회', r.status === 200 && r.j.profile.mythic === 1 && r.j.profile.weekBest === 20 && r.j.profile.bio === '안녕하세요', r.j.profile);
    r = await call('/api/duel', 'POST', { action: 'start', target: A }, tb); ok('대결 신청', r.status === 200 && r.j.target_wave === 20, r.j);
    const id = r.j.id;
    r = await call('/api/duel', 'POST', { action: 'start', target: B }, tb); ok('자기 자신 대결 거부', r.status === 400, r.j.error);
    r = await call('/api/duel', 'POST', { action: 'start', target: A }, tb); const id2 = r.j.id; ok('재신청 시 이전 대결 만료', id2 && id2 !== id);
    r = await call('/api/duel', 'POST', { action: 'finish', id, wave: 25 }, tb); ok('만료된 대결 결과 거부', r.status === 400, r.j.error);
    r = await call('/api/duel', 'POST', { action: 'finish', id: id2, wave: 25 }, tb); ok('대결 승리·보상', r.j.status === 'win' && r.j.reward === 15, r.j);
    r = await call('/api/duel', 'POST', { action: 'finish', id: id2, wave: 25 }, tb); ok('중복 결과 거부', r.status === 400, r.j.error);
    r = await call('/api/duel', 'GET', null, ta); ok('상대에게 대결 기록 표시', r.j.duels.some(d => !d.mine && d.status === 'win'), r.j.duels.length);
    r = await call('/api/profile?name=' + encodeURIComponent(B), 'GET'); ok('대결 전적 집계', r.j.profile.duel.wins === 1, r.j.profile.duel);
  } finally {
    await L.sql('DELETE FROM users WHERE name=$1 OR name=$2', [A, B]);
    steps.push({ step: '테스트 계정 삭제', ok: true });
  }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
