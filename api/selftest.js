// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, A = 'zzw' + Math.floor(Math.random() * 1e5), steps = [];
  const call = async (data, tok) => { const r = await fetch(base + '/api/auth', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(data) }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  try {
    let r = await call({ action: 'register', name: A, pass: '1234' }); steps.push({ step: '동의 없이 가입 차단', ok: r.status === 400, info: r.j.error });
    r = await call({ action: 'register', name: A, pass: '1234', agree: true }); const t = r.j.token; steps.push({ step: '동의 후 가입', ok: r.status === 200 });
    r = await call({ action: 'login', name: A, pass: '1234' }); steps.push({ step: '기존 회원 로그인(동의 불필요)', ok: r.status === 200 });
    await L.sql('INSERT INTO plays(user_id,mode,wave,kills) SELECT id,$2,3,10 FROM users WHERE name=$1', [A, 'normal']);
    r = await call({ action: 'withdraw', name: A, pass: '9999' }, t); steps.push({ step: '틀린 비밀번호 탈퇴 차단', ok: r.status === 401 });
    r = await call({ action: 'withdraw', name: A, pass: '1234' }, t); steps.push({ step: '탈퇴 성공', ok: r.status === 200 && r.j.ok });
    const left = await L.sql("SELECT (SELECT count(*) FROM users WHERE name=$1) AS u, (SELECT count(*) FROM plays p WHERE NOT EXISTS (SELECT 1 FROM users x WHERE x.id=p.user_id)) AS orphan", [A]);
    steps.push({ step: '계정·기록 모두 삭제', ok: Number(left[0].u) === 0 && Number(left[0].orphan) === 0, info: left[0] });
    const pg = await fetch(base + '/terms'); steps.push({ step: '/terms 페이지', ok: pg.status === 200 && (await pg.text()).includes('이용약관') });
    const pp = await fetch(base + '/privacy'); steps.push({ step: '/privacy 페이지', ok: pp.status === 200 });
  } finally { await L.sql('DELETE FROM users WHERE name=$1', [A]) }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
