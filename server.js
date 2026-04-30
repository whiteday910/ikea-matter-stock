const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

const PRODUCTS = [
  {
    id: '90620053',
    name: '그릴플랏스 세트',
    url: 'https://www.ikea.com/kr/ko/p/grillplats-plug-with-remote-control-smart-90620053/'
  },
  {
    id: '40641524',
    name: '빌레사 듀얼 버튼',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-white-smart-dual-button-40641524/'
  },
  {
    id: '80641522',
    name: '빌레사 듀얼버튼 3색 세트',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-kit-dual-button-mixed-colours-80641522/'
  },
  {
    id: '10641525',
    name: '빌레사 스크롤 버튼',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-white-smart-scroll-wheel-10641525/'
  },
  {
    id: '60641523',
    name: '빌레사 스크롤 3색 세트',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-kit-scroll-wheel-mixed-colours-60641523/'
  },
  {
    id: '00619450',
    name: '뮉스프라위 (모션센서)',
    url: 'https://www.ikea.com/kr/ko/p/myggspray-wireless-motion-sensor-smart-00619450/'
  },
  {
    id: '40617642',
    name: '뮈그베트 (도어센서)',
    url: 'https://www.ikea.com/kr/ko/p/myggbett-door-window-sensor-smart-40617642/'
  }
];

const TARGET_STORES = ['기흥점', '광명점', '강동점', '고양점', '동부산점'];

const IKEA_STORES_URL = 'https://www.ikea.com/kr/ko/meta-data/informera/stores-suggested-detailed.json';

const IKEA_HEADERS = {
  'x-client-id': 'b6c117e5-ae61-4ef5-b4cc-e0b1e37f0631',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.ikea.com',
  'Referer': 'https://www.ikea.com/'
};

const imageCache = {};

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { ...IKEA_HEADERS, ...extraHeaders } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchProductImage(product) {
  if (imageCache[product.id]) return imageCache[product.id];
  try {
    const res = await fetch(product.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    const html = await res.text();
    const m = html.match(/property="og:image"\s+content="([^"]+)"/);
    if (m) {
      // og:image is _s5 size; request smaller thumbnail
      const imgUrl = m[1].replace(/_s5\.jpg/, '_s3.jpg');
      imageCache[product.id] = imgUrl;
      return imgUrl;
    }
  } catch (err) {
    console.warn(`Image fetch failed for ${product.id}:`, err.message);
  }
  return null;
}

async function fetchStoreMap() {
  const stores = await fetchJson(IKEA_STORES_URL, { 'Accept': 'application/json, */*' });
  const map = {};
  for (const s of stores) {
    if (s.id && s.displayName) map[String(s.id)] = s.displayName.trim();
  }
  return map;
}

async function fetchAvailability(itemNo) {
  const url = `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${itemNo}&expand=StoresList,Restocks,SalesLocations`;
  return fetchJson(url);
}

function extractQuantity(availability) {
  const qty = availability?.buyingOption?.cashCarry?.availability?.quantity;
  return (qty !== undefined && qty !== null) ? qty : null;
}

// 서버 시작 시 이미지 프리패치 (백그라운드)
async function prefetchImages() {
  console.log('제품 이미지 프리패치 중...');
  await Promise.all(PRODUCTS.map(p => fetchProductImage(p)));
  console.log('이미지 프리패치 완료:', Object.keys(imageCache).length, '개');
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/debug/stores', async (req, res) => {
  try { res.json(await fetchJson(IKEA_STORES_URL, { 'Accept': 'application/json, */*' })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/debug/availability/:itemNo', async (req, res) => {
  try { res.json(await fetchAvailability(req.params.itemNo)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock', async (req, res) => {
  try {
    const [storeMap, ...availResults] = await Promise.all([
      fetchStoreMap(),
      ...PRODUCTS.map(p =>
        fetchAvailability(p.id).catch(e => ({ error: e.message, availabilities: [] }))
      )
    ]);

    // stock[매장명][제품id] = 수량
    // delivery[제품id] = true | false | null
    const stock = {};
    const delivery = {};
    TARGET_STORES.forEach(name => { stock[name] = {}; });

    PRODUCTS.forEach((product, pi) => {
      const result = availResults[pi];
      if (result.error) {
        console.warn(`Availability error for ${product.id}:`, result.error);
        delivery[product.id] = null;
        return;
      }
      delivery[product.id] = null;
      (result.availabilities || []).forEach(a => {
        const key = a.classUnitKey || {};
        // 국가 단위 항목(RU/KR)에서 배송 가능 여부 추출
        if (key.classUnitType === 'RU' && key.classUnitCode === 'KR') {
          delivery[product.id] = a.availableForHomeDelivery ?? null;
          return;
        }
        // 매장 단위 항목에서 재고 추출
        const storeCode = String(key.classUnitCode || '');
        const storeName = storeMap[storeCode];
        if (!storeName) return;
        const qty = extractQuantity(a);
        if (qty === null) return;
        const matched = TARGET_STORES.find(t => storeName.includes(t) || t.includes(storeName));
        if (matched) stock[matched][product.id] = qty;
      });
    });

    // 제품 목록에 이미지 URL 포함
    const productsWithImages = PRODUCTS.map(p => ({
      ...p,
      imageUrl: imageCache[p.id] || null
    }));

    res.json({
      products: productsWithImages,
      stores: TARGET_STORES,
      stock,
      delivery,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n이케아 재고 현황: http://localhost:${PORT}\n`);
  prefetchImages();
});
