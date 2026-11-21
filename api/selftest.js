// 배포 후 서버 점검용 (점검이 끝나면 삭제)
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  if (!process.env.SELFTEST_KEY || (req.query || {}).key !== process.env.SELFTEST_KEY) return L.json(res, 404, { error: 'not found' });
  const base = 'https://' + req.headers.host, rnd = Math.floor(Math.random() * 1e4), steps = [], made = [];
  const call = async (data) => { const r = await fetch(base + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return { status: r.status, j: await r.json().catch(() => ({})) } };
  try {
    for (const [n, want] of [['ㅋㅋz' + rnd, 200], ['z ' + rnd + ' x', 200], ['z.' + rnd, 200], ['😀z' + rnd, 400], ['z', 400]]) {
      const r = await call({ action: 'register', name: n, pass: '1234' }); if (r.status === 200) made.push(r.j.user.name);
      steps.push({ step: '가입 「' + n + '」', ok: r.status === want, info: r.j.error || r.j.user && r.j.user.name });
    }
    const r = await call({ action: 'login', name: 'Z   ' + rnd + ' X', pass: '1234' }); steps.push({ step: '띄어쓰기·대소문자 달라도 로그인', ok: r.status === 200, info: r.j.error });
    const d = await call({ action: 'register', name: 'z.' + rnd, pass: '1234' }); steps.push({ step: '중복 닉네임 안내', ok: d.status === 409, info: d.j.error });
  } finally { for (const n of made) await L.sql('DELETE FROM users WHERE name=$1', [n]); steps.push({ step: '테스트 계정 ' + made.length + '개 삭제', ok: true }) }
  return L.json(res, 200, { allOk: steps.every(s => s.ok), steps });
});
