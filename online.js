// 준자몬스터즈 온라인 기능: 로그인 · 서버 저장 · 랭킹 · 오늘의 도전 · 상점
'use strict';
(function () {
  const TK = 'jm_token';
  let USER = null, pushT = null, syncing = false;
  window.EQUIP = {};
  const $ = s => document.querySelector(s);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ITEM_NAME = {};

  async function api(path, method, data) {
    const tok = localStorage.getItem(TK);
    const r = await fetch(path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: data ? JSON.stringify(data) : undefined });
    let j = {}; try { j = await r.json() } catch (e) { }
    if (r.status === 401 && tok && path !== '/api/auth') { logout(true); }
    if (!r.ok) throw new Error(j.error || ('오류 ' + r.status));
    return j;
  }
  function setUser(u) {
    USER = u; window.EQUIP = (u && u.equip) || {};
    try { bgCache = null } catch (e) { }
    renderAcct();
  }
  function titleName(id) { return ITEM_NAME[id] || ''; }

  function renderAcct() {
    const A = $('#acct'); if (!A) return;
    if (USER) {
      const tt = USER.equip && USER.equip.title ? `<small style="color:#d08bff">「${esc(titleName(USER.equip.title))}」</small> ` : '';
      A.innerHTML = `<div class="who"><span>👤</span><div>${tt}<b>${esc(USER.name)}</b><br><small>💎 보석 ${USER.gems} · 기록은 서버에 자동 저장돼요</small></div><div class="sp"></div><button class="btn gold" id="bMyPf" style="font-size:12px">👤 프로필</button>${USER.admin ? '<a class="btn" href="/admin" style="text-decoration:none;font-size:12px">관리자</a>' : ''}<button class="btn" id="bOut" style="font-size:12px">로그아웃</button></div>`;
      $('#bOut').onclick = () => logout(); $('#bMyPf').onclick = () => openProfile(USER.name);
    } else {
      A.innerHTML = `<b>🔐 로그인하면</b> <small>기록이 서버에 저장되고 랭킹·상점을 쓸 수 있어요 (가입 선물 💎100)</small>
        <input id="inName" placeholder="닉네임 (2~12자)" maxlength="12" autocomplete="username">
        <input id="inPass" type="password" placeholder="비밀번호 (4자 이상)" maxlength="40" autocomplete="current-password">
        <div class="row" style="margin-top:4px"><button class="btn" id="bReg">회원가입</button><button class="btn gold" id="bLogin">로그인</button></div>
        <small>로그인 없이도 게스트로 플레이할 수 있어요</small>`;
      $('#bLogin').onclick = () => doAuth('login');
      $('#bReg').onclick = () => doAuth('register');
      $('#inPass').onkeydown = e => { if (e.key === 'Enter') doAuth('login') };
    }
  }
  async function doAuth(action) {
    const name = $('#inName').value.trim(), pass = $('#inPass').value;
    try {
      const j = await api('/api/auth', 'POST', { action, name, pass });
      localStorage.setItem(TK, j.token); setUser(j.user);
      await pull(); duelNews();
      toast(action === 'register' ? `🎉 가입 완료! 💎${j.reward} 선물` : (j.reward ? `👋 출석 보상 💎${j.reward}` : `👋 ${j.user.name}님 환영해요`));
    } catch (e) { toast('⚠️ ' + e.message) }
  }
  function logout(silent) {
    localStorage.removeItem(TK); setUser(null);
    if (!silent) toast('로그아웃했어요 (이 기기의 게스트 기록으로 플레이)');
  }
  // 서버 저장본 불러오기: 서버 기록이 있으면 서버 기준으로 합치고, 없으면 이 기기 기록을 올림
  async function pull() {
    syncing = true;
    try {
      const j = await api('/api/save');
      if (j.save && j.save.meta) {
        const sm = j.save.meta, lm = meta || {};
        meta = Object.assign({ best: 0, dex: {} }, sm, { best: Math.max(sm.best || 0, lm.best || 0), dex: Object.assign({}, lm.dex || {}, sm.dex || {}), fuse: Object.assign({}, lm.fuse || {}, sm.fuse || {}), ach: Object.assign({}, lm.ach || {}, sm.ach || {}) });
        try { localStorage.setItem(SAVE + '_meta', JSON.stringify(meta)) } catch (e) { }
        if (j.save.run) { try { localStorage.setItem(SAVE + '_run', JSON.stringify(j.save.run)) } catch (e) { } }
      }
      syncing = false;
      await push(true);
    } catch (e) { syncing = false }
    refreshTitle();
  }
  async function push(now) {
    if (!USER || syncing) return;
    clearTimeout(pushT);
    const go = async () => {
      let run = null; try { run = JSON.parse(localStorage.getItem(SAVE + '_run') || 'null') } catch (e) { }
      try { await api('/api/save', 'POST', { meta, run }) } catch (e) { }
    };
    if (now) return go();
    pushT = setTimeout(go, 2500);
  }
  window.onSave = () => push(false);
  window.addEventListener('pagehide', () => { if (USER) push(true) });

  function refreshTitle() {
    const has = !!localStorage.getItem(SAVE + '_run');
    const bc = $('#bCont'); if (bc) bc.style.display = has ? '' : 'none';
    const b = $('#best'); if (b) b.textContent = meta.best ? '🏆 최고 기록: WAVE ' + meta.best + ' 클리어' : '';
  }

  // 게임 종료 → 점수 등록
  window.onGameOver = async (wave, kills, mode) => {
    const T = $('#overTx');
    if (DUEL && mode === 'normal' && USER) finishDuel(wave);
    if (!USER) { T.insertAdjacentHTML('beforeend', '<br><small style="color:#9aa4c2">로그인하면 이 기록이 랭킹에 올라가요</small>'); return }
    T.insertAdjacentHTML('beforeend', '<br><small id="rkRes">랭킹 등록 중…</small>');
    try {
      const j = await api('/api/score', 'POST', { mode, wave, kills });
      USER.gems = j.gems; renderAcct();
      const el = $('#rkRes');
      if (el) el.innerHTML = `<b style="color:#ffd75a">${mode === 'daily' ? '📅 오늘의 도전' : '🏆 주간'} 랭킹 ${j.me ? j.me.rank + '위' : '-'}</b> / ${j.total}명` + (j.newBest ? ' · 신기록!' : '') + (j.reward ? `<br>💎 도전 보상 +${j.reward}` : '');
    } catch (e) { const el = $('#rkRes'); if (el) el.textContent = '랭킹 등록 실패: ' + e.message }
  };

  // 오늘의 도전: 날짜로 정해지는 같은 규칙 (모두 같은 조건)
  function seeded(seedStr) { let h = 2166136261; for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000 } }
  function kstDate() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) }
  function dailyRule() {
    const d = kstDate(), r = seeded('jm-' + d);
    const sh = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a };
    const perm = sh([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const allowed = sh([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 6).sort((a, b) => a - b);
    return { d, perm, allowed };
  }
  function startDaily() {
    const R = dailyRule();
    const s = newState(); s.mode = 'daily'; s.perm = R.perm; s.allowed = R.allowed; s.hp = 20; s.eth = 240; s.unlocked = BASE_SLOTS;
    begin(s); try { unlock('daily1') } catch (e) { }
    banner('📅 오늘의 도전 ' + R.d.slice(5), '사용 가능: ' + R.allowed.map(a => EMO[a]).join(' '), '#b9a2ff');
    setTimeout(() => offerCards(), 600);
  }

  // 랭킹
  let rkMode = 'normal';
  async function openRank(mode) {
    rkMode = mode || rkMode;
    document.querySelectorAll('[data-rk]').forEach(b => b.classList.toggle('on', b.dataset.rk === rkMode));
    $('#mRank').classList.add('on'); $('#rkList').innerHTML = '<p>불러오는 중…</p>'; $('#rkInfo').textContent = '';
    try {
      const j = await api('/api/score?mode=' + rkMode);
      $('#rkInfo').innerHTML = (rkMode === 'daily' ? '📅 ' + j.period + ' 오늘의 도전 · 모두 같은 조건 (속성 6종 제한)' : '🗓 ' + j.period + ' 주간 랭킹 (월요일 초기화)') + ` · 참가 ${j.total}명` + (j.me ? `<br><b style="color:#ffd75a">내 순위 ${j.me.rank}위 · WAVE ${j.me.wave}</b>` : (USER ? '' : '<br>로그인하면 내 순위가 표시돼요'));
      $('#rkList').innerHTML = j.top.length ? j.top.map((t, ix) => `<div class="rk${t.me ? ' me' : ''}" data-pf="${esc(t.name)}" data-ix="${ix}"><div class="n">${t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : t.rank}</div><div class="nm">${t.title ? `<small>「${esc(titleName(t.title))}」</small>` : ''}${esc(t.name)}</div><div class="w">WAVE ${t.wave}</div><small style="color:#9aa4c2;width:56px;text-align:right">${t.kills}마리</small></div>`).join('') : '<p>아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>';
      j.top.forEach((t, ix) => { const row = document.querySelector(`.rk[data-ix="${ix}"]`); if (!row) return; const slot = document.createElement('div'); slot.className = 'rkic'; if (t.rep) slot.appendChild(iconCanvas(t.rep.e, t.rep.s, 34, t.rep.f)); row.insertBefore(slot, row.children[1]); row.onclick = () => openProfile(t.name) });
    } catch (e) { $('#rkList').innerHTML = '<p>랭킹을 불러오지 못했어요: ' + esc(e.message) + '</p>' }
  }

  // 상점
  const PV = { aura_gold: 'radial-gradient(circle,#ffd75a,#7a5a05)', aura_rainbow: 'conic-gradient(#f55,#fd5,#5f5,#5df,#a5f,#f55)', aura_abyss: 'radial-gradient(circle,#d68bff,#2a0d45)', theme_night: 'linear-gradient(#1a2a5a,#0b1430)', theme_sunset: 'linear-gradient(#ff9a3e,#7a2a4a)', theme_sakura: 'linear-gradient(#ffc6e0,#c46a9a)', title_tamer: 'linear-gradient(#3a2a66,#1a1233)', title_fusion: 'linear-gradient(#5a2a96,#1a1233)', title_heaven: 'linear-gradient(#fff3c0,#d9a54e)' };
  async function openShop() {
    $('#mShop').classList.add('on'); $('#shList').innerHTML = '<p>불러오는 중…</p>';
    try {
      const j = await api('/api/shop');
      j.items.forEach(i => ITEM_NAME[i.id] = i.name);
      if (j.user) setUser(j.user);
      $('#shGems').textContent = USER ? USER.gems : '-';
      $('#shList').innerHTML = j.items.map(it => {
        const own = USER && USER.owned.includes(it.id), on = USER && USER.equip[it.slot] === it.id;
        const btn = !USER ? `<button class="btn" disabled>로그인 필요</button>` : own ? `<button class="btn ${on ? '' : 'gold'}" data-eq="${it.id}" data-slot="${it.slot}">${on ? '해제' : '장착'}</button>` : `<button class="btn gold" data-buy="${it.id}" ${USER.gems < it.price ? 'disabled' : ''}>💎 ${it.price}</button>`;
        return `<div class="shi"><div class="pv" style="background:${PV[it.id] || '#333'}"></div><div class="tx"><b>${esc(it.name)}${on ? ' ✅' : ''}</b><br>${esc(it.desc)}</div>${btn}</div>`;
      }).join('');
      document.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
        try { const r = await api('/api/shop', 'POST', { action: 'buy', item: b.dataset.buy }); setUser(r.user); snd(880, .2, 'triangle', .06, 1760); toast('🎁 ' + r.bought.name + ' 획득·장착!'); openShop() } catch (e) { toast('⚠️ ' + e.message) }
      });
      document.querySelectorAll('[data-eq]').forEach(b => b.onclick = async () => {
        const on = USER.equip[b.dataset.slot] === b.dataset.eq;
        try { const r = await api('/api/shop', 'POST', { action: 'equip', slot: b.dataset.slot, item: on ? null : b.dataset.eq }); setUser(r.user); openShop() } catch (e) { toast('⚠️ ' + e.message) }
      });
    } catch (e) { $('#shList').innerHTML = '<p>상점을 불러오지 못했어요: ' + esc(e.message) + '</p>' }
  }

  // ===== 프로필 · 대표 몬스터 · 대결 =====
  let DUEL = null;
  try { DUEL = JSON.parse(localStorage.getItem('jm_duel') || 'null') } catch (e) { }
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="mProf"><div class="card" style="text-align:center"><div id="pfBody"></div><div class="row"><button class="btn gold" data-close>닫기</button></div></div></div>`);
  document.head.insertAdjacentHTML('beforeend', `<style>
  .rkic{width:34px;height:34px;flex:none}.rkic canvas{width:34px;height:34px}.rk{cursor:pointer}
  .pfrep{width:150px;height:150px;margin:4px auto;border-radius:50%;display:grid;place-items:center;position:relative}
  .pfrep canvas{width:140px;height:140px}
  .pfrep.aura_gold{box-shadow:0 0 40px #ffd75a;background:radial-gradient(circle,#ffd75a55,transparent 70%)}
  .pfrep.aura_rainbow{box-shadow:0 0 40px #b9a2ff;background:conic-gradient(#f557,#fd57,#5f57,#5df7,#a5f7,#f557)}
  .pfrep.aura_abyss{box-shadow:0 0 40px #b04cff;background:radial-gradient(circle,#b04cff55,transparent 70%)}
  .pfst{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}.pfst div{background:#0d1222;border-radius:10px;padding:8px 4px;font-size:11px;color:#9aa4c2}.pfst b{display:block;font-size:17px;color:#ffd75a}
  .pick{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;max-height:240px;overflow:auto;margin:8px 0}.pick button{background:#0d1222;border:1px solid #ffffff1a;border-radius:10px;padding:2px}.pick canvas{width:100%;aspect-ratio:1}
  .dl{font-size:12.5px;text-align:left;background:#0d1222;border-radius:10px;padding:7px 10px;margin:4px 0}.dl b.w{color:#7dffb0}.dl b.l{color:#ff7a8a}
  #duelHud{position:absolute;right:10px;top:44px;background:#000b;border:1px solid #ff5c7a;border-radius:10px;padding:4px 8px;font-size:11.5px;font-weight:800;color:#ffb0bd;pointer-events:none;display:none}
  #combo{left:auto!important;right:12px;top:80px!important;text-align:right}
  </style>`);
  $('#stage').insertAdjacentHTML('beforeend', '<div id="duelHud"></div>');
  $('#mProf').querySelector('[data-close]').onclick = () => $('#mProf').classList.remove('on');

  async function openProfile(name) {
    const B = $('#pfBody'); $('#mProf').classList.add('on'); B.innerHTML = '<p>불러오는 중…</p>';
    try {
      const { profile: p } = await api('/api/profile?name=' + encodeURIComponent(name));
      const me = USER && USER.name.toLowerCase() === p.name.toLowerCase();
      const repName = p.rep ? monName({ e: p.rep.e, s: p.rep.s, f: p.rep.f }) : '대표 몬스터 없음';
      B.innerHTML = `${p.title ? `<div style="color:#d08bff;font-size:13px">「${esc(titleName(p.title))}」</div>` : ''}<h2 style="font-size:24px;margin:2px 0">${esc(p.name)}</h2>
        <div class="pfrep ${p.aura || ''}" id="pfRep"></div><div style="font-weight:800;color:#ffe3a1">${esc(repName)}${p.rep ? ' ' + (p.rep.s === 7 ? '👑' : p.rep.s === 6 ? '✦' : '★'.repeat(p.rep.s)) : ''}</div>
        ${p.bio ? `<p style="margin:6px 0">“${esc(p.bio)}”</p>` : ''}
        <div class="pfst"><div><b>${p.weekBest}</b>이번 주</div><div><b>${p.best}</b>역대 최고</div><div><b>${p.dex}</b>도감</div><div><b>${p.awaken}</b>✦각성</div><div><b>${p.mythic}</b>👑신수</div><div><b>${p.ach}</b>🎖업적</div></div>
        <div style="font-size:12.5px;color:#9aa4c2">⚔️ 대결 ${p.duel.wins}승 ${p.duel.losses}패 · 방어 성공 ${p.duel.defends}회</div>
        <div id="pfAct" style="margin-top:10px"></div>`;
      if (p.rep) $('#pfRep').appendChild(iconCanvas(p.rep.e, p.rep.s, 140, p.rep.f)); else $('#pfRep').innerHTML = '<div style="font-size:50px">❔</div>';
      const A = $('#pfAct');
      if (me) {
        A.innerHTML = `<div class="row"><button class="btn gold" id="pfPick">🐉 대표 몬스터 바꾸기</button></div>
          <div class="row"><input id="pfBio" maxlength="40" placeholder="한마디 (40자)" value="${esc(p.bio)}" style="flex:1;background:#151c2e;border:1px solid #ffffff1a;border-radius:9px;color:#fff;padding:9px;font-size:14px;user-select:text;-webkit-user-select:text"><button class="btn" id="pfSave">저장</button></div>
          <div id="pfPickBox"></div><h2 style="font-size:15px;margin-top:12px">⚔️ 내 대결 기록</h2><div id="pfDuels"><p>불러오는 중…</p></div>`;
        $('#pfSave').onclick = async () => { try { const r = await api('/api/profile', 'POST', { bio: $('#pfBio').value }); setUser(r.user); toast('저장했어요') } catch (e) { toast('⚠️ ' + e.message) } };
        $('#pfPick').onclick = () => repPicker();
        loadDuels();
      } else if (USER) {
        A.innerHTML = `<div class="row"><button class="btn daily" id="pfDuel">⚔️ 대결 신청 · 이 플레이어 기록 넘기기</button></div><p style="font-size:12px">상대의 이번 주 최고기록을 한 판에 넘기면 승리! (승리 시 💎15, 하루 3회)</p>`;
        $('#pfDuel').onclick = () => startDuel(p.name);
      } else A.innerHTML = '<p>로그인하면 대결을 신청할 수 있어요</p>';
    } catch (e) { B.innerHTML = '<p>프로필을 불러오지 못했어요: ' + esc(e.message) + '</p>' }
  }
  async function repPicker() {
    await push(true);
    const keys = Object.keys(meta.dex || {}).map(k => k.split('_').map(Number)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const box = $('#pfPickBox'); box.innerHTML = '<p>도감에 등록된 몬스터 중에서 골라요</p><div class="pick" id="pk"></div>';
    keys.forEach(([e, st]) => { const f = st === 7 ? (MYTH.find(r => r.a === e) || {}).b : null; const b = document.createElement('button'); b.appendChild(iconCanvas(e, st, 56, f)); b.onclick = async () => { try { const r = await api('/api/profile', 'POST', { rep: { e, s: st, f } }); setUser(r.user); toast('대표 몬스터를 바꿨어요'); openProfile(USER.name) } catch (er) { toast('⚠️ ' + er.message) } }; $('#pk').appendChild(b) });
  }
  async function loadDuels() {
    try {
      const j = await api('/api/duel');
      const lab = { win: '<b class="w">승리</b>', lose: '<b class="l">패배</b>', draw: '<b>무승부</b>', open: '진행 중' };
      $('#pfDuels').innerHTML = j.duels.length ? j.duels.map(d => d.mine ? `<div class="dl">⚔️ ${esc(d.to_name)}에게 도전 · 목표 W${d.target_wave} → 내 기록 ${d.my_wave ?? '-'} · ${lab[d.status]}</div>` : `<div class="dl">🛡 ${esc(d.from_name)}의 도전 · ${d.status === 'lose' ? '<b class="w">방어 성공</b>' : d.status === 'win' ? '<b class="l">방어 실패</b>' : lab[d.status]} (W${d.my_wave ?? '-'})</div>`).join('') : '<p>아직 대결 기록이 없어요. 랭킹에서 상대를 눌러 대결을 신청해 보세요!</p>';
    } catch (e) { $('#pfDuels').textContent = e.message }
  }
  async function startDuel(name) {
    try {
      const d = await api('/api/duel', 'POST', { action: 'start', target: name });
      DUEL = d; localStorage.setItem('jm_duel', JSON.stringify(d));
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('on'));
      begin(newState()); saveRun();
      banner('⚔️ 대결 시작!', d.target + '의 WAVE ' + d.target_wave + ' 넘기기', '#ff5c7a');
    } catch (e) { toast('⚠️ ' + e.message) }
  }
  async function finishDuel(wave) {
    const d = DUEL; DUEL = null; localStorage.removeItem('jm_duel');
    try {
      const r = await api('/api/duel', 'POST', { action: 'finish', id: d.id, wave });
      if (USER) { USER.gems = r.gems; renderAcct() }
      const T = $('#overTx'); T.insertAdjacentHTML('beforeend', `<br><b style="font-size:16px;color:${r.status === 'win' ? '#7dffb0' : '#ff7a8a'}">⚔️ 대결 ${r.status === 'win' ? '승리!' : r.status === 'draw' ? '무승부' : '패배'}</b> <small>${esc(r.target)} W${r.target_wave} vs 나 W${r.wave}${r.reward ? ' · 💎+' + r.reward : ''}</small>`);
    } catch (e) { }
  }
  setInterval(() => {
    const h = $('#duelHud'); if (!h) return;
    if (DUEL && S && S.mode !== 'daily' && !S.over) { const cleared = S.wave - 1; h.style.display = 'block'; h.textContent = cleared > DUEL.target_wave ? `⚔️ ${DUEL.target} 기록 돌파! (${cleared}/${DUEL.target_wave})` : `⚔️ vs ${DUEL.target} · ${cleared}/${DUEL.target_wave}`; if (cleared > DUEL.target_wave && !DUEL._b) { DUEL._b = 1; banner('⚔️ 대결 목표 돌파!', DUEL.target + '의 기록을 넘었어요', '#7dffb0') } }
    else h.style.display = 'none';
  }, 700);
  async function duelNews() {
    try {
      const j = await api('/api/duel'); const seen = +(localStorage.getItem('jm_duel_seen') || 0);
      const news = j.duels.filter(d => !d.mine && d.id > seen && (d.status === 'win' || d.status === 'lose'));
      if (j.duels.length) localStorage.setItem('jm_duel_seen', Math.max(seen, ...j.duels.map(d => d.id)));
      if (news.length) { const d = news[0]; setTimeout(() => toast(d.status === 'win' ? `⚔️ ${d.from_name}님이 대결에서 당신을 이겼어요! 설욕하러 가요` : `🛡 ${d.from_name}님의 도전을 막아냈어요!`), 1500) }
    } catch (e) { }
  }

  // ===== 새 버전 자동 적용 (웨이브 사이에만 새로고침 → 진행 상황은 저장된 상태) =====
  let newVer = null;
  async function checkVer() {
    try { const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j.v && typeof BUILD !== 'undefined' && j.v !== BUILD) newVer = j.v } catch (e) { }
  }
  setInterval(checkVer, 120000); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVer() }); setTimeout(checkVer, 5000);
  setInterval(() => {
    if (!newVer || !S) return;
    const safe = !S.running && !S.over && !evoOpen && !cardsOpen && (S.mode !== 'daily' || S.wave <= 1 || S.over);
    if (safe) { newVer = null; toast('✨ 새 버전으로 업데이트해요'); try { saveRun() } catch (e) { } setTimeout(() => location.reload(), 900) }
  }, 1500);
  const vt = $('#verTx'); if (vt && typeof BUILD !== 'undefined') vt.textContent = 'v' + BUILD.slice(2, 12);

  // ===== 협동 레이드: 월드 보스 =====
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="mRaid"><div class="card" style="text-align:center;background:linear-gradient(180deg,#3a1414,#120a14)"><div id="rdBody"></div><div class="row"><button class="btn gold" id="rdClose">닫기</button></div></div></div>`);
  document.head.insertAdjacentHTML('beforeend', `<style>.rdbar{height:16px;border-radius:8px;background:#000a;border:1px solid #ff7a4a88;overflow:hidden;margin:6px 0}.rdbar i{display:block;height:100%;background:linear-gradient(90deg,#ff2d55,#ff9a3e)}
  .rdrw{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 8px;background:linear-gradient(135deg,#2a1d0a,#1a1230);border:1px solid #ffd75a55;border-radius:12px;padding:8px;margin:8px 0;font-size:12px}.rdrw b{width:100%;color:#ffd75a}.rdrw span{background:#0d1222;border-radius:8px;padding:2px 7px;font-weight:800}.rdrw small{width:100%;color:#b9a8d8;font-size:11px}
  .rdtop{display:flex;align-items:center;gap:6px;background:#0d1222;border-radius:9px;padding:5px 8px;margin:3px 0;font-size:12.5px;text-align:left}.rdtop canvas{width:28px;height:28px}.rdtop b{flex:1}</style>`);
  $('#rdClose').onclick = () => $('#mRaid').classList.remove('on');
  let RAID = null;
  async function openRaid(result) {
    $('#mRaid').classList.add('on'); const B = $('#rdBody'); if (!result) B.innerHTML = '<p>불러오는 중…</p>';
    try {
      const R = result || await api('/api/raid'); RAID = R;
      const pct = Math.max(0, R.hpLeft / R.hpMax * 100);
      const sq = raidSquad();
      B.innerHTML = `<div style="color:#ff9a3e;letter-spacing:3px;font-size:12px;font-weight:900">WORLD BOSS · 협동 레이드</div>
        <h2 style="font-size:22px;margin:4px 0">${EMO[R.element]} ${esc(R.name)} <span style="color:#ffd75a">Lv.${R.level}</span></h2>
        <div class="rdbar"><i style="width:${pct}%"></i></div><div style="font-size:12px;color:#ffb0bd">남은 체력 ${fmtN(R.hpLeft)} / ${fmtN(R.hpMax)} · 이번 주 토벌 ${R.killed}회 · 참가 ${R.players}명</div>
        <p style="font-size:12.5px">모든 플레이어가 함께 보스 체력을 깎아요! 쓰러뜨릴 때마다 더 강한 보스가 나타나고, 참가자 모두 보상 💎을 받아요.<br>약점: <b style="color:#ffd75a">${weakTo(R.element).map(a => EMO[a] + ELS[a].n).join(' ')}</b> · 출전: 내 도감 최강 ${sq.length}마리 · 60초</p>
        ${result && result.hit != null ? `<div style="font-size:18px;font-weight:900;color:#ffd75a;margin:6px 0">💥 이번 피해 ${fmtN(result.hit)}${result.killedNow ? ' · 🎉 보스 토벌!' : ''}</div>` : ''}
        <div class="rdrw"><b>🏆 주간 피해 순위 보상</b><span>🥇 💎500</span><span>🥈 💎300</span><span>🥉 💎200</span><span>4~10위 💎100</span><span>참가 💎30</span><small>월요일에 지난주 순위대로 받아요</small></div>
        ${R.my ? `<div style="font-size:13px">내 누적 피해 <b style="color:#ffd75a">${fmtN(R.my.damage)}</b>${R.my.rank ? ' · 현재 <b style="color:#ffd75a">' + R.my.rank + '위</b>' : ''} · 오늘 남은 도전 <b>${R.my.left}</b>/3</div>` : '<p>로그인하면 레이드에 참가할 수 있어요</p>'}
        <div class="row">${R.my ? `<button class="btn raid" id="rdGo" ${R.my.left <= 0 || !sq.length ? 'disabled' : ''}>⚔️ 도전하기</button>` : ''}${R.my && R.my.claimGems ? `<button class="btn gold" id="rdClaim">🎁 토벌 보상 💎${R.my.claimGems}</button>` : ''}${R.my && R.my.lastWeek && !R.my.lastWeek.claimed ? `<button class="btn gold" id="rdRank">🏆 지난주 ${R.my.lastWeek.rank}위 보상 💎${R.my.lastWeek.gems}</button>` : ''}</div>
        <h2 style="font-size:15px;margin-top:12px">🏅 이번 주 기여 순위</h2><div id="rdTop"></div>`;
      const T = $('#rdTop');
      if (!R.top.length) T.innerHTML = '<p>아직 아무도 도전하지 않았어요. 첫 일격을 날려 보세요!</p>';
      R.top.forEach(t => { const d = document.createElement('div'); d.className = 'rdtop'; d.innerHTML = `<span style="width:22px;color:#ffd75a;font-weight:900">${t.rank}</span>`; if (t.rep) d.appendChild(iconCanvas(t.rep.e, t.rep.s, 28, t.rep.f)); d.insertAdjacentHTML('beforeend', `<b>${esc(t.name)}</b><span>${fmtN(t.damage)}${t.rank <= 3 ? ' <i style="font-style:normal;color:#7fe3ff">💎' + [500, 300, 200][t.rank - 1] + '</i>' : ''}</span>`); d.onclick = () => openProfile(t.name); T.appendChild(d) });
      const g = $('#rdGo'); if (g) g.onclick = () => { document.querySelectorAll('.modal').forEach(m => m.classList.remove('on')); startRaid(R) };
      const k = $('#rdRank'); if (k) k.onclick = async () => { try { const r = await api('/api/raid', 'POST', { action: 'claimRank' }); if (r.gems != null) { USER.gems = r.gems; renderAcct() } toast('🏆 지난주 ' + r.rank + '위 보상 💎' + r.claimed); openRaid(r) } catch (e) { toast('⚠️ ' + e.message) } };
      const c = $('#rdClaim'); if (c) c.onclick = async () => { try { const r = await api('/api/raid', 'POST', { action: 'claim' }); if (r.gems != null) { USER.gems = r.gems; renderAcct() } toast('🎁 토벌 보상 💎' + r.claimed); openRaid(r) } catch (e) { toast('⚠️ ' + e.message) } };
    } catch (e) { B.innerHTML = '<p>레이드 정보를 불러오지 못했어요: ' + esc(e.message) + '</p>' }
  }
  window.onRaidEnd = async (dmg) => {
    let r = null;
    try { r = await api('/api/raid', 'POST', { action: 'hit', damage: dmg }) } catch (e) { toast('⚠️ ' + e.message) }
    begin(newState()); $('#mStart').classList.add('on'); refreshTitle();
    openRaid(r || undefined);
  };
  $('#bRaid').onclick = () => { if (!USER) { toast('🔐 로그인하면 레이드에 참가할 수 있어요'); return } openRaid() };

  // 버튼 연결
  $('#bDaily').onclick = startDaily;
  $('#bRank').onclick = () => openRank('normal');
  $('#bShop').onclick = openShop;
  $('#bCharge').onclick = () => toast('💳 보석 충전은 결제 연동 후 열려요');
  document.querySelectorAll('[data-rk]').forEach(b => b.onclick = () => openRank(b.dataset.rk));
  // 게임오버 화면에 랭킹 버튼
  const ov = $('#bRetry'); if (ov) { const rb = document.createElement('button'); rb.className = 'btn'; rb.textContent = '🏆 랭킹'; rb.onclick = () => openRank(S.mode === 'daily' ? 'daily' : 'normal'); ov.parentNode.insertBefore(rb, ov) }
  // 다시 도전: 오늘의 도전 중이었으면 오늘의 도전으로
  const rt = $('#bRetry'); if (rt) { const old = rt.onclick; rt.onclick = () => { if (S.mode === 'daily') startDaily(); else old && old() } }

  // 시작
  renderAcct();
  (async () => {
    try { const j = await api('/api/shop'); j.items.forEach(i => ITEM_NAME[i.id] = i.name) } catch (e) { }
    if (localStorage.getItem(TK)) {
      try { const j = await api('/api/auth'); setUser(j.user); if (j.reward) toast('👋 출석 보상 💎' + j.reward); await pull(); duelNews() } catch (e) { }
    }
  })();
  window.__JMO = { api, startDaily, openRank, openShop, openProfile, get USER() { return USER } };
})();
