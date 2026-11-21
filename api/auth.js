const L = require('./_lib');

const NAME_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_.\- ]{2,12}$/;
function cleanName(v) { return String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim(); }
const SIGNUP_GEMS = 100, DAILY_GEMS = 30;

async function dailyReward(u) {
  const today = L.kstDate();
  if (u.last_daily_reward === today) return 0;
  const r = await L.sql('UPDATE users SET last_daily_reward=$2 WHERE id=$1 AND (last_daily_reward IS DISTINCT FROM $2) RETURNING id', [u.id, today]);
  if (!r[0]) return 0;
  u.gems = await L.addGems(u.id, DAILY_GEMS, '출석 보상');
  return DAILY_GEMS;
}

module.exports = L.wrap(async (req, res) => {
  if (req.method === 'GET') {
    const u = await L.auth(req);
    if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
    const reward = await dailyReward(u);
    return L.json(res, 200, { user: L.publicUser(u), reward });
  }
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const b = L.body(req);
  if (b.action === 'withdraw') {
    // 회원 탈퇴: 비밀번호 확인 후 계정과 모든 기록 삭제 (연결된 기록은 DB에서 함께 삭제됨)
    const u = await L.auth(req);
    if (!u) return L.json(res, 401, { error: '로그인이 필요해요' });
    const r = (await L.sql('SELECT pass,salt FROM users WHERE id=$1', [u.id]))[0];
    if (!r || L.hashPass(String(b.pass || ''), r.salt) !== r.pass) return L.json(res, 401, { error: '비밀번호가 맞지 않아요' });
    await L.sql('DELETE FROM users WHERE id=$1', [u.id]);
    return L.json(res, 200, { ok: true });
  }
  const name = cleanName(b.name), pass = String(b.pass || '');
  if (!NAME_RE.test(name)) return L.json(res, 400, { error: '닉네임은 2~12자로, 한글·영문·숫자와 _ . - 만 쓸 수 있어요 (이모지·특수문자 불가)' });
  if (pass.length < 4 || pass.length > 40) return L.json(res, 400, { error: '비밀번호는 4자 이상으로 입력해 주세요' });

  if (b.action === 'register') {
    if (!b.agree) return L.json(res, 400, { error: '이용약관·개인정보처리방침에 동의해 주세요' });
    const ex = await L.sql('SELECT id FROM users WHERE lower(name)=lower($1)', [name]);
    if (ex[0]) return L.json(res, 409, { error: '이미 사용 중인 닉네임이에요' });
    const salt = L.newSalt();
    const r = await L.sql('INSERT INTO users(name,pass,salt,gems,last_login) VALUES($1,$2,$3,0,now()) RETURNING id,name,gems,owned,equip,banned,last_daily_reward', [name, L.hashPass(pass, salt), salt]);
    const u = r[0];
    u.gems = await L.addGems(u.id, SIGNUP_GEMS, '가입 축하');
    const reward = await dailyReward(u);
    return L.json(res, 200, { token: L.makeToken(u), user: L.publicUser(u), reward: SIGNUP_GEMS + reward, isNew: true });
  }
  if (b.action === 'login') {
    const r = await L.sql('SELECT id,name,pass,salt,gems,owned,equip,banned,last_daily_reward FROM users WHERE lower(name)=lower($1)', [name]);
    const u = r[0];
    if (!u || L.hashPass(pass, u.salt) !== u.pass) return L.json(res, 401, { error: '닉네임 또는 비밀번호가 맞지 않아요' });
    if (u.banned) return L.json(res, 403, { error: '이용이 제한된 계정이에요. 운영자에게 문의해 주세요' });
    await L.sql('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
    const reward = await dailyReward(u);
    return L.json(res, 200, { token: L.makeToken(u), user: L.publicUser(u), reward });
  }
  return L.json(res, 400, { error: 'action' });
});
