const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

const PRODUCTS = [
  // 인기순 정렬 (IKEA 제품 페이지 리뷰 수 기준)
  {
    id: '70509820',
    name: '라다 (AAA 충전지)',
    url: 'https://www.ikea.com/kr/ko/p/ladda-rechargeable-battery-hr03-aaa-1-2v-70509820/',
    coupangUrl: 'https://link.coupang.com/a/eBaPOd'
  },
  {
    id: '40641524',
    name: '빌레사 듀얼 버튼',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-white-smart-dual-button-40641524/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13337710508'
  },
  {
    id: '00619450',
    name: '뮉스프라위 (모션센서)',
    url: 'https://www.ikea.com/kr/ko/p/myggspray-wireless-motion-sensor-smart-00619450/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13328606530'
  },
  {
    id: '10641525',
    name: '빌레사 스크롤 버튼',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-white-smart-scroll-wheel-10641525/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13337815597'
  },
  {
    id: '40617642',
    name: '뮈그베트 (도어센서)',
    url: 'https://www.ikea.com/kr/ko/p/myggbett-door-window-sensor-smart-40617642/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13332262394'
  },
  {
    id: '10569845',
    name: '인스펠닝 (스마트플러그)',
    url: 'https://www.ikea.com/kr/ko/p/inspelning-plug-smart-energy-monitor-10569845/'
  },
  {
    id: '70617768',
    name: '클리프보크 (누수센서)',
    url: 'https://www.ikea.com/kr/ko/p/klippbok-water-leakage-sensor-smart-70617768/'
  },
  {
    id: '80547572',
    name: '트로드프리 (E26 스타터킷 CCT)',
    url: 'https://www.ikea.com/kr/ko/p/tradfri-starter-kit-smart-wireless-dimmable-white-spectrum-80547572/',
    lastChance: true
  },
  {
    id: '10619548',
    name: '카이플랏스 (E26 컬러 스타터키트)',
    url: 'https://www.ikea.com/kr/ko/p/kajplats-starter-kit-smart-colour-and-white-spectrum-10619548/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13329601861'
  },
  {
    id: '60619273',
    name: '카이플랏스 (E26 컬러 단품)',
    url: 'https://www.ikea.com/kr/ko/p/kajplats-led-bulb-e26-1055-lumen-smart-colour-and-white-spectrum-globe-opal-white-60619273/'
  },
  {
    id: '80641522',
    name: '빌레사 듀얼버튼 3색 세트',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-kit-dual-button-mixed-colours-80641522/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13395747329'
  },
  {
    id: '60619126',
    name: '카이플랏스 (E26 CCT 스타터키트)',
    url: 'https://www.ikea.com/kr/ko/p/kajplats-starter-kit-smart-white-spectrum-60619126/'
  },
  {
    id: '50624741',
    name: '그릴플랏스 (단품)',
    url: 'https://www.ikea.com/kr/ko/p/grillplats-plug-smart-50624741/'
  },
  {
    id: '60641523',
    name: '빌레사 스크롤 3색 세트',
    url: 'https://www.ikea.com/kr/ko/p/bilresa-remote-control-kit-scroll-wheel-mixed-colours-60641523/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13395362271'
  },
  {
    id: '60539163',
    name: '트로드프리 (E26 470루멘 CCT)',
    url: 'https://www.ikea.com/kr/ko/p/tradfri-led-bulb-e26-470-lumen-smart-wireless-dimmable-warm-white-globe-60539163/'
  },
  {
    id: '90620053',
    name: '그릴플랏스 세트',
    url: 'https://www.ikea.com/kr/ko/p/grillplats-plug-with-remote-control-smart-90620053/',
    naverStoreUrl: 'https://smartstore.naver.com/nemonemotte/products/13318414935'
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

const productCache = {}; // { imageUrl, lastChance }

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { ...IKEA_HEADERS, ...extraHeaders },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchProductInfo(product) {
  if (productCache[product.id]) return productCache[product.id];
  try {
    const res = await fetch(product.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      signal: AbortSignal.timeout(6000)
    });
    const html = await res.text();
    const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
    // og:image is _s5 size; request smaller thumbnail
    const imageUrl = imgMatch ? imgMatch[1].replace(/_s5\.jpg/, '_s3.jpg') : null;
    // 내비게이션 메뉴에도 "마지막 기회" 텍스트가 있으므로 배지 전용 CSS 클래스로 판별
    const lastChance = /pipf-commercial-message--last-chance|"variant":"last-chance"/.test(html);
    productCache[product.id] = { imageUrl, lastChance };
    return productCache[product.id];
  } catch (err) {
    console.warn(`Product info fetch failed for ${product.id}:`, err.message);
    return { imageUrl: null, lastChance: false };
  }
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

// 서버 시작 시 제품 정보 프리패치 (백그라운드)
async function prefetchImages() {
  console.log('제품 정보 프리패치 중...');
  await Promise.all(PRODUCTS.map(p => fetchProductInfo(p)));
  console.log('제품 정보 프리패치 완료:', Object.keys(productCache).length, '개');
}

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    }
  }
}));

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
    const [storeMap, stockData, productsWithInfo, ...deliveryByZip] = await Promise.all([
      fetchStoreMap(),
      fetchAllStock().catch(e => ({ error: e.message, availabilities: [] })),
      Promise.all(PRODUCTS.map(async p => {
        const { imageUrl, lastChance } = await fetchProductInfo(p);
        return { ...p, imageUrl, lastChance: p.lastChance || lastChance };
      })),
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

    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=3600');
    res.json({
      products: productsWithInfo,
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n이케아 재고 현황: http://localhost:${PORT}\n`);
    prefetchImages();
  });
} else {
  module.exports = app;
  prefetchImages(); // Vercel 콜드스타트 시 이미지 캐시 워밍
}
