// Google Mapsの地名抽出をテストするスクリプト

function extractPlaceName(fullAddress) {
  // 郵便番号を除去（例：〒100-0001 や 100-0001）
  let cleaned = fullAddress.replace(/〒?\d{3}-?\d{4}\s*/, '');
  
  // 都道府県を除去
  cleaned = cleaned.replace(/^(東京都|大阪府|京都府|北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)\s*/, '');
  
  // 市区町村を除去（一般的なパターン）
  cleaned = cleaned.replace(/^[^市区町村]+(市|区|町|村)\s*/, '');
  
  // 住所の数字部分を除去（例：1-1-1, 2-2-1など）
  cleaned = cleaned.replace(/^\d+-\d+-\d+\s*/, '');
  cleaned = cleaned.replace(/^\d+-\d+\s*/, '');
  cleaned = cleaned.replace(/^\d+\s*/, '');
  
  // さらに詳細な住所パターンを除去
  // 例：千代田1-1-1 → 千代田
  cleaned = cleaned.replace(/^([^0-9]+)\d+-\d+-\d+\s*/, '$1');
  cleaned = cleaned.replace(/^([^0-9]+)\d+-\d+\s*/, '$1');
  cleaned = cleaned.replace(/^([^0-9]+)\d+\s*/, '$1');
  
  // 最後の手段：カンマや句読点で分割して最後の部分（店舗名）を取得
  const parts = cleaned.split(/[,，、]/);
  const placeName = parts[parts.length - 1].trim();
  
  // 空の場合は元の文字列を返す
  return placeName || fullAddress;
}

// テストケース
const testCases = [
  "〒100-0001 東京都千代田区千代田1-1-1 皇居",
  "〒150-0001 東京都渋谷区神宮前1-1-1 明治神宮",
  "〒220-0012 神奈川県横浜市西区みなとみらい2-2-1 横浜ランドマークタワー",
  "〒530-0001 大阪府大阪市北区梅田1-1-1 大阪駅",
  "〒604-8001 京都府京都市下京区四条通寺町東入ル 錦市場",
  "〒150-0041 東京都渋谷区神南1-19-11 パルコ",
  "〒100-0005 東京都千代田区丸の内1-1-1 東京駅",
  "〒150-0001 東京都渋谷区神宮前1-1-1 原宿駅",
  "〒220-0012 神奈川県横浜市西区みなとみらい2-2-1 横浜みなとみらい駅",
  "〒530-0001 大阪府大阪市北区梅田1-1-1 梅田駅",
];

console.log("=== Google Maps地名抽出テスト ===\n");

testCases.forEach((testCase, index) => {
  const result = extractPlaceName(testCase);
  console.log(`${index + 1}. 入力: "${testCase}"`);
  console.log(`   結果: "${result}"`);
  console.log("");
});
