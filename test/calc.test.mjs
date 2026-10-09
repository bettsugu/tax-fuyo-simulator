// 実行： node --test
// 期待値は国税庁「令和8年4月 源泉所得税の改正のあらまし」の表から取っている。
import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryIncome, incomeTax, residentTax, thresholds, rollingTotals } from '../js/calc.js';

test('給与所得：あらまし(2)ハの表どおり', () => {
  assert.equal(salaryIncome(740_999), 0);
  assert.equal(salaryIncome(741_000), 1_000);
  assert.equal(salaryIncome(2_190_999), 1_450_999);
  assert.equal(salaryIncome(2_191_000), 1_451_000);
  assert.equal(salaryIncome(2_193_000), 1_453_000);
  assert.equal(salaryIncome(2_196_000), 1_456_000);
  assert.equal(salaryIncome(2_200_000), 1_460_000);
});

test('給与所得：所得要件の表のカッコ書き（給与収入）と一致する', () => {
  assert.equal(salaryIncome(1_360_000), 620_000); // 配偶者控除
  assert.equal(salaryIncome(1_690_000), 950_000); // 配偶者特別控除 満額
  assert.equal(salaryIncome(2_070_000), 1_330_000); // 配偶者特別控除 終わり
  // 基礎控除の表：所得336万円・489万円・655万円の区切り
  assert.ok(salaryIncome(4_751_999) <= 3_360_000 && salaryIncome(4_752_000) > 3_360_000);
  assert.equal(salaryIncome(6_655_556), 4_890_000);
  assert.equal(salaryIncome(8_500_000), 6_550_000);
});

test('所得税：178万円まではかからない', () => {
  assert.equal(incomeTax(1_780_000).tax, 0);
  assert.equal(incomeTax(0).tax, 0);
  // 200万円：所得126万 − 基礎控除104万 = 22万 → 5% = 11,000 → ×1.021 = 11,231 → 11,200
  assert.equal(incomeTax(2_000_000).tax, 11_200);
});

test('住民税：119万円まではかからない（1級地）', () => {
  assert.equal(residentTax(1_190_000, 1).tax, 0);
  assert.equal(residentTax(1_190_001, 1).perCapita, 5_500);
  // 3級地は均等割だけ先にかかる
  assert.deepEqual(
    { ...residentTax(1_150_000, 3) },
    { income: 410_000, incomeLevy: 0, perCapita: 5_500, tax: 5_500 },
  );
  // 150万円：所得76万 − 43万 = 33万 → 10% = 33,000 − 調整控除2,500 = 30,500
  assert.equal(residentTax(1_500_000, 1).incomeLevy, 30_500);
});

test('基準の一覧：金額と並び順', () => {
  const list = thresholds(1_000_000, { kyuchi: 1, rolling: { total: 1_060_000 } });
  assert.deepEqual(
    list.map((t) => [t.id, t.limit]),
    [
      ['resident', 1_190_000],
      ['insurance', 1_299_999],
      ['spouseDeduction', 1_360_000],
      ['specialFull', 1_690_000],
      ['incomeTax', 1_780_000],
      ['specialEnd', 2_070_000],
    ],
  );
  const ins = list.find((t) => t.id === 'insurance');
  assert.equal(ins.total, 1_060_000);
  assert.equal(ins.remaining, 239_999);
  assert.equal(thresholds(1_360_001)[2].over, true);
});

test('住民税：均等割の金額は設定で変えられる', () => {
  assert.equal(residentTax(1_150_000, 3, 5_000).tax, 5_000);
  assert.equal(residentTax(1_120_000, 3, 5_000).tax, 0);
});

test('社会保険の扶養：直近12か月の累計', () => {
  const year = (a, b) => Array.from({ length: 12 }, () => [a, b]);
  const prev = year(60_000, 40_000);
  const cur = year(null, null);
  cur[0] = [70_000, 40_000];
  cur[1] = [70_000, null];
  const r = rollingTotals(prev, cur, 5_000);
  // 1月：去年2〜12月（105,000×11）＋今年1月（115,000）
  assert.equal(r[0].total, 105_000 * 11 + 115_000);
  assert.equal(r[0].remaining, 1_299_999 - 1_270_000);
  // 2月：去年3〜12月（×10）＋今年1月＋2月（75,000）
  assert.equal(r[1].total, 105_000 * 10 + 115_000 + 75_000);
  assert.deepEqual([r[1].entered, r[2].entered, r[1].missingPrev], [true, false, 0]);
  // 未入力の月は0円として数える。12月は今年の分だけ
  assert.equal(r[11].total, 115_000 + 75_000);
  // 去年が未入力なら、足りない月の数がわかる
  assert.equal(rollingTotals(year(null, null), cur)[0].missingPrev, 11);
  assert.equal(rollingTotals(year(null, null), cur)[11].missingPrev, 0);
  // ちょうど130万円は超過
  assert.equal(rollingTotals(year(null, null), [[1_300_000, null], ...year(null, null).slice(1)])[0].over, true);
});
