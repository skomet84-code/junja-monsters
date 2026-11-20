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
      A.innerHTML = `<div class="who"><span>👤</span><div>${tt}<b>${esc(USER.name)}</b><br><small>💎 보석 ${USER.gems} · 기록은 서버에 자동 저장돼요</small></div><div class="sp"></div>${USER.admin ? '<a class="btn" href="/admin" style="text-decoration:none;font-size:12px">관리자</a>' : ''}<button class="btn" id="bOut" style="font-size:12px">로그아웃</button></div>`;
      $('#bOut').onclick = () => logout();
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
      await pull();
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
        meta = Object.assign({ best: 0, dex: {} }, sm, { best: Math.max(sm.best || 0, lm.best || 0), dex: Object.assign({}, lm.dex || {}, sm.dex || {}), fuse: Object.assign({}, lm.fuse || {}, sm.fuse || {}) });
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
    const s = newState(); s.mode = 'daily'; s.perm = R.perm; s.allowed = R.allowed; s.hp = 20; s.eth = 240;
    begin(s);
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
      $('#rkList').innerHTML = j.top.length ? j.top.map(t => `<div class="rk${t.me ? ' me' : ''}"><div class="n">${t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : t.rank}</div><div class="nm">${t.title ? `<small>「${esc(titleName(t.title))}」</small>` : ''}${esc(t.name)}</div><div class="w">WAVE ${t.wave}</div><small style="color:#9aa4c2;width:56px;text-align:right">${t.kills}마리</small></div>`).join('') : '<p>아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>';
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
      try { const j = await api('/api/auth'); setUser(j.user); if (j.reward) toast('👋 출석 보상 💎' + j.reward); await pull() } catch (e) { }
    }
  })();
  window.__JMO = { api, startDaily, openRank, openShop, get USER() { return USER } };
})();
