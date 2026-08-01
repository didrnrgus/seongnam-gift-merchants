// 성남사랑상품권 가맹점 찾기
// 데이터는 data/merchants.json 한 파일이 전부이고, 지도는 API 키 없이 구글맵
// 임베드(iframe)로 띄웁니다.
//
// 지도 임베드에 대해:
//   - 네이버지도(map.naver.com)는 X-Frame-Options: DENY 라 iframe 에 넣을 수 없습니다.
//     모바일(m.map.naver.com)도 SAMEORIGIN 이라 마찬가지입니다. 우회 방법은 없습니다.
//   - 카카오맵은 프레임 차단 헤더가 없어 임베드 자체는 되지만 공식 지원이 아닙니다.
//   - 그래서 임베드는 구글맵을 쓰고, 네이버·카카오는 새 탭 링크로 제공합니다.

const DATA_URL = 'data/merchants.json';
const PAGE_SIZE = 60; // 스크롤 한 번에 추가로 그릴 카드 수

// 구글맵 임베드에 "주소 + 상호"를 넣으면 단일 장소로 매칭되지 않는 경우가 많고,
// 그러면 구글은 지오코딩을 포기하고 핀 없이 대략적인 영역만 보여줍니다.
// 실측(무작위 20개 표본)에서 주소만 넣으면 20/20 이 좌표로 해석돼 핀이 찍혔고,
// 주소 + 상호는 12/20 에 그쳤습니다. 그래서 임베드 쿼리는 반드시 주소만 씁니다.
// (상호는 우리 상세 패널에 이미 크게 적혀 있으니 지도에 중복될 필요가 없습니다.)
const MAP_EMBED = (address) =>
  `https://www.google.com/maps?q=${encodeURIComponent(address)}&hl=ko&z=18&output=embed`;

const PAY_PAPER = 1;
const PAY_MOBILE = 2;

const $ = (id) => document.getElementById(id);

const el = {
  meta: $('dataMeta'),
  name: $('fName'),
  cat: $('fCat'),
  gu: $('fGu'),
  paper: $('fPaper'),
  mobile: $('fMobile'),
  reset: $('btnReset'),
  count: $('resultCount'),
  list: $('list'),
  empty: $('emptyMsg'),
  sentinel: $('sentinel'),
  detail: $('detail'),
  dName: $('dName'),
  dAddr: $('dAddr'),
  dCat: $('dCat'),
  dGu: $('dGu'),
  dPay: $('dPay'),
  dTel: $('dTel'),
  map: $('mapFrame'),
  close: $('btnClose'),
  copy: $('btnCopy'),
  naver: $('lnkNaver'),
  kakao: $('lnkKakao'),
  google: $('lnkGoogle'),
  tel: $('lnkTel'),
  links: $('mapLinks'),
  hint: $('mapHint'),
};

// 모바일에서는 하단 상세 패널(지도 임베드 포함)을 쓰지 않습니다.
// 목록이 길어서 패널이 카드 수천 픽셀 아래로 밀려 사실상 보이지 않고,
// 좁은 화면에서 지도 iframe 은 데이터만 축내기 때문입니다.
// 대신 선택한 카드 안에 지도앱 버튼만 붙입니다. 기준은 style.css 의 브레이크포인트와 동일.
const MOBILE = window.matchMedia('(max-width: 600px)');

/** @type {{cat: string[], gu: string[], rows: any[][]}} */
let data = { cat: [], gu: [], rows: [] };
/** 상호를 소문자·공백제거로 정규화한 검색 인덱스. rows 와 인덱스가 1:1로 대응합니다. */
let searchKeys = [];
/** 현재 필터를 통과한 행 번호 목록 */
let matches = [];
/** 화면에 이미 그려진 카드 수 */
let rendered = 0;
/** 선택된 행 번호 (없으면 -1) */
let selected = -1;

const normalize = (s) => s.toLowerCase().replace(/\s+/g, '');

const payLabel = (mask) => {
  if (mask === (PAY_PAPER | PAY_MOBILE)) return '지류·모바일';
  if (mask === PAY_MOBILE) return '모바일';
  if (mask === PAY_PAPER) return '지류';
  return '정보 없음';
};

// ---------------------------------------------------------------- 데이터 적재

async function load() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${res.status})`);
  data = await res.json();

  searchKeys = data.rows.map((r) => normalize(r[2]));

  fillSelect(el.cat, data.cat);
  fillSelect(el.gu, data.gu);

  el.meta.textContent = `전체 ${data.rows.length.toLocaleString('ko-KR')}개 가맹점 · 출처 ${data.source ?? '성남시 공개자료'}`;
}

function fillSelect(select, values) {
  const frag = document.createDocumentFragment();
  values.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = v;
    frag.appendChild(opt);
  });
  select.appendChild(frag);
}

// ------------------------------------------------------------------- 필터링

function applyFilters() {
  const q = normalize(el.name.value.trim());
  const cat = el.cat.value === '' ? -1 : Number(el.cat.value);
  const gu = el.gu.value === '' ? -1 : Number(el.gu.value);

  // 체크박스는 "해당 결제수단을 지원하는 곳"을 뜻합니다.
  // 둘 다 체크하면 둘 다 되는 곳만, 둘 다 해제하면 결제방법 조건 없음.
  let payRequired = 0;
  if (el.paper.checked) payRequired |= PAY_PAPER;
  if (el.mobile.checked) payRequired |= PAY_MOBILE;

  const next = [];
  const rows = data.rows;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (cat !== -1 && r[0] !== cat) continue;
    if (gu !== -1 && r[1] !== gu) continue;
    if (payRequired && (r[5] & payRequired) !== payRequired) continue;
    if (q && !searchKeys[i].includes(q)) continue;
    next.push(i);
  }

  matches = next;
  resetList();
  syncUrl();
}

function resetList() {
  el.list.replaceChildren();
  rendered = 0;

  const n = matches.length;
  el.count.textContent = n === 0
    ? '검색 결과 없음'
    : `검색 결과 ${n.toLocaleString('ko-KR')}개`;
  el.empty.hidden = n !== 0;

  fillViewport();
}

// IntersectionObserver 는 "교차 상태가 바뀔 때"만 부르기 때문에, 한 묶음을 그린 뒤에도
// 화면이 덜 찼으면 관찰자가 다시 불리지 않습니다. 화면이 찰 때까지 직접 채웁니다.
function fillViewport() {
  for (let guard = 0; guard < 50; guard++) {
    renderMore();
    if (rendered >= matches.length) return;
    if (el.sentinel.getBoundingClientRect().top > window.innerHeight + 400) return;
  }
}

function renderMore() {
  if (rendered >= matches.length) return;

  const end = Math.min(rendered + PAGE_SIZE, matches.length);
  const frag = document.createDocumentFragment();

  for (let k = rendered; k < end; k++) {
    frag.appendChild(makeCard(matches[k]));
  }
  el.list.appendChild(frag);
  rendered = end;
}

function makeCard(rowIdx) {
  const r = data.rows[rowIdx];

  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card';
  btn.dataset.row = String(rowIdx);
  btn.setAttribute('aria-pressed', String(rowIdx === selected));

  const name = document.createElement('span');
  name.className = 'card__name';
  name.textContent = r[2];

  const addr = document.createElement('span');
  addr.className = 'card__addr';
  addr.textContent = r[3];

  const tags = document.createElement('span');
  tags.className = 'card__tags';
  tags.textContent = `${data.cat[r[0]]} · ${payLabel(r[5])}`;

  btn.append(name, addr, tags);
  li.appendChild(btn);

  // 필터 변경 등으로 목록을 다시 그릴 때, 선택된 카드에는 버튼 블록을 되붙입니다.
  if (MOBILE.matches && rowIdx === selected) li.appendChild(el.links);

  return li;
}

// -------------------------------------------------------------------- 선택

function select(rowIdx) {
  if (rowIdx === selected) return;

  const prev = el.list.querySelector('.card[aria-pressed="true"]');
  if (prev) prev.setAttribute('aria-pressed', 'false');

  selected = rowIdx;
  const now = el.list.querySelector(`.card[data-row="${rowIdx}"]`);
  if (now) now.setAttribute('aria-pressed', 'true');

  const r = data.rows[rowIdx];
  const addr = r[3];
  // 새 탭으로 열리는 네이버·카카오·구글 검색에는 상호를 함께 넣어 실제 가게 POI 를
  // 노리고, 핀이 걸린 임베드에는 주소만 넣습니다 (MAP_EMBED 주석 참고).
  const query = `${addr} ${r[2]}`;

  el.dName.textContent = r[2];
  el.dAddr.textContent = addr;
  el.dCat.textContent = data.cat[r[0]];
  el.dGu.textContent = data.gu[r[1]];
  el.dPay.textContent = payLabel(r[5]);

  const tel = r[4];
  const telHref = tel ? `tel:${tel.replace(/[^0-9+]/g, '')}` : '';
  el.dTel.hidden = !tel;
  el.tel.hidden = !tel;
  if (tel) {
    el.dTel.textContent = `☎ ${tel}`;
    el.dTel.href = telHref;
    el.tel.href = telHref;
  }

  el.naver.href = `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
  el.kakao.href = `https://map.kakao.com/?q=${encodeURIComponent(query)}`;
  el.google.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  layoutSelection({ scroll: true });
  syncUrl();
}

/**
 * 선택 상태를 화면 폭에 맞게 배치합니다.
 * 데스크톱은 하단 sticky 상세 패널 + 지도 임베드, 모바일은 선택한 카드 안의 버튼 블록.
 * 지도 앱 링크(el.links)는 하나뿐이고 두 위치 사이를 오갑니다.
 */
function layoutSelection({ scroll = false } = {}) {
  if (selected === -1) {
    el.detail.hidden = true;
    el.map.removeAttribute('src'); // 숨긴 iframe 이 계속 살아있지 않도록 비웁니다.
    el.detail.insertBefore(el.links, el.hint);
    return;
  }

  if (MOBILE.matches) {
    el.detail.hidden = true;
    el.map.removeAttribute('src'); // 모바일에서는 지도 임베드를 아예 받지 않습니다.

    const card = el.list.querySelector(`.card[data-row="${selected}"]`);
    if (card) {
      card.parentElement.appendChild(el.links);
      if (scroll) el.links.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return;
  }

  el.detail.insertBefore(el.links, el.hint);
  el.detail.hidden = false;
  el.map.src = MAP_EMBED(data.rows[selected][3]);
}

function clearSelection() {
  const prev = el.list.querySelector('.card[aria-pressed="true"]');
  if (prev) prev.setAttribute('aria-pressed', 'false');

  selected = -1;
  layoutSelection();
  syncUrl();
}

// ---------------------------------------------------- URL 동기화 (공유·새로고침)

function syncUrl() {
  const p = new URLSearchParams();
  if (el.name.value.trim()) p.set('q', el.name.value.trim());
  if (el.cat.value) p.set('cat', el.cat.value);
  if (el.gu.value) p.set('gu', el.gu.value);
  if (el.paper.checked) p.set('paper', '1');
  if (el.mobile.checked) p.set('mobile', '1');
  if (selected !== -1) p.set('sel', String(selected));

  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  el.name.value = p.get('q') ?? '';
  el.cat.value = p.get('cat') ?? '';
  el.gu.value = p.get('gu') ?? '';
  el.paper.checked = p.get('paper') === '1';
  el.mobile.checked = p.get('mobile') === '1';

  applyFilters();

  // Number(null) 은 0 이므로, 파라미터가 아예 없는 경우를 먼저 걸러야 합니다.
  const raw = p.get('sel');
  if (raw !== null) {
    const sel = Number(raw);
    if (Number.isInteger(sel) && sel >= 0 && sel < data.rows.length) {
      select(sel);
    }
  }
}

// -------------------------------------------------------------------- 배선

function wire() {
  let timer;
  el.name.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(applyFilters, 150);
  });

  [el.cat, el.gu, el.paper, el.mobile].forEach((node) => {
    node.addEventListener('change', applyFilters);
  });

  el.reset.addEventListener('click', () => {
    el.name.value = '';
    el.cat.value = '';
    el.gu.value = '';
    el.paper.checked = false;
    el.mobile.checked = false;
    clearSelection();
    applyFilters();
  });

  el.list.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;

    // 모바일에는 "닫기" 버튼이 없으므로 같은 카드를 다시 누르면 접힙니다.
    const row = Number(card.dataset.row);
    if (row === selected) clearSelection();
    else select(row);
  });

  // 가로/세로 전환이나 창 크기 변경으로 모드가 바뀌면 선택 표시를 다시 배치합니다.
  MOBILE.addEventListener('change', () => layoutSelection());

  el.close.addEventListener('click', clearSelection);

  el.copy.addEventListener('click', async () => {
    if (selected === -1) return;
    try {
      await navigator.clipboard.writeText(data.rows[selected][3]);
      el.copy.textContent = '복사됨';
      setTimeout(() => { el.copy.textContent = '주소 복사'; }, 1500);
    } catch {
      el.copy.textContent = '복사 실패';
      setTimeout(() => { el.copy.textContent = '주소 복사'; }, 1500);
    }
  });

  // 목록 끝이 보이면 다음 묶음을 그립니다 (24,000건을 한 번에 그리지 않기 위해).
  new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) fillViewport();
  }, { rootMargin: '400px' }).observe(el.sentinel);
}

// --------------------------------------------------------------------- 시작

load()
  .then(() => {
    wire();
    restoreFromUrl();
  })
  .catch((err) => {
    el.meta.textContent = err.message;
    el.count.textContent = '';
    console.error(err);
  });
