// 画面と保存。入力した金額は localStorage（この端末の中）だけに置き、どこにも送らない。
import { RULES } from './rules.js';
import { incomeTax, residentTax, thresholds, rollingTotals } from './calc.js';

const STORAGE_KEY = `tax-fuyo-simulator:${RULES.year}`;
const LAST_YEAR_KEY = `tax-fuyo-simulator:${RULES.year - 1}`;
const $ = (id) => document.getElementById(id);
const yen = (n) => Math.round(n).toLocaleString('ja-JP');
const toNumber = (text) => {
  const half = String(text).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const digits = half.replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
};

function emptyState() {
  return {
    year: RULES.year,
    names: ['1か所目', '2か所目'],
    // months[月-1] = [1か所目の給与, 2か所目の給与, 交通費（2か所の合計）]。未入力は null
    // 交通費は社会保険の扶養（直近12か月の累計）にだけ使う。税金の計算には入れない
    months: Array.from({ length: 12 }, () => [null, null, null]),
    // 去年の分。社会保険の扶養（直近12か月の累計）にだけ使う
    prevMonths: Array.from({ length: 12 }, () => [null, null, null]),
    kyuchi: RULES.resident.defaultKyuchi,
    perCapita: null,
  };
}

// 読み込んだものが壊れていても画面が動くように、形を整えてから使う
function normalize(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  const amount = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  if (Array.isArray(raw.names)) {
    raw.names.slice(0, 2).forEach((name, i) => {
      if (typeof name === 'string' && name.trim()) state.names[i] = name.slice(0, 12);
    });
  }
  // 以前は交通費を「毎月同じ額」の1つだけで持っていた。その形のデータは、
  // 給与を入れてあった月にその額を入れて、前と同じ累計になるように引き継ぐ
  const oldCommute = amount(raw.commuteMonthly);
  ['months', 'prevMonths'].forEach((key) => {
    if (!Array.isArray(raw[key])) return;
    raw[key].slice(0, 12).forEach((row, m) => {
      if (!Array.isArray(row)) return;
      const salary = [amount(row[0]), amount(row[1])];
      const hasSalary = salary.some((v) => v !== null);
      const commute = row.length > 2 ? amount(row[2]) : hasSalary ? oldCommute : null;
      state[key][m] = [...salary, commute];
    });
  });
  if ([1, 2, 3].includes(raw.kyuchi)) state.kyuchi = raw.kyuchi;
  state.perCapita = amount(raw.perCapita);
  return state;
}

// 去年の書き出しファイルや保存の中身（今年分）を、今年の「去年の給与と交通費」にする。
// 名前は、今年まだ初期のままなら引き継ぐ。級地と均等割は引き継がない
// （年が変わるときに rules.js の初期値を確かめ直すので、そちらを使う）。
function takeLastYear(target, raw) {
  const last = normalize(raw);
  target.prevMonths = last.months;
  const defaults = emptyState().names;
  target.names = target.names.map((name, i) => (name === defaults[i] ? last.names[i] : name));
  return target;
}

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return normalize(JSON.parse(saved));
    // 今年の保存がまだなく、去年の保存が端末に残っていれば、去年の分として写す。
    // 去年の保存はそのまま残す（消さない）。
    const lastYear = localStorage.getItem(LAST_YEAR_KEY);
    if (lastYear !== null) {
      const state = takeLastYear(emptyState(), JSON.parse(lastYear));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $('data-message').textContent =
        `${RULES.year - 1}年の入力を、「去年の給与と交通費」に写しました。`;
      return state;
    }
  } catch {
    // 読めないときは空の画面で始める
  }
  return emptyState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    $('data-message').textContent = 'この端末に保存できませんでした。書き出しで控えを取ってください。';
  }
}

let state = load();

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// key は 'months'（今年）か 'prevMonths'（去年）
function buildMonths(bodyId, key) {
  const body = $(bodyId);
  const yearLabel = key === 'months' ? '' : '去年';
  body.replaceChildren();
  const columns = (i) => (i < 2 ? `${i + 1}か所目` : '交通費');
  state[key].forEach((row, m) => {
    const cells = row.map((value, i) => {
      const input = el('input', {
        className: i < 2 ? 'yen' : 'yen commute',
        type: 'text',
        inputMode: 'numeric',
        placeholder: '−',
        value: value === null ? '' : yen(value),
      });
      input.setAttribute('aria-label', `${yearLabel}${m + 1}月 ${columns(i)}`);
      input.addEventListener('input', () => {
        state[key][m][i] = toNumber(input.value);
        save();
        render();
      });
      input.addEventListener('blur', () => {
        const v = state[key][m][i];
        input.value = v === null ? '' : yen(v);
      });
      return el('td', {}, [input]);
    });
    body.append(el('tr', {}, [el('th', { scope: 'row', textContent: `${m + 1}月` }), ...cells]));
  });
}

// 年替わりの案内。使う人に向けて書き、アプリの更新は作成者に頼んでもらう。
// ・年が明けたのに、まだ前の年の画面のまま → 目立つ色で知らせる（日付は端末の時計で見る。外には送らない）
// ・12月の欄に何か入った → 年末の準備（控えの書き出しと、更新の依頼）を出す
// 閉じるボタンは付けない。更新すれば自然に消える。
function renderYearNotice() {
  const notice = $('year-notice');
  const thisYear = new Date().getFullYear();
  const next = RULES.year + 1;
  let title;
  let lines;
  if (thisYear > RULES.year) {
    title = `この画面は${RULES.year}年の分です`;
    lines = [
      `${next}年に受け取る給与は、まだ入れられません。アプリの更新が必要なので、作成者に伝えてください。`,
      '更新の前に、念のため控えを書き出しておいてください。',
    ];
  } else if (state.months[11].some((v) => v !== null)) {
    title = '年末の準備';
    lines = [
      '① 控えを書き出しておいてください。',
      `② ${next}年1月の給与を入れる前に、アプリの更新が必要です。作成者に伝えてください。`,
      `更新すると、今年の入力は${next}年の画面の「去年の給与と交通費」に自動で写ります。`,
    ];
  } else {
    notice.hidden = true;
    return;
  }
  notice.hidden = false;
  notice.className = `card notice${thisYear > RULES.year ? ' warn' : ''}`;
  $('year-notice-title').textContent = title;
  $('year-notice-body').replaceChildren(...lines.map((text) => el('p', { textContent: text })));
}

function render() {
  renderYearNotice();
  const sums = [0, 1].map((i) => state.months.reduce((sum, pair) => sum + (pair[i] ?? 0), 0));
  const total = sums[0] + sums[1];
  const blank = state.months.filter((pair) => pair[0] === null && pair[1] === null).length;

  $('total').textContent = yen(total);
  $('total-detail').textContent =
    `${state.names[0]} ${yen(sums[0])}円 ／ ${state.names[1]} ${yen(sums[1])}円` +
    (blank ? ` ・ 未入力 ${blank}か月` : '');

  $('prev-name-0').textContent = state.names[0];
  $('prev-name-1').textContent = state.names[1];

  const rolling = rollingTotals(state.prevMonths, state.months);
  const latest = rolling.findLast((r) => r.entered);
  const windowLabel = (r) => (r.month === 12 ? '今年1月〜12月' : `去年${r.month + 1}月〜今年${r.month}月`);
  renderRolling(rolling);

  const list = thresholds(total, { kyuchi: state.kyuchi, rolling: latest });
  const groupNames = { self: '本人への影響', spouse: '夫への影響' };
  $('thresholds').replaceChildren(
    ...list.flatMap((t, i) => {
      const amount = t.over
        ? `${yen(-t.remaining)}円 超えています`
        : `あと ${yen(t.remaining)}円`;
      let perMonth = '';
      if (t.rolling) {
        perMonth = latest ? `${windowLabel(latest)}の累計 ${yen(t.total)}円` : '今年の給与を入れると出ます';
      } else if (!t.over && blank) {
        perMonth = `未入力の${blank}か月でならすと 月${yen(Math.floor(t.remaining / blank))}円まで`;
      }
      const bar = el('div', { className: 'bar' }, [el('span')]);
      bar.firstChild.style.width = `${Math.min(100, (t.total / t.limit) * 100)}%`;
      const title = el('div', { className: 'row' }, [
        el('span', { className: 'th-name' }, [
          t.name,
          ...(t.provisional ? [el('span', { className: 'badge', textContent: '要確認' })] : []),
        ]),
        el('span', { className: 'th-limit', textContent: t.limitLabel ?? `${yen(t.limit)}円まで` }),
      ]);
      const item = el('li', { className: t.over ? 'over' : '' }, [
        title,
        bar,
        el('p', { className: 'th-amount', textContent: amount }),
        el('p', { className: 'sub', textContent: [perMonth, t.note].filter(Boolean).join('。') }),
      ]);
      const heading = t.group !== list[i - 1]?.group;
      return heading ? [el('li', { className: 'group', textContent: groupNames[t.group] }), item] : [item];
    }),
  );

  const it = incomeTax(total);
  const rt = residentTax(total, state.kyuchi, state.perCapita ?? undefined);
  $('tax-income').textContent = `${yen(it.tax)}円`;
  $('tax-resident').textContent = `${yen(rt.tax)}円`;
}

// 社会保険の扶養：月ごとの直近12か月の累計。これからの月は「その月に入れられる残り」になる
function renderRolling(rolling) {
  $('rolling').replaceChildren(
    ...rolling.map((r) =>
      el('tr', { className: [r.over ? 'over' : '', r.entered ? '' : 'future'].join(' ').trim() }, [
        el('th', { scope: 'row', textContent: `${r.month}月` }),
        el('td', { textContent: `${yen(r.total)}円` }),
        el('td', { textContent: r.over ? `${yen(-r.remaining)}円 超過` : `あと ${yen(r.remaining)}円` }),
      ]),
    ),
  );
  const missing = rolling.some((r) => r.entered && r.missingPrev > 0);
  $('rolling-warning').textContent = missing
    ? '去年の給与に未入力の月があるため、累計が実際より少なく出ています。下の「去年の給与」に入れてください。'
    : '';
}

function bindSettings() {
  [0, 1].forEach((i) => {
    const input = $(`name-${i}`);
    input.value = state.names[i];
    input.oninput = () => {
      state.names[i] = input.value.trim() || emptyState().names[i];
      save();
      render();
    };
  });
  $('kyuchi').value = String(state.kyuchi);
  $('kyuchi').onchange = () => {
    state.kyuchi = Number($('kyuchi').value);
    save();
    render();
  };
  ['perCapita'].forEach((key) => {
    const input = $(key);
    const show = () => (input.value = state[key] === null ? '' : yen(state[key]));
    show();
    input.oninput = () => {
      state[key] = toNumber(input.value);
      save();
      render();
    };
    input.onblur = show;
  });
}

function bindData() {
  const exportData = (messageId) => {
    const day = new Date().toLocaleDateString('sv-SE');
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(blob), download: `export-${RULES.year}-${day}.json` });
    link.click();
    URL.revokeObjectURL(link.href);
    $(messageId).textContent = '書き出しました。ファイルは自分で安全な場所に保管してください。';
  };
  $('export').addEventListener('click', () => exportData('data-message'));
  $('year-notice-export').addEventListener('click', () => exportData('year-notice-message'));
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (raw.year === RULES.year) {
        if (!confirm('いま入っている内容を、読み込んだ内容で置き換えます。よろしいですか？')) return;
        state = normalize(raw);
        $('data-message').textContent = '読み込みました。';
      } else if (raw.year === RULES.year - 1) {
        // 去年のファイル：その年の12か月分を「去年の給与と交通費」に入れる。今年の分には触らない
        if (!confirm(`${raw.year}年のファイルです。「去年の給与と交通費」を、このファイルの内容で置き換えます。今年の入力はそのままです。よろしいですか？`)) return;
        state = takeLastYear(state, raw);
        $('data-message').textContent = `${raw.year}年の分を「去年の給与と交通費」に読み込みました。`;
      } else {
        throw new Error('year');
      }
      save();
      start();
    } catch {
      $('data-message').textContent = `読み込めませんでした。${RULES.year}年か${RULES.year - 1}年の書き出しファイルを選んでください。`;
    }
  });
}

function buildSources() {
  $('year-label').textContent = RULES.label;
  $('sources').replaceChildren(
    ...Object.values(RULES.sources).map((s) =>
      el('li', {}, [
        s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.title }) : s.title,
        `（${s.checked} 確認）`,
      ]),
    ),
  );
}

function start() {
  buildMonths('months', 'months');
  buildMonths('prev-months', 'prevMonths');
  bindSettings();
  render();
}

buildSources();
bindData();
start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
