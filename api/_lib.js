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
  const r = await sql('SELECT id,name,gems,owned,equip,banned,last_daily_reward,created_at FROM users WHERE id=$1', [t.uid]);
  if (!r[0] || r[0].banned) return null;
  return r[0];
}
function isAdmin(u) { return !!u && ADMINS.includes(u.name); }

// 한국 시간 기준 날짜/주차
function kst() { return new Date(Date.now() + 9 * 3600 * 1000); }
function kstDate() { return kst().toISOString().slice(0, 10); }
function kstWeek() {
  const d = kst(); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
}

// 상점 아이템 (서버 기준 가격)
const ITEMS = [
  { id: 'aura_gold', slot: 'aura', name: '황금 오라', desc: '모든 몬스터에 황금빛 오라', price: 300 },
  { id: 'aura_rainbow', slot: 'aura', name: '무지개 오라', desc: '모든 몬스터에 무지갯빛 오라', price: 450 },
  { id: 'aura_abyss', slot: 'aura', name: '심연 오라', desc: '보랏빛 심연의 기운', price: 400 },
  { id: 'theme_night', slot: 'theme', name: '달밤의 숲', desc: '맵 테마: 푸른 달밤', price: 200 },
  { id: 'theme_sunset', slot: 'theme', name: '황혼의 숲', desc: '맵 테마: 노을빛 황혼', price: 200 },
  { id: 'theme_sakura', slot: 'theme', name: '벚꽃 정원', desc: '맵 테마: 분홍빛 정원', price: 250 },
  { id: 'title_tamer', slot: 'title', name: '몬스터 조련사', desc: '랭킹에 표시되는 칭호', price: 100 },
  { id: 'title_fusion', slot: 'title', name: '융합의 대가', desc: '랭킹에 표시되는 칭호', price: 250 },
  { id: 'title_heaven', slot: 'title', name: '하늘이내려준자', desc: '전설 칭호', price: 800 }
];

function publicUser(u) { return { id: u.id, name: u.name, gems: u.gems, owned: u.owned || [], equip: u.equip || {}, admin: isAdmin(u) }; }

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

module.exports = { sql, tx, json, body, hashPass, newSalt, makeToken, auth, isAdmin, kstDate, kstWeek, ITEMS, publicUser, addGems, wrap };
