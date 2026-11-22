const L = require('./_lib');
const RET = 'id,name,gems,owned,equip,items,crystal_pending,rep,bio,att_day,last_daily_reward';

module.exports = L.wrap(async (req, res) => {
  if (req.method === 'GET') {
    const u = await L.auth(req);
    return L.json(res, 200, { items: L.ITEMS, user: u ? L.publicUser(u) : null });
  }
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const u = await L.auth(req);
  if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
  const b = L.body(req);
  const log = async (it, price) => {
    await L.sql('INSERT INTO purchases(user_id,item,price) VALUES($1,$2,$3)', [u.id, it.id, price]);
    await L.sql('INSERT INTO gem_log(user_id,amount,reason) VALUES($1,$2,$3)', [u.id, -price, '구매: ' + it.name]);
  };
  if (b.action === 'buy') {
    const it = L.ITEMS.find(x => x.id === b.item);
    if (!it) return L.json(res, 400, { error: '없는 상품이에요' });
    if (it.exclusive) return L.json(res, 400, { error: it.exclusive === 'pass' ? '시즌 패스 30단계 보상이에요' : '무한 대전 ' + it.exclusive + '웨이브를 돌파하면 받는 보상이에요' });
    if (it.kind === 'pass') {
      const pid = 'pass_' + L.kstSeason();
      const r = await L.sql(`UPDATE users SET gems=gems-$2::int, owned=owned||jsonb_build_array($3::text) WHERE id=$1 AND gems>=$2::int AND NOT (owned ? $3::text) RETURNING ${RET}`, [u.id, it.price, pid]);
      if (!r[0]) return L.json(res, 400, { error: (u.owned || []).includes(pid) ? '이번 시즌 패스를 이미 가지고 있어요' : '보석이 부족해요' });
      await log(it, it.price);
      return L.json(res, 200, { user: L.publicUser(r[0]), bought: it, qty: 1 });
    }
    const qty = it.kind === 'item' ? Math.max(1, Math.min(10, Math.floor(Number(b.qty) || 1))) : 1;
    const price = it.price * qty;
    let r;
    // 보석 차감과 지급을 한 문장으로 처리 (보석이 모자라면 아무것도 바뀌지 않음)
    if (it.kind === 'cosmetic' || it.kind === 'skin') {
      if ((u.owned || []).includes(it.id)) return L.json(res, 400, { error: '이미 가지고 있어요' });
      r = await L.sql(`UPDATE users SET gems=gems-$2, owned=owned||jsonb_build_array($3::text), equip=jsonb_set(equip,ARRAY[$4::text],to_jsonb($3::text))
        WHERE id=$1 AND gems>=$2 AND NOT (owned ? $3) RETURNING ${RET}`, [u.id, price, it.id, it.slot]);
    } else if (it.kind === 'item') {
      r = await L.sql(`UPDATE users SET gems=gems-$2::int, items=jsonb_set(items,ARRAY[$3::text],to_jsonb(coalesce((items->>$3::text)::int,0)+$4::int))
        WHERE id=$1 AND gems>=$2::int RETURNING ${RET}`, [u.id, price, it.id, qty]);
    } else if (it.kind === 'crystal') {
      r = await L.sql(`UPDATE users SET gems=gems-$2::int, crystal_pending=crystal_pending+$3::int WHERE id=$1 AND gems>=$2::int RETURNING ${RET}`, [u.id, price, it.amount]);
    }
    if (!r || !r[0]) return L.json(res, 400, { error: '보석이 부족해요' });
    await log(it, price);
    return L.json(res, 200, { user: L.publicUser(r[0]), bought: it, qty });
  }
  if (b.action === 'equip') {
    const slot = String(b.slot || '');
    if (!['aura', 'theme', 'title'].includes(slot) && !/^skin_[0-9]$/.test(slot)) return L.json(res, 400, { error: 'slot' });
    let r;
    if (!b.item) r = await L.sql(`UPDATE users SET equip=equip-$2 WHERE id=$1 RETURNING ${RET}`, [u.id, slot]);
    else {
      const it = L.ITEMS.find(x => x.id === b.item && x.slot === slot);
      if (!it || !(u.owned || []).includes(it.id)) return L.json(res, 400, { error: '보유하지 않은 아이템이에요' });
      r = await L.sql(`UPDATE users SET equip=jsonb_set(equip,ARRAY[$2::text],to_jsonb($3::text)) WHERE id=$1 RETURNING ${RET}`, [u.id, slot, it.id]);
    }
    return L.json(res, 200, { user: L.publicUser(r[0]) });
  }
  if (b.action === 'use') {
    // 소모품 사용: 보유한 것만 1개씩 차감
    const want = (Array.isArray(b.items) ? b.items : []).filter(id => L.ITEMS.some(x => x.id === id && x.kind === 'item')).slice(0, 6);
    const used = [];
    let last = null;
    for (const id of [...new Set(want)]) {
      const r = await L.sql(`UPDATE users SET items=jsonb_set(items,ARRAY[$2::text],to_jsonb((items->>$2::text)::int-1)) WHERE id=$1 AND coalesce((items->>$2::text)::int,0)>0 RETURNING ${RET}`, [u.id, id]);
      if (r[0]) { used.push(id); last = r[0]; }
    }
    const fresh = last || (await L.sql(`SELECT ${RET} FROM users WHERE id=$1`, [u.id]))[0];
    return L.json(res, 200, { used, user: L.publicUser(fresh) });
  }
  if (b.action === 'gemSkill') {
    // 전투 중 다이아 스킬: 보석 즉시 차감 (모자라면 아무것도 안 바뀜)
    const SK = { pillar: { price: 10, name: '💎 신의 빛기둥' }, stop: { price: 15, name: '💎 시간 정지' } };
    const sk = SK[b.skill];
    if (!sk) return L.json(res, 400, { error: 'skill' });
    const r = await L.sql(`UPDATE users SET gems=gems-$2::int WHERE id=$1 AND gems>=$2::int RETURNING ${RET}`, [u.id, sk.price]);
    if (!r[0]) return L.json(res, 400, { error: '보석이 부족해요' });
    await L.sql('INSERT INTO gem_log(user_id,amount,reason) VALUES($1,$2,$3)', [u.id, -sk.price, '전투 스킬: ' + sk.name]);
    return L.json(res, 200, { user: L.publicUser(r[0]), skill: b.skill });
  }
  if (b.action === 'passClaim') {
    // 시즌 패스 프리미엄 서버 보상: 3단계마다 카드 팩 1개, 30단계는 칭호 추가 (순서대로 한 번씩)
    const season = L.kstSeason(), pid = 'pass_' + season, key = 'pc_' + season;
    if (!(u.owned || []).includes(pid)) return L.json(res, 400, { error: '시즌 패스가 필요해요' });
    const tier = Math.floor(Number(b.tier) || 0);
    if (tier < 3 || tier > 30 || tier % 3) return L.json(res, 400, { error: 'tier' });
    const r = await L.sql(`UPDATE users SET items=jsonb_set(jsonb_set(items,ARRAY[$3::text],to_jsonb($2::int)),'{card_pack}',to_jsonb(coalesce((items->>'card_pack')::int,0)+1)) ${tier === 30 ? ",owned=CASE WHEN owned ? 'title_season' THEN owned ELSE owned||jsonb_build_array('title_season') END" : ''}
      WHERE id=$1 AND coalesce((items->>$3::text)::int,0) < $2::int RETURNING ${RET}`, [u.id, tier, key]);
    if (!r[0]) return L.json(res, 400, { error: '이미 받은 보상이에요' });
    return L.json(res, 200, { user: L.publicUser(r[0]), tier });
  }
  if (b.action === 'claimCrystal') {
    const r = await L.sql(`UPDATE users u SET crystal_pending=0 FROM (SELECT id, crystal_pending AS p FROM users WHERE id=$1 FOR UPDATE) o
      WHERE u.id=o.id AND o.p>0 RETURNING o.p AS amount, u.id,u.name,u.gems,u.owned,u.equip,u.items,u.crystal_pending,u.rep,u.bio,u.att_day,u.last_daily_reward`, [u.id]);
    if (!r[0]) return L.json(res, 200, { amount: 0, user: L.publicUser(u) });
    return L.json(res, 200, { amount: Number(r[0].amount), user: L.publicUser(r[0]) });
  }
  return L.json(res, 400, { error: 'action' });
});
