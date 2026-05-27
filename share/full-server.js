/**
 * IKEA 한국 재고 조회 - 전체 예제
 *
 * 포함 기능:
 * - 여러 제품 동시 재고 조회
 * - 온라인 배송 가능 여부 (우편번호 기반)
 * - 제품 썸네일 이미지 URL (og:image 파싱, 메모리 캐싱)
 * - 서버 시작 시 이미지 프리패치
 *
 * 실행 방법:
 *   npm install express
 *   node full-server.js
 */

const express = require('express');
const app = express();
const PORT = 3000;

// -------------------------------------------------------
// 조회할 제품 목록 (제품번호 + 이름 + IKEA 페이지 URL)
// 제품번호는 IKEA 제품 페이지 URL 맨 끝 숫자
// -------------------------------------------------------
const PRODUCTS = [
  {
    id: '50624741',
    name: '그릴플랏스 (단품)',
    url: 'https://www.ikea.com/kr/ko/p/grillplats-plug-smart-50624741/'
  },
  {
    id: '90620053',
    name: '그릴플랏스 세트',
    url: 'https://www.ikea.com/kr/ko/p/grillplats-plug-with-remote-control-smart-90620053/'
  },
  // 제품 추가 시 여기에 계속 추가
];

// 체크할 매장 이름 (매장 목록 API의 displayName과 일치해야 함)
const TARGET_STORES = ['기흥점', '광명점', '강동점', '고양점', '동부산점'];

// 배송 가능 여부 체크용 우편번호 (매장별 대표 우편번호)
const DELIVERY_ZIPS = ['17086', '16938', '05203', '10551', '46084'];

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

// 이미지 URL 캐시 (서버 재시작 전까지 유지)
const imageCache = {};

// -------------------------------------------------------
// 유틸 함수
// -------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: IKEA_HEADERS,
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// 매장 ID → 이름 맵 반환
async function fetchStoreMap() {
  const stores = await fetchJson(
    'https://www.ikea.com/kr/ko/meta-data/informera/stores-suggested-detailed.json'
  );
  const map = {};
  stores.forEach(s => { map[String(s.id)] = s.displayName?.trim(); });
  return map;
}

// 전체 제품 재고 조회
async function fetchAllStock() {
  const itemNos = PRODUCTS.map(p => p.id).join(',');
  return fetchJson(
    `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${itemNos}&expand=StoresList`
  );
}

// 우편번호별 배송 가능 여부 조회
async function fetchDeliveryByZip(zip) {
  const itemNos = PRODUCTS.map(p => p.id).join(',');
  const data = await fetchJson(
    `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${itemNos}&expand=StoresList&zip=${zip}`
  );
  const result = {};
  for (const a of (data.availabilities || [])) {
    // classUnitType === 'RU' 가 배송 가능 여부
    if (a.classUnitKey?.classUnitType !== 'RU') continue;
    result[a.itemKey.itemNo] = a.availableForHomeDelivery ?? null;
  }
  return result;
}

// 제품 이미지 URL 가져오기 (og:image 파싱)
async function fetchProductImage(product) {
  if (imageCache[product.id]) return imageCache[product.id];
  try {
    const res = await fetch(product.url, {
      headers: {
        'User-Agent': IKEA_HEADERS['User-Agent'],
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      signal: AbortSignal.timeout(6000)
    });
    const html = await res.text();
    const match = html.match(/property="og:image"\s+content="([^"]+)"/);
    // _s5.jpg (원본) → _s3.jpg (썸네일)로 변환
    const imageUrl = match ? match[1].replace(/_s5\.jpg/, '_s3.jpg') : null;
    imageCache[product.id] = imageUrl;
    return imageUrl;
  } catch {
    return null;
  }
}

// 서버 시작 시 이미지 미리 캐싱 (첫 요청 속도 개선)
async function prefetchImages() {
  console.log('이미지 프리패치 중...');
  await Promise.all(PRODUCTS.map(p => fetchProductImage(p)));
  console.log('이미지 프리패치 완료');
}

// -------------------------------------------------------
// API 엔드포인트
// -------------------------------------------------------

app.get('/api/stock', async (req, res) => {
  try {
    // 재고·배송·이미지를 모두 병렬로 조회 (순차 X → 속도 최적화)
    const [storeMap, stockData, images, ...deliveryResults] = await Promise.all([
      fetchStoreMap(),
      fetchAllStock().catch(e => ({ error: e.message, availabilities: [] })),
      Promise.all(PRODUCTS.map(p => fetchProductImage(p))),
      ...DELIVERY_ZIPS.map(zip => fetchDeliveryByZip(zip).catch(() => ({})))
    ]);

    // 매장별 재고 정리
    const stock = {};
    TARGET_STORES.forEach(name => { stock[name] = {}; });

    for (const a of (stockData.availabilities || [])) {
      if (a.classUnitKey?.classUnitType !== 'STO') continue;
      const storeName = storeMap[String(a.classUnitKey.classUnitCode)];
      const qty = a.buyingOption?.cashCarry?.availability?.quantity ?? null;
      if (!storeName || qty === null) continue;
      const matched = TARGET_STORES.find(t => storeName.includes(t) || t.includes(storeName));
      if (matched) stock[matched][a.itemKey.itemNo] = qty;
    }

    // 배송 가능 여부 정리 (5개 우편번호 기준)
    const delivery = {};
    PRODUCTS.forEach((product, i) => {
      const checks = deliveryResults.map(r => r[product.id]);
      const valid = checks.filter(v => v !== null && v !== undefined);
      if (valid.length === 0) { delivery[product.id] = null; return; }
      const available = valid.filter(v => v === true).length;
      delivery[product.id] = available === valid.length ? 'all'
                            : available > 0             ? 'partial'
                            :                            'none';
    });

    // 제품 정보에 이미지 URL 합치기
    const products = PRODUCTS.map((p, i) => ({ ...p, imageUrl: images[i] }));

    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=3600');
    res.json({
      products,
      stores: TARGET_STORES,
      stock,
      delivery,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 정적 파일 서빙 (프론트엔드 HTML 파일이 있을 경우)
// app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`재고 확인: http://localhost:${PORT}/api/stock`);
  prefetchImages();
});
