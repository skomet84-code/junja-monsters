// 준자몬스터즈 서버 공용 모듈 (외부 패키지 없이 Neon HTTP SQL 사용)
const crypto = require('crypto');

const DB_URL = process.env.DATABASE_URL || '';
const SECRET = process.env.AUTH_SECRET || 'dev-secret';
const ADMINS = (process.env.ADMIN_NAMES || '').split(',').map(s => s.trim()).filter(Boolean);

function dbHost() { return new URL(DB_URL).hostname; }

// Postgres 타입 변환 (raw text 응답)
function conv(v, oid) {
  if (v === null || v === undefined) return null;
  switch (oid) {
    case 16: return v === 't' || v === true;
    case 20: case 21: case 23: case 700: case 701: case 1700: return Number(v);
    case 114: case 3802: return typeof v === 'string' ? JSON.parse(v) : v;
    default: return v;
  }
}
function rowsOf(r) {
  const f = r.fields || [];
  return (r.rows || []).map(row => {
    const o = {};
    for (const fd of f) o[fd.name] = conv(row[fd.name], fd.dataTypeID);
    return o;
  });
}
async function post(body) {
  const res = await fetch('https://' + dbHost() + '/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) { let m = txt; try { m = JSON.parse(txt).message || txt } catch (e) { } throw new Error('DB ' + res.status + ': ' + m); }
  return JSON.parse(txt);
}
async function sql(query, params = []) { return rowsOf(await post({ query, params })); }
// 여러 문장을 하나의 트랜잭션으로
async function tx(list) { const r = await post({ queries: list.map(([query, params]) => ({ query, params: params || [] })) }); return (r.results || []).map(rowsOf); }

function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }
function body(req) { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b) } catch (e) { b = {} } } return b || {}; }

function hashPass(pass, salt) { return crypto.scryptSync(String(pass), salt, 32).toString('hex'); }
function newSalt() { return crypto.randomBytes(16).toString('hex'); }
function b64u(s) { return Buffer.from(s).toString('base64url'); }
function sign(payload) { const p = b64u(JSON.stringify(payload)); const h = crypto.createHmac('sha256', SECRET).update(p).digest('base64url'); return p + '.' + h; }
function verify(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [p, h] = tok.split('.');
  const h2 = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (h.length !== h2.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(h2))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); if (o.exp && o.exp < Date.now()) return null; return o; } catch (e) { return null; }
}
function makeToken(u) { return sign({ uid: u.id, name: u.name, exp: Date.now() + 1000 * 60 * 60 * 24 * 60 }); }
async function auth(req) {
  const h = req.headers.authorization || '';
  const t = verify(h.replace(/^Bearer\s+/i, ''));
  if (!t) return null;
  const r = await sql('SELECT id,name,gems,owned,equip,banned,last_daily_reward,att_day,created_at,rep,bio,items,crystal_pending FROM users WHERE id=$1', [t.uid]);
  if (!r[0] || r[0].banned) return null;
  return r[0];
}
function isAdmin(u) { return !!u && ADMINS.includes(u.name); }

// 한국 시간 기준 날짜/주차
function kst() { return new Date(Date.now() + 9 * 3600 * 1000); }
function kstDate() { return kst().toISOString().slice(0, 10); }
function kstWeek(offsetWeeks) {
  const d = new Date(kst().getTime() + (offsetWeeks || 0) * 7 * 86400000); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
}

// 상점 아이템 (서버 기준 가격)
// 상점 상품 (서버 기준 가격). kind: cosmetic(장착) · skin(몬스터 스킨) · item(소모품) · crystal(연구 포인트)
const EL_NAMES = ['화염', '물', '자연', '전격', '달', '대지', '얼음', '바람', '별', '암흑'];
const SKINS = [{ v: 'gold', n: '황금', p: 180 }, { v: 'shadow', n: '그림자', p: 150 }, { v: 'crystal', n: '크리스탈', p: 150 }];
const ITEMS = [
  { id: 'aura_gold', kind: 'cosmetic', slot: 'aura', name: '황금 오라', desc: '모든 몬스터에 황금빛 오라', price: 300 },
  { id: 'aura_rainbow', kind: 'cosmetic', slot: 'aura', name: '무지개 오라', desc: '모든 몬스터에 무지갯빛 오라', price: 450 },
  { id: 'aura_abyss', kind: 'cosmetic', slot: 'aura', name: '심연 오라', desc: '보랏빛 심연의 기운', price: 400 },
  { id: 'aura_frost', kind: 'cosmetic', slot: 'aura', name: '서리 오라', desc: '푸른 얼음 결정의 기운', price: 350 },
  { id: 'theme_night', kind: 'cosmetic', slot: 'theme', name: '달밤의 숲', desc: '맵 테마: 푸른 달밤', price: 200 },
  { id: 'theme_sunset', kind: 'cosmetic', slot: 'theme', name: '황혼의 숲', desc: '맵 테마: 노을빛 황혼', price: 200 },
  { id: 'theme_sakura', kind: 'cosmetic', slot: 'theme', name: '벚꽃 정원', desc: '맵 테마: 분홍빛 정원', price: 250 },
  { id: 'theme_cosmos', kind: 'cosmetic', slot: 'theme', name: '우주 정원', desc: '맵 테마: 별이 흐르는 보랏빛 우주', price: 300 },
  { id: 'title_tamer', kind: 'cosmetic', slot: 'title', name: '몬스터 조련사', desc: '랭킹에 표시되는 칭호', price: 100 },
  { id: 'title_fusion', kind: 'cosmetic', slot: 'title', name: '융합의 대가', desc: '랭킹에 표시되는 칭호', price: 250 },
  { id: 'title_myth', kind: 'cosmetic', slot: 'title', name: '궁극의 지배자', desc: '랭킹에 표시되는 희귀 칭호', price: 500 },
  { id: 'title_inf30', kind: 'cosmetic', slot: 'title', name: '무한의 도전자', desc: '♾️ 무한 대전 30웨이브 돌파 보상', price: 0, exclusive: 30 },
  { id: 'aura_inf', kind: 'cosmetic', slot: 'aura', name: '무한의 고리', desc: '♾️ 무한 대전 50웨이브 돌파 보상 · 푸른 보랏빛 소용돌이 오라', price: 0, exclusive: 50 },
  { id: 'title_inf75', kind: 'cosmetic', slot: 'title', name: '불멸의 수호자', desc: '♾️ 무한 대전 75웨이브 돌파 보상', price: 0, exclusive: 75 },
  { id: 'title_inf100', kind: 'cosmetic', slot: 'title', name: '무한의 지배자', desc: '♾️ 무한 대전 100웨이브 돌파 보상 · 최고 칭호', price: 0, exclusive: 100 },
  { id: 'title_heaven', kind: 'cosmetic', slot: 'title', name: '하늘이내려준자', desc: '전설 칭호', price: 800 },
  ...EL_NAMES.flatMap((n, e) => SKINS.map(k => ({ id: 'skin_' + e + '_' + k.v, kind: 'skin', slot: 'skin_' + e, el: e, variant: k.v, name: k.n + ' ' + n + ' 스킨', desc: n + ' 속성 몬스터 전체가 ' + k.n + ' 색으로 바뀌어요', price: k.p }))),
  { id: 'boost_eth', kind: 'item', name: '에테르 부스터', desc: '이번 스테이지 시작 에테르 +50%', price: 30 },
  { id: 'shield', kind: 'item', name: '수호석 방패', desc: '이번 스테이지 시작 수호석 +5', price: 30 },
  { id: 'egg', kind: 'item', name: '황금 알', desc: '시작할 때 ★3 몬스터 1마리 지급 · [확률] 속성 10종 각 10% · 특성 100%: 용맹 24% · 신속 24% · 매의 눈 20% · 행운 16% · 집중 12% · 황금 4%', price: 40 },
  { id: 'bless', kind: 'item', name: '축복 두루마리', desc: '시작할 때 축복 카드 1장 선택', price: 30 },
  { id: 'myth_call', kind: 'item', name: '궁극 소환서', desc: '★7 궁극 몬스터 1마리를 3웨이브 동안 소환 (고유 스킬 사용, 합성·판매 불가) · [확률] 태극룡황·천둥거신·우주여제·생사의 군주·빙풍신조 각 20%', price: 120 },
  { id: 'revive', kind: 'item', name: '부활의 깃털', desc: '수호석이 0이 되면 수호석 10으로 부활 (스테이지당 1회)', price: 60 },
  { id: 'card_pack', kind: 'item', name: '🃏 카드 팩', desc: '속성 카드 10장 (무작위 · 같은 속성이 나오면 성장이 빨라져요)', price: 60 },
  { id: 'cr_100', kind: 'crystal', amount: 100, name: '💠 연구 포인트 100', desc: '연구소 영구 강화에 쓰는 준자 결정', price: 80 },
  { id: 'cr_300', kind: 'crystal', amount: 300, name: '💠 연구 포인트 300', desc: '+10% 보너스 포함 묶음', price: 220 },
  { id: 'cr_800', kind: 'crystal', amount: 800, name: '💠 연구 포인트 800', desc: '+25% 보너스 포함 대용량 묶음', price: 520 }
];

// 무한 대전 웨이브 돌파 보상 (한 판에서 도달한 웨이브 기준, 계정당 1회)
const INF_REWARDS = [
  { w: 20, gems: 50 },
  { w: 30, gems: 50, item: 'title_inf30' },
  { w: 50, gems: 100, item: 'aura_inf' },
  { w: 75, gems: 150, item: 'title_inf75' },
  { w: 100, gems: 300, item: 'title_inf100' }
];
function publicUser(u) { return { att: { day: u.att_day || 0, last: u.last_daily_reward || null, today: kstDate() }, id: u.id, name: u.name, gems: u.gems, owned: u.owned || [], equip: u.equip || {}, items: u.items || {}, crystalPending: u.crystal_pending || 0, rep: u.rep || null, bio: u.bio || '', admin: isAdmin(u) }; }

async function addGems(uid, amount, reason) {
  const r = await tx([
    ['UPDATE users SET gems=GREATEST(0,gems+$2) WHERE id=$1 RETURNING gems', [uid, amount]],
    ['INSERT INTO gem_log(user_id,amount,reason) VALUES($1,$2,$3)', [uid, amount, reason]]
  ]);
  return r[0][0] ? r[0][0].gems : null;
}

function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) { console.error('API error', req.url, e && e.message); json(res, 500, { error: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' }); }
  };
}

module.exports = { INF_REWARDS, sql, tx, json, body, hashPass, newSalt, makeToken, auth, isAdmin, kstDate, kstWeek, ITEMS, publicUser, addGems, wrap };
