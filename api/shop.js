const L = require('./_lib');
const RET = 'id,name,gems,owned,equip,items,crystal_pending,rep,bio';

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
    if (it.exclusive) return L.json(res, 400, { error: '무한 대전 ' + it.exclusive + '웨이브를 돌파하면 받는 보상이에요' });
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
  if (b.action === 'claimCrystal') {
    const r = await L.sql(`UPDATE users u SET crystal_pending=0 FROM (SELECT id, crystal_pending AS p FROM users WHERE id=$1 FOR UPDATE) o
      WHERE u.id=o.id AND o.p>0 RETURNING o.p AS amount, u.id,u.name,u.gems,u.owned,u.equip,u.items,u.crystal_pending,u.rep,u.bio`, [u.id]);
    if (!r[0]) return L.json(res, 200, { amount: 0, user: L.publicUser(u) });
    return L.json(res, 200, { amount: Number(r[0].amount), user: L.publicUser(r[0]) });
  }
  return L.json(res, 400, { error: 'action' });
});
