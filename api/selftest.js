// 임시 자체 점검 (점검 후 삭제): 다이아 전투 스킬 차감 확인
const L = require('./_lib');
const shop = require('./shop');
function call(h, tok, body) { return new Promise(r => { const req = { method: 'POST', headers: { authorization: 'Bearer ' + tok }, body, url: '/t' }; const res = { statusCode: 200, setHeader() { }, end(s) { r({ status: this.statusCode, j: JSON.parse(s || '{}') }) } }; h(req, res) }) }
module.exports = L.wrap(async (req, res) => {
  if ((req.query && req.query.key) !== process.env.SELFTEST_KEY) return L.json(res, 403, { error: 'no' });
  const out = {}; let id = null;
  try {
    const u = (await L.sql("INSERT INTO users(name,pass,salt,gems,last_login) VALUES($1,'x','x',20,now()) RETURNING id,name", ['zzG' + Date.now() % 100000]))[0]; id = u.id; const tok = L.makeToken(u);
    const a = await call(shop, tok, { action: 'gemSkill', skill: 'pillar' }); out.pillar = [a.status, a.j.user && a.j.user.gems];
    const b = await call(shop, tok, { action: 'gemSkill', skill: 'stop' }); out.stopNoGems = [b.status, b.j.error];
    const c = await call(shop, tok, { action: 'gemSkill', skill: 'pillar' }); out.pillar2 = [c.status, c.j.user && c.j.user.gems];
    const d = await call(shop, tok, { action: 'gemSkill', skill: 'pillar' }); out.zero = [d.status, d.j.error];
    const e = await call(shop, tok, { action: 'gemSkill', skill: 'nuke' }); out.bad = e.status;
    out.log = (await L.sql('SELECT amount,reason FROM gem_log WHERE user_id=$1 ORDER BY id', [id])).map(x => x.amount + ' ' + x.reason);
  } catch (e) { out.err = e.message }
  finally { if (id) await L.sql('DELETE FROM users WHERE id=$1', [id]); out.cleaned = (await L.sql('SELECT count(*) n FROM users WHERE id=$1', [id]))[0].n }
  return L.json(res, 200, out);
});
