// 画面と保存。入力した金額は localStorage（この端末の中）だけに置き、どこにも送らない。
import { RULES } from './rules.js';
import { incomeTax, residentTax, thresholds } from './calc.js';

const STORAGE_KEY = `tax-fuyo-simulator:${RULES.year}`;
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
    // months[月-1] = [1か所目, 2か所目]。未入力は null
    months: Array.from({ length: 12 }, () => [null, null]),
    kyuchi: 1,
    perCapita: null,
    commute: null,
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
  if (Array.isArray(raw.months)) {
    raw.months.slice(0, 12).forEach((pair, m) => {
      if (Array.isArray(pair)) state.months[m] = [amount(pair[0]), amount(pair[1])];
    });
  }
  if ([1, 2, 3].includes(raw.kyuchi)) state.kyuchi = raw.kyuchi;
  state.perCapita = amount(raw.perCapita);
  state.commute = amount(raw.commute);
  return state;
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return emptyState();
  }
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

function buildMonths() {
  const body = $('months');
  body.replaceChildren();
  state.months.forEach((pair, m) => {
    const cells = pair.map((value, i) => {
      const input = el('input', {
        className: 'yen',
        type: 'text',
        inputMode: 'numeric',
        placeholder: '−',
        value: value === null ? '' : yen(value),
      });
      input.setAttribute('aria-label', `${m + 1}月 ${i + 1}か所目`);
      input.addEventListener('input', () => {
        state.months[m][i] = toNumber(input.value);
        save();
        render();
      });
      input.addEventListener('blur', () => {
        const v = state.months[m][i];
        input.value = v === null ? '' : yen(v);
      });
      return el('td', {}, [input]);
    });
    body.append(el('tr', {}, [el('th', { scope: 'row', textContent: `${m + 1}月` }), ...cells]));
  });
}

function render() {
  const sums = [0, 1].map((i) => state.months.reduce((sum, pair) => sum + (pair[i] ?? 0), 0));
  const total = sums[0] + sums[1];
  const blank = state.months.filter((pair) => pair[0] === null && pair[1] === null).length;

  $('total').textContent = yen(total);
  $('total-detail').textContent =
    `${state.names[0]} ${yen(sums[0])}円 ／ ${state.names[1]} ${yen(sums[1])}円` +
    (blank ? ` ・ 未入力 ${blank}か月` : '');

  const list = thresholds(total, { kyuchi: state.kyuchi, commute: state.commute ?? 0 });
  $('thresholds').replaceChildren(
    ...list.map((t) => {
      const amount = t.over
        ? `${yen(-t.remaining)}円 超えています`
        : `あと ${yen(t.remaining)}円`;
      const perMonth =
        !t.over && blank ? `未入力の${blank}か月でならすと 月${yen(Math.floor(t.remaining / blank))}円まで` : '';
      const bar = el('div', { className: 'bar' }, [el('span')]);
      bar.firstChild.style.width = `${Math.min(100, (t.total / t.limit) * 100)}%`;
      const title = el('div', { className: 'row' }, [
        el('span', { className: 'th-name' }, [
          t.name,
          ...(t.provisional ? [el('span', { className: 'badge', textContent: '要確認' })] : []),
        ]),
        el('span', { className: 'th-limit', textContent: t.limitLabel ?? `${yen(t.limit)}円まで` }),
      ]);
      return el('li', { className: t.over ? 'over' : '' }, [
        title,
        bar,
        el('p', { className: 'th-amount', textContent: amount }),
        el('p', { className: 'sub', textContent: [perMonth, t.note].filter(Boolean).join('。') }),
      ]);
    }),
  );

  const it = incomeTax(total);
  const rt = residentTax(total, state.kyuchi, state.perCapita ?? undefined);
  $('tax-income').textContent = `${yen(it.tax)}円`;
  $('tax-resident').textContent = `${yen(rt.tax)}円`;
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
  ['commute', 'perCapita'].forEach((key) => {
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
  $('export').addEventListener('click', () => {
    const day = new Date().toLocaleDateString('sv-SE');
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(blob), download: `export-${RULES.year}-${day}.json` });
    link.click();
    URL.revokeObjectURL(link.href);
    $('data-message').textContent = '書き出しました。ファイルは自分で安全な場所に保管してください。';
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (raw.year !== RULES.year) throw new Error('year');
      if (!confirm('いま入っている内容を、読み込んだ内容で置き換えます。よろしいですか？')) return;
      state = normalize(raw);
      save();
      start();
      $('data-message').textContent = '読み込みました。';
    } catch {
      $('data-message').textContent = `読み込めませんでした。${RULES.year}年分の書き出しファイルを選んでください。`;
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
  buildMonths();
  bindSettings();
  render();
}

buildSources();
bindData();
start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
