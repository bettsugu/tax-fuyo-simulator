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

// 「各基準まであといくら」の一覧。金額はすべて年間の給与収入（税金は交通費を除く）。
// commute は年間の非課税交通費。社会保険の扶養だけは交通費も足して見る。
export function thresholds(revenue, { kyuchi = 1, commute = 0 } = {}) {
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
      total: revenue + commute,
      note:
        `1月〜12月の合計で見た目安。実際は労働契約からの見込み、または過去1年間の累計（交通費を含む）で判断される。月額の目安は${dep.monthly.toLocaleString('ja-JP')}円未満`,
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
