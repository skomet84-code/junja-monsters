// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, A = 'zzs' + Math.floor(Math.random() * 1e6), B = A + 'b', steps = [];
  const call = async (path, method, data, tok) => { const r = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  const ok = (n, c, info) => steps.push({ step: n, ok: !!c, info });
  try {
    const ta = (await call('/api/auth', 'POST', { action: 'register', name: A, pass: 'test1234' })).j.token;
    const tb = (await call('/api/auth', 'POST', { action: 'register', name: B, pass: 'test1234' })).j.token;
    let r = await call('/api/score', 'POST', { mode: 'stage', wave: 3, kills: 15 }, ta); ok('판 기록 등록', r.status === 200 && r.j.me && r.j.me.wave === 3, r.j.me);
    r = await call('/api/score', 'POST', { mode: 'stage', wave: 2, kills: 20 }, ta); ok('낮은 판은 기록 유지', r.j.me.wave === 3);
    r = await call('/api/score', 'POST', { mode: 'stage', wave: 3, kills: 99 }, ta); ok('비정상 값 차단', r.status === 400);
    r = await call('/api/score?mode=stage', 'GET', null, ta); ok('주간 판 랭킹 조회', r.j.top.some(t => t.name === A && t.wave === 3));
    r = await call('/api/profile?name=' + A, 'GET'); ok('프로필 이번 주 판', r.j.profile.weekBest === 3, r.j.profile.weekBest);
    r = await call('/api/duel', 'POST', { action: 'start', target: A }, tb); ok('대결 시작 (상대 3판)', r.j.target_wave === 3, r.j);
    const id = r.j.id;
    r = await call('/api/duel', 'POST', { action: 'finish', id, wave: 3 }, tb); ok('3판 클리어 → 승리', r.j.status === 'win' && r.j.reward === 15, r.j);
    r = await call('/api/duel', 'POST', { action: 'start', target: A }, tb);
    r = await call('/api/duel', 'POST', { action: 'finish', id: r.j.id, wave: 2 }, tb); ok('실패 → 패배', r.j.status === 'lose');
    r = await call('/api/score?mode=daily', 'GET', null, ta); ok('오늘의 도전 랭킹 정상', r.status === 200);
    r = await call('/api/score?mode=normal', 'GET', null, ta); ok('이전 무한 모드 랭킹 보존', r.status === 200, r.j.total);
  } finally { await L.sql('DELETE FROM users WHERE name=$1 OR name=$2', [A, B]); steps.push({ step: '테스트 계정 삭제', ok: true }) }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
