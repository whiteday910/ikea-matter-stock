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

// One zip code per store region — used to check real-time delivery coverage
const DELIVERY_ZIPS = ['17086', '16938', '05203', '10551', '46084'];

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

async function fetchAllStock() {
  const itemNos = PRODUCTS.map(p => p.id).join(',');
  const url = `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${itemNos}&expand=StoresList`;
  return fetchJson(url);
}

async function fetchDeliveryByZip(zip) {
  const itemNos = PRODUCTS.map(p => p.id).join(',');
  const url = `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${itemNos}&expand=StoresList&zip=${zip}`;
  const data = await fetchJson(url);
  const result = {};
  for (const a of (data.availabilities || [])) {
    if (a.classUnitKey?.classUnitType === 'RU') {
      result[a.itemKey.itemNo] = a.availableForHomeDelivery ?? null;
    }
  }
  return result;
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
  try {
    const url = `https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos=${req.params.itemNo}&expand=StoresList,Restocks,SalesLocations`;
    res.json(await fetchJson(url));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock', async (req, res) => {
  try {
    const [storeMap, stockData, ...deliveryByZip] = await Promise.all([
      fetchStoreMap(),
      fetchAllStock().catch(e => ({ error: e.message, availabilities: [] })),
      ...DELIVERY_ZIPS.map(zip => fetchDeliveryByZip(zip).catch(() => ({})))
    ]);

    // stock[매장명][제품id] = 수량
    const stock = {};
    TARGET_STORES.forEach(name => { stock[name] = {}; });

    if (!stockData.error) {
      (stockData.availabilities || []).forEach(a => {
        const key = a.classUnitKey || {};
        if (key.classUnitType !== 'STO') return;
        const storeName = storeMap[String(key.classUnitCode || '')];
        if (!storeName) return;
        const qty = extractQuantity(a);
        if (qty === null) return;
        const matched = TARGET_STORES.find(t => storeName.includes(t) || t.includes(storeName));
        if (matched) stock[matched][a.itemKey.itemNo] = qty;
      });
    }

    // delivery[제품id] = 'all' | 'partial' | 'none' | null
    // 지역별 배송 가능 여부: 5개 대표 우편번호 기준
    const delivery = {};
    PRODUCTS.forEach(product => {
      const checks = deliveryByZip.map(zipResult => zipResult[product.id]);
      const valid = checks.filter(v => v !== null && v !== undefined);
      if (valid.length === 0) { delivery[product.id] = null; return; }
      const available = valid.filter(v => v === true).length;
      if (available === valid.length) delivery[product.id] = 'all';
      else if (available > 0)        delivery[product.id] = 'partial';
      else                           delivery[product.id] = 'none';
    });

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
