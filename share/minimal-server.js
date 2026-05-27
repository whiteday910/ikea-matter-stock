/**
 * IKEA 한국 재고 조회 - 최소 동작 예제
 *
 * 실행 방법:
 *   npm install express
 *   node minimal-server.js
 *
 * 브라우저에서 열기:
 *   http://localhost:3000/api/stock?items=50624741,90620053
 */

const express = require('express');
const app = express();

// -------------------------------------------------------
// 핵심: 이 헤더가 없으면 IKEA API에서 403 오류 발생
// -------------------------------------------------------
const IKEA_HEADERS = {
  'x-client-id': 'b6c117e5-ae61-4ef5-b4cc-e0b1e37f0631',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.ikea.com',
  'Referer': 'https://www.ikea.com/'
};

// 매장 ID → 이름 캐시
let storeMap = {};

// 매장 목록 로드
async function loadStores() {
  const res = await fetch(
    'https://www.ikea.com/kr/ko/meta-data/informera/stores-suggested-detailed.json',
    { headers: IKEA_HEADERS }
  );
  const stores = await res.json();
  stores.forEach(s => { storeMap[String(s.id)] = s.displayName; });
  console.log('매장 목록 로드 완료:', Object.values(storeMap));
}

// 재고 조회 API
app.get('/api/stock', async (req, res) => {
  const itemNos = req.query.items; // 쉼표 구분 제품번호
  if (!itemNos) return res.status(400).json({ error: 'items 파라미터 필요 (예: ?items=50624741,90620053)' });

  try {
    // 매장 목록이 아직 없으면 로드
    if (Object.keys(storeMap).length === 0) await loadStores();

    // IKEA 재고 API 호출
    const url = `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${itemNos}&expand=StoresList`;
    const stockRes = await fetch(url, { headers: IKEA_HEADERS, signal: AbortSignal.timeout(8000) });
    const stockData = await stockRes.json();

    // 결과 정리: { 매장이름: { 제품번호: 수량 } }
    const result = {};

    for (const a of (stockData.availabilities || [])) {
      // classUnitType === 'STO' 가 매장 재고
      if (a.classUnitKey?.classUnitType !== 'STO') continue;

      const storeName = storeMap[String(a.classUnitKey.classUnitCode)];
      if (!storeName) continue;

      const qty = a.buyingOption?.cashCarry?.availability?.quantity ?? null;
      if (qty === null) continue;

      if (!result[storeName]) result[storeName] = {};
      result[storeName][a.itemKey.itemNo] = qty;
    }

    res.json({ items: itemNos.split(','), stores: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('서버 실행 중: http://localhost:3000');
  console.log('테스트: http://localhost:3000/api/stock?items=50624741,90620053');
});
