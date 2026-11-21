// 2인 협동 스테이지: 방 코드로 친구와 같은 스테이지를 동시에 플레이 (2초 간격 동기화)
const L = require('./_lib');
const CLEAR_GEMS = 20;

function pubState(s) {
  s = s || {};
  return { wave: s.wave | 0, hp: s.hp | 0, kills: s.kills | 0, alive: s.alive !== false, cleared: !!s.cleared, out: !!s.out, left: !!s.left, best: s.best || '', t: s.t || 0 };
}
function cleanState(x) {
  x = x || {};
  return { wave: Math.max(0, Math.min(99, x.wave | 0)), hp: Math.max(0, Math.min(999, x.hp | 0)), kills: Math.max(0, Math.min(1e7, x.kills | 0)), alive: x.alive !== false, cleared: !!x.cleared, out: !!x.out, best: String(x.best || '').slice(0, 40), t: Date.now() };
}

module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const u = await L.auth(req);
  if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
  const b = L.body(req);
  const code = String(b.code || '').replace(/\D/g, '').slice(0, 6);

  if (b.action === 'create') {
    const stage = Math.max(1, Math.min(300, Math.floor(Number(b.stage) || 1)));
    await L.sql("DELETE FROM coop_rooms WHERE (host=$1 AND status='wait') OR updated_at < now() - interval '3 hours'", [u.id]);
    for (let i = 0; i < 6; i++) {
      const c = String(100000 + Math.floor(Math.random() * 900000));
      const r = await L.sql('INSERT INTO coop_rooms(code,host,stage) VALUES($1,$2,$3) ON CONFLICT (code) DO NOTHING RETURNING code', [c, u.id, stage]);
      if (r[0]) return L.json(res, 200, { code: c, stage, role: 'host' });
    }
    return L.json(res, 500, { error: '방을 만들지 못했어요. 다시 시도해 주세요' });
  }

  const room = code ? (await L.sql('SELECT r.*, h.name AS hname, g.name AS gname FROM coop_rooms r JOIN users h ON h.id=r.host LEFT JOIN users g ON g.id=r.guest WHERE r.code=$1', [code]))[0] : null;
  if (!room) return L.json(res, 404, { error: '방을 찾을 수 없어요. 코드를 확인해 주세요' });
  const role = room.host === u.id ? 'host' : room.guest === u.id ? 'guest' : null;

  if (b.action === 'join') {
    if (role) return L.json(res, 200, { code, stage: room.stage, role, host: room.hname, guest: room.gname });
    if (room.status !== 'wait' || room.guest) return L.json(res, 400, { error: '이미 시작했거나 꽉 찬 방이에요' });
    const r = await L.sql("UPDATE coop_rooms SET guest=$2, status='ready', updated_at=now() WHERE code=$1 AND guest IS NULL AND status='wait' RETURNING code", [code, u.id]);
    if (!r[0]) return L.json(res, 400, { error: '이미 시작했거나 꽉 찬 방이에요' });
    return L.json(res, 200, { code, stage: room.stage, role: 'guest', host: room.hname, guest: u.name });
  }
  if (!role) return L.json(res, 403, { error: '이 방의 참가자가 아니에요' });
  const me = role === 'host' ? 'hs' : 'gs', other = role === 'host' ? 'gs' : 'hs';
  const mybox = role === 'host' ? 'hbox' : 'gbox', obox = role === 'host' ? 'gbox' : 'hbox';

  if (b.action === 'start') {
    if (role !== 'host') return L.json(res, 400, { error: '방장만 시작할 수 있어요' });
    if (!room.guest) return L.json(res, 400, { error: '친구가 아직 들어오지 않았어요' });
    await L.sql("UPDATE coop_rooms SET status='play', hs='{}', gs='{}', hbox='[]', gbox='[]', updated_at=now() WHERE code=$1", [code]);
    return L.json(res, 200, { ok: true });
  }
  if (b.action === 'sync') {
    const st = b.st ? cleanState(b.st) : null;
    // 내 상태 저장 + 내 우편함 비우기를 한 번에
    const r = await L.sql(`UPDATE coop_rooms SET ${st ? me + '=$2::jsonb,' : ''} ${mybox}='[]', updated_at=now() WHERE code=$1
      RETURNING (SELECT ${mybox} FROM coop_rooms WHERE code=$1) AS inbox, ${other} AS partner, status, guest`, st ? [code, JSON.stringify(st)] : [code]);
    const x = r[0] || {};
    return L.json(res, 200, { status: x.status, role, stage: room.stage, partnerName: role === 'host' ? room.gname : room.hname, partner: x.guest ? pubState(x.partner) : null, inbox: x.inbox || [] });
  }
  if (b.action === 'send') {
    const type = ['energy', 'revive', 'cheer'].includes(b.type) ? b.type : null;
    if (!type) return L.json(res, 400, { error: 'type' });
    await L.sql(`UPDATE coop_rooms SET ${obox}=(CASE WHEN jsonb_array_length(${obox})>=20 THEN ${obox} ELSE ${obox}||jsonb_build_array(jsonb_build_object('type',$2::text,'from',$3::text)) END), updated_at=now() WHERE code=$1`, [code, type, u.name]);
    return L.json(res, 200, { ok: true });
  }
  if (b.action === 'finish') {
    const st = cleanState(Object.assign({}, room[me], b.st || {}, { cleared: !!b.cleared, alive: !!b.cleared, out: !b.cleared }));
    const r = await L.sql(`UPDATE coop_rooms SET ${me}=$2::jsonb, updated_at=now() WHERE code=$1 RETURNING ${other} AS partner, paid`, [code, JSON.stringify(st)]);
    const p = pubState(r[0] && r[0].partner);
    let gems = 0;
    if (st.cleared && p.cleared && !(r[0].paid || []).includes(u.id)) {
      const ok = await L.sql('UPDATE coop_rooms SET paid=paid||to_jsonb($2::int) WHERE code=$1 AND NOT (paid @> to_jsonb($2::int)) RETURNING code', [code, u.id]);
      if (ok[0]) { await L.addGems(u.id, CLEAR_GEMS, '협동 스테이지 클리어'); gems = CLEAR_GEMS; }
    }
    return L.json(res, 200, { partner: p, gems });
  }
  if (b.action === 'leave') {
    if (role === 'host' && room.status === 'wait') await L.sql('DELETE FROM coop_rooms WHERE code=$1', [code]);
    else await L.sql(`UPDATE coop_rooms SET ${me}=${me}||'{"left":true}'::jsonb, updated_at=now() WHERE code=$1`, [code]);
    return L.json(res, 200, { ok: true });
  }
  return L.json(res, 400, { error: 'action' });
});
