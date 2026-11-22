// 임시 자체 점검 (점검 후 삭제): 다이아 스킬 연속 사용 가격 상승
const L = require('./_lib');
const shop = require('./shop');
function call(h, tok, body) { return new Promise(r => { const req = { method: 'POST', headers: { authorization: 'Bearer ' + tok }, body, url: '/t' }; const res = { statusCode: 200, setHeader() { }, end(s) { r({ status: this.statusCode, j: JSON.parse(s || '{}') }) } }; h(req, res) }) }
module.exports = L.wrap(async (req, res) => {
  if ((req.query && req.query.key) !== process.env.SELFTEST_KEY) return L.json(res, 403, { error: 'no' });
  const out = {}; let id = null;
  try {
    const u = (await L.sql("INSERT INTO users(name,pass,salt,gems,last_login) VALUES($1,'x','x',200,now()) RETURNING id,name", ['zzP' + Date.now() % 100000]))[0]; id = u.id; const tok = L.makeToken(u);
    out.p0 = (await call(shop, tok, { action: 'gemPrice' })).j;
    const seq = [];
    for (let i = 0; i < 5; i++) { const a = await call(shop, tok, { action: 'gemSkill', skill: 'pillar' }); seq.push([a.status, a.j.price, a.j.user && a.j.user.gems, a.j.error]); }
    out.seq = seq;
    out.p1 = (await call(shop, tok, { action: 'gemPrice' })).j;
  } catch (e) { out.err = e.message }
  finally { if (id) await L.sql('DELETE FROM users WHERE id=$1', [id]); out.cleaned = (await L.sql('SELECT count(*) n FROM users WHERE id=$1', [id]))[0].n }
  return L.json(res, 200, out);
});
