const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  if (req.method === 'GET') {
    const u = await L.auth(req);
    return L.json(res, 200, { items: L.ITEMS, user: u ? L.publicUser(u) : null });
  }
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const u = await L.auth(req);
  if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
  const b = L.body(req);
  if (b.action === 'buy') {
    const it = L.ITEMS.find(x => x.id === b.item);
    if (!it) return L.json(res, 400, { error: '없는 아이템이에요' });
    if ((u.owned || []).includes(it.id)) return L.json(res, 400, { error: '이미 가지고 있어요' });
    // 보석 차감과 지급을 한 번에 (보석이 부족하거나 이미 보유하면 아무것도 바뀌지 않음)
    const r = await L.sql(`UPDATE users SET gems=gems-$2, owned=owned||jsonb_build_array($3::text), equip=jsonb_set(equip,ARRAY[$4::text],to_jsonb($3::text))
      WHERE id=$1 AND gems>=$2 AND NOT (owned ? $3) RETURNING id,name,gems,owned,equip`, [u.id, it.price, it.id, it.slot]);
    if (!r[0]) return L.json(res, 400, { error: '보석이 부족해요' });
    await L.sql('INSERT INTO purchases(user_id,item,price) VALUES($1,$2,$3)', [u.id, it.id, it.price]);
    await L.sql('INSERT INTO gem_log(user_id,amount,reason) VALUES($1,$2,$3)', [u.id, -it.price, '구매: ' + it.name]);
    return L.json(res, 200, { user: L.publicUser(r[0]), bought: it });
  }
  if (b.action === 'equip') {
    const slot = String(b.slot || '');
    if (!['aura', 'theme', 'title'].includes(slot)) return L.json(res, 400, { error: 'slot' });
    let r;
    if (!b.item) r = await L.sql('UPDATE users SET equip=equip-$2 WHERE id=$1 RETURNING id,name,gems,owned,equip', [u.id, slot]);
    else {
      const it = L.ITEMS.find(x => x.id === b.item && x.slot === slot);
      if (!it || !(u.owned || []).includes(it.id)) return L.json(res, 400, { error: '보유하지 않은 아이템이에요' });
      r = await L.sql('UPDATE users SET equip=jsonb_set(equip,ARRAY[$2::text],to_jsonb($3::text)) WHERE id=$1 RETURNING id,name,gems,owned,equip', [u.id, slot, it.id]);
    }
    return L.json(res, 200, { user: L.publicUser(r[0]) });
  }
  return L.json(res, 400, { error: 'action' });
});
