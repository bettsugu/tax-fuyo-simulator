// 計算の仕組み。画面や保存には触れない（テストしやすくするため）。
import { RULES } from './rules.js';

const floorTo = (n, unit) => Math.floor(n / unit) * unit;
const pick = (table, value) => table.find((row) => value <= row.upTo);

// 給与の収入金額 → 給与所得（令和8・9年分）
// 220万円未満は改正のあらまし(2)ハ、220万円以上は従来どおりの計算。
export function salaryIncome(revenue) {
  const min = RULES.salaryDeductionMin;
  if (revenue < 741_000) return 0;
  if (revenue < 2_191_000) return revenue - min;
  if (revenue < 2_193_000) return 1_451_000;
  if (revenue < 2_196_000) return 1_453_000;
  if (revenue < 2_200_000) return 1_456_000;
  if (revenue < 3_600_000) return (floorTo(revenue, 4_000) * 7) / 10 - 80_000;
  if (revenue < 6_600_000) return (floorTo(revenue, 4_000) * 8) / 10 - 440_000;
  if (revenue < 8_500_000) return Math.floor((revenue * 9) / 10) - 1_100_000;
  return revenue - 1_950_000;
}

// 本人の所得税（復興特別所得税を含む）。社会保険料などの控除は入れていない目安。
export function incomeTax(revenue) {
  const income = salaryIncome(revenue);
  const basic = pick(RULES.basicDeduction, income).amount;
  const taxable = floorTo(Math.max(0, income - basic), 1_000);
  if (taxable === 0) return { income, basic, taxable, tax: 0 };
  const row = pick(RULES.incomeTaxTable, taxable);
  const base = Math.round(taxable * row.rate) - row.minus;
  const tax = floorTo(Math.floor(base + base * RULES.reconstructionRate + 1e-6), 100);
  return { income, basic, taxable, tax };
}

// 本人の住民税（翌年度に払う分）。kyuchi は市町村の級地（1〜3）。
export function residentTax(revenue, kyuchi = 1, perCapitaAmount = RULES.resident.perCapita) {
  const r = RULES.resident;
  const income = salaryIncome(revenue);
  const perCapita = income > r.perCapitaExemptIncome[kyuchi] ? perCapitaAmount : 0;
  let incomeLevy = 0;
  if (income > r.incomeLevyExemptIncome) {
    const taxable = floorTo(Math.max(0, income - r.basicDeduction), 1_000);
    const adjust =
      taxable <= 2_000_000
        ? Math.min(r.adjustBase, taxable) * 0.05
        : Math.max(r.adjustBase - (taxable - 2_000_000), 50_000) * 0.05;
    incomeLevy = floorTo(Math.max(0, Math.round(taxable * r.rate - adjust)), 100);
  }
  return { income, incomeLevy, perCapita, tax: incomeLevy + perCapita };
}

// 社会保険の扶養：その月までの直近12か月の累計（交通費を含む総支給額）を月ごとに出す。
// prev は去年、cur は今年の [1か所目, 2か所目] × 12か月。未入力は null。
// commuteMonthly は月々の交通費（2か所の合計）で、給与を入れた月にだけ足す。
export function rollingTotals(prev, cur, commuteMonthly = 0) {
  const paid = [...prev, ...cur].map((pair) =>
    pair[0] === null && pair[1] === null ? null : (pair[0] ?? 0) + (pair[1] ?? 0) + commuteMonthly,
  );
  const limit = RULES.dependentInsurance.limit - 1;
  return cur.map((_, i) => {
    const window = paid.slice(i + 1, i + 13);
    const total = window.reduce((sum, v) => sum + (v ?? 0), 0);
    return {
      month: i + 1,
      total,
      remaining: limit - total,
      over: total > limit,
      entered: paid[i + 12] !== null,
      // 累計に入るはずの去年の月のうち、未入力の数（あると累計が少なく出る）
      missingPrev: window.slice(0, 11 - i).filter((v) => v === null).length,
    };
  });
}

// 「各基準まであといくら」の一覧。金額はすべて年間の給与収入（税金は交通費を除く）。
// rolling は rollingTotals のうち画面に出したい月の1件。社会保険の扶養だけはこれで見る。
export function thresholds(revenue, { kyuchi = 1, rolling } = {}) {
  const min = RULES.salaryDeductionMin;
  const s = RULES.spouse;
  const dep = RULES.dependentInsurance;
  const list = [
    {
      id: 'resident',
      name: '住民税がかからない',
      limit: RULES.resident.perCapitaExemptIncome[kyuchi] + min,
      note: `超えると翌年度に均等割がかかる。所得に応じた分（所得割）は${(
        RULES.resident.incomeLevyExemptIncome + min
      ).toLocaleString('ja-JP')}円を超えてから`,
      source: 'soumu',
    },
    {
      id: 'insurance',
      name: '社会保険の扶養',
      limit: dep.limit - 1,
      limitLabel: `${dep.limit.toLocaleString('ja-JP')}円未満`,
      total: rolling?.total ?? 0,
      rolling: true,
      note: '交通費を含む総支給額の、直近12か月の累計で見る。超えた月の翌月1日から扶養を外れる',
      source: 'kyosai',
      provisional: !dep.confirmed,
    },
    {
      id: 'spouseDeduction',
      name: '配偶者控除',
      limit: s.spouseDeductionIncome + min,
      note: '超えても配偶者特別控除に切り替わり、控除額はしばらく同じ',
      source: 'ntaAramashi',
    },
    {
      id: 'specialFull',
      name: '配偶者特別控除が満額',
      limit: s.specialFullIncome + min,
      note: '超えると配偶者側の控除が少しずつ減る',
      source: 'ntaAramashi',
    },
    {
      id: 'incomeTax',
      name: '本人の所得税がかからない',
      limit: min + RULES.basicDeduction[0].amount,
      note: '超えた分に所得税がかかる',
      source: 'ntaAramashi',
    },
    {
      id: 'specialEnd',
      name: '配偶者特別控除がなくなる',
      limit: s.specialEndIncome + min,
      note: '超えると配偶者側の控除がゼロになる',
      source: 'ntaAramashi',
    },
  ];
  return list
    .map((t) => {
      const total = t.total ?? revenue;
      return { ...t, total, remaining: t.limit - total, over: total > t.limit };
    })
    .sort((a, b) => a.limit - b.limit);
}
