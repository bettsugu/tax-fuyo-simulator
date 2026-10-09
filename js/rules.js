// 基準額と出どころ。実際の給与額はここに書かない（入力は端末の中だけに保存する）。
// 数字を変えるときは、出どころ（一次情報）と確認日も一緒に直す。

export const RULES = {
  year: 2026,
  label: '令和8年分（2026年1月〜12月に受け取る給与）',

  sources: {
    ntaAramashi: {
      title: '国税庁「令和8年4月 源泉所得税の改正のあらまし」1〜2ページ',
      url: 'https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf',
      checked: '2026-10-09',
    },
    ntaQa: {
      title: '国税庁「令和8年度税制改正（所得税の基礎控除の引上げ等関係）Q&A」令和8年5月',
      url: 'https://www.nta.go.jp/users/gensen/2026kiso/pdf/0026005-024.pdf',
      checked: '2026-10-09',
    },
    ntaRate: {
      title: '国税庁 タックスアンサー No.2260 所得税の税率（令和8年4月1日現在法令等）',
      url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
      checked: '2026-10-09',
    },
    soumu: {
      title: '総務省「個人住民税の基礎控除等について」（令和8年5月29日 個人住民税検討会 資料3）',
      url: 'https://www.soumu.go.jp/main_content/001075462.pdf',
      checked: '2026-10-09',
    },
    city: {
      // 級地と均等割の金額を確認。市町村の名前はここに書かない（公開するリポジトリのため）
      title: '住んでいる市の公式サイト「令和8年度個人住民税（市県民税）概要」',
      url: null,
      checked: '2026-10-09',
    },
    kyosai: {
      // 手元のPDFで確認。組合の名前はここに書かない（公開するリポジトリのため）
      title: '加入している共済組合「被扶養者認定に係る基準及び取扱い」令和8年度版',
      url: null,
      checked: '2026-10-09',
    },
  },

  // 給与所得控除の最低保障額（令和8・9年分）。出どころ：ntaAramashi (2)イ
  salaryDeductionMin: 740_000,

  // 基礎控除（令和8・9年分、居住者）。合計所得金額の上限ごと。出どころ：ntaAramashi (1)イ
  basicDeduction: [
    { upTo: 4_890_000, amount: 1_040_000 },
    { upTo: 6_550_000, amount: 670_000 },
    { upTo: 23_500_000, amount: 620_000 },
    { upTo: 24_000_000, amount: 480_000 },
    { upTo: 24_500_000, amount: 320_000 },
    { upTo: 25_000_000, amount: 160_000 },
    { upTo: Infinity, amount: 0 },
  ],

  // 所得税の速算表。出どころ：ntaRate
  incomeTaxTable: [
    { upTo: 1_949_000, rate: 0.05, minus: 0 },
    { upTo: 3_299_000, rate: 0.10, minus: 97_500 },
    { upTo: 6_949_000, rate: 0.20, minus: 427_500 },
    { upTo: 8_999_000, rate: 0.23, minus: 636_000 },
    { upTo: 17_999_000, rate: 0.33, minus: 1_536_000 },
    { upTo: 39_999_000, rate: 0.40, minus: 2_796_000 },
    { upTo: Infinity, rate: 0.45, minus: 4_796_000 },
  ],
  // 復興特別所得税（令和8年分は基準所得税額の2.1%）。出どころ：ntaRate
  reconstructionRate: 0.021,

  // 住民税（令和9年度分＝令和8年の所得にかかる分）。出どころ：soumu
  resident: {
    basicDeduction: 430_000,
    // 所得割がかからない所得の上限（扶養している家族がいない場合）
    incomeLevyExemptIncome: 450_000,
    // 均等割がかからない所得の上限。市町村の級地で変わる（扶養している家族がいない場合）
    perCapitaExemptIncome: { 1: 450_000, 2: 415_000, 3: 380_000 },
    rate: 0.10,
    // 均等割4,000円＋森林環境税1,000円が標準。上乗せのある県・市町村は画面の設定で直す
    perCapita: 5_000,
    // 調整控除：基礎控除の差（所得税と住民税）として法律で決められている額
    adjustBase: 50_000,
  },

  // 配偶者（納税者）側の控除にかかわる、本人の合計所得金額の区切り。出どころ：ntaAramashi (3)
  spouse: {
    // ここまでなら配偶者控除
    spouseDeductionIncome: 620_000,
    // ここまでなら配偶者特別控除が満額（38万円。配偶者の所得900万円以下の場合）
    specialFullIncome: 950_000,
    // ここを超えると配偶者特別控除がなくなる
    specialEndIncome: 1_330_000,
  },

  // 社会保険の扶養（被扶養者の認定）。出どころ：kyosai 2(4)、4(1)
  // 暦年で区切った判定ではない。労働条件通知書があれば「労働契約から見込まれる年間収入」、
  // なければ「過去1年間の総支給額（通勤手当を含む）の累計」で見る。
  // 画面の「あといくら」は1月〜12月の合計で出しているので、この基準については目安にとどまる。
  dependentInsurance: {
    limit: 1_300_000, // 年額130万円「未満」（配偶者の場合）
    monthly: 108_334, // 月額の目安。これ「未満」
    confirmed: true,
  },
};
