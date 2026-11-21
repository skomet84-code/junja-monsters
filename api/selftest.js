// 임시 자체 점검 (점검 후 삭제): 테스트 계정 2개로 협동·시즌 패스·카드 팩·출석 흐름 확인 후 계정 삭제
const L = require('./_lib');
const coop = require('./coop');
const shop = require('./shop');
const authApi = require('./auth');

function call(h, tok, body, method) {
  return new Promise(resolve => {
    const req = { method: method || 'POST', headers: tok ? { authorization: 'Bearer ' + tok } : {}, body, url: '/t' };
    const res = { statusCode: 200, setHeader() { }, end(s) { resolve({ status: this.statusCode, j: JSON.parse(s || '{}') }); } };
    h(req, res);
  });
}

module.exports = L.wrap(async (req, res) => {
  if ((req.query && req.query.key) !== process.env.SELFTEST_KEY) return L.json(res, 403, { error: 'no' });
  const out = {}; const ids = [];
  try {
    const mk = async (n) => { const r = await L.sql("INSERT INTO users(name,pass,salt,gems,last_login) VALUES($1,'x','x',2000,now()) RETURNING id,name", [n]); ids.push(r[0].id); return { id: r[0].id, tok: L.makeToken(r[0]) }; };
    const a = await mk('zzT' + Date.now() % 100000), b = await mk('zzU' + Date.now() % 100000);
    // 출석 (어제 6일차 → 오늘 7일차)
    const y = new Date(Date.parse(L.kstDate() + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    await L.sql('UPDATE users SET last_daily_reward=$2, att_day=6 WHERE id=$1', [a.id, y]);
    const at = await call(authApi, a.tok, null, 'GET'); out.att = { reward: at.j.reward, day: at.j.user.att, packs: (at.j.user.items || {}).card_pack };
    const at2 = await call(authApi, a.tok, null, 'GET'); out.att2 = at2.j.reward;
    // 카드 팩 구매·사용
    const buy = await call(shop, a.tok, { action: 'buy', item: 'card_pack', qty: 1 }); out.buyPack = [buy.status, (buy.j.user || {}).items];
    const use = await call(shop, a.tok, { action: 'use', items: ['card_pack'] }); out.usePack = [use.status, use.j.used];
    // 시즌 패스
    const np = await call(shop, a.tok, { action: 'passClaim', tier: 3 }); out.claimNoPass = [np.status, np.j.error];
    const bp = await call(shop, a.tok, { action: 'buy', item: 'pass' }); out.buyPass = [bp.status, bp.j.user && bp.j.user.gems, (bp.j.user.owned || []).filter(x => /^pass_/.test(x))];
    const bp2 = await call(shop, a.tok, { action: 'buy', item: 'pass' }); out.buyPass2 = [bp2.status, bp2.j.error];
    const c3 = await call(shop, a.tok, { action: 'passClaim', tier: 3 }); out.c3 = [c3.status, (c3.j.user || {}).items];
    const c3b = await call(shop, a.tok, { action: 'passClaim', tier: 3 }); out.c3again = [c3b.status, c3b.j.error];
    const c30 = await call(shop, a.tok, { action: 'passClaim', tier: 30 }); out.c30 = [c30.status, ((c30.j.user || {}).owned || []).includes('title_season')];
    const c5 = await call(shop, a.tok, { action: 'passClaim', tier: 5 }); out.c5bad = c5.status;
    // 협동
    const cr = await call(coop, a.tok, { action: 'create', stage: 4 }); out.create = cr.j;
    const code = cr.j.code;
    const st0 = await call(coop, a.tok, { action: 'start', code }); out.startNoGuest = st0.j.error;
    const jn = await call(coop, b.tok, { action: 'join', code }); out.join = jn.j.role;
    const jn2 = await call(coop, b.tok, { action: 'join', code: '000001' }); out.badJoin = jn2.status;
    const syA = await call(coop, a.tok, { action: 'sync', code }); out.hostSeesGuest = syA.j.partnerName;
    const st = await call(coop, a.tok, { action: 'start', code }); out.start = st.j.ok;
    const sB = await call(coop, b.tok, { action: 'sync', code, st: { wave: 2, hp: 18, kills: 30 } }); out.guestStatus = sB.j.status;
    await call(coop, a.tok, { action: 'send', code, type: 'energy' });
    await call(coop, a.tok, { action: 'send', code, type: 'revive' });
    const sB2 = await call(coop, b.tok, { action: 'sync', code, st: { wave: 3, hp: 10, kills: 50 } }); out.inbox = sB2.j.inbox;
    const sB3 = await call(coop, b.tok, { action: 'sync', code }); out.inboxEmpty = sB3.j.inbox.length;
    const sA = await call(coop, a.tok, { action: 'sync', code, st: { wave: 3, hp: 20, kills: 40 } }); out.hostSeesPartner = sA.j.partner;
    const fA = await call(coop, a.tok, { action: 'finish', code, cleared: true }); out.finA = fA.j;
    const fB = await call(coop, b.tok, { action: 'finish', code, cleared: true }); out.finB = fB.j;
    const fA2 = await call(coop, a.tok, { action: 'finish', code, cleared: true }); out.finA2 = fA2.j.gems;
    const fA3 = await call(coop, a.tok, { action: 'finish', code, cleared: true }); out.finA3 = fA3.j.gems;
    const out3 = await call(coop, null, { action: 'sync', code }); out.noAuth = out3.status;
  } catch (e) { out.err = e.message; }
  finally {
    for (const id of ids) { try { await L.sql('DELETE FROM coop_rooms WHERE host=$1 OR guest=$1', [id]); await L.sql('DELETE FROM users WHERE id=$1', [id]); } catch (e) { out.delErr = e.message; } }
    out.cleaned = (await L.sql('SELECT count(*) AS n FROM users WHERE id = ANY($1::int[])', [ids]))[0].n;
  }
  return L.json(res, 200, out);
});
