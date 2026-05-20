const nodemailer = require('nodemailer');
const fs = require('fs');

const STATE_FILE = 'notify-state.json';
const MAX_NOTIFICATIONS = 3;
const PRODUCT_ID = '00618950';
const PRODUCT_NAME = '팀메르플로테 (온습도센서)';
const API_URL = 'https://ikea-matter-stock.vercel.app/api/stock';
const TO_EMAIL = 'jhkim@elimsoft.co.kr';

async function main() {
  // 알림 전송 횟수 확인
  let state = { count: 0 };
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.log('상태 파일 없음, 초기화.');
  }

  if (state.count >= MAX_NOTIFICATIONS) {
    console.log(`이미 ${state.count}회 알림 발송 완료. 최대 횟수 도달, 종료.`);
    return;
  }

  // 재고 데이터 조회
  console.log('재고 데이터 조회 중...');
  let data;
  try {
    const res = await fetch(API_URL);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    console.error('API 호출 실패:', err.message);
    return;
  }

  // 팀메르플로테 재고 합산
  const totalStock = data.stores.reduce((sum, store) => {
    return sum + (data.stock[store]?.[PRODUCT_ID] || 0);
  }, 0);

  console.log(`${PRODUCT_NAME} 총 재고: ${totalStock}개`);

  if (totalStock === 0) {
    console.log('재고 없음. 알림 발송 안 함.');
    return;
  }

  // 매장별 재고 텍스트
  const storeLines = data.stores.map(store => {
    const qty = data.stock[store]?.[PRODUCT_ID];
    if (qty === undefined || qty === null) return `  ${store}: 정보 없음`;
    if (qty === 0) return `  ${store}: 품절`;
    return `  ${store}: ${qty}개`;
  }).join('\n');

  // 이메일 발송
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const notifyNum = state.count + 1;

  await transporter.sendMail({
    from: `이케아 재고알림 <${process.env.GMAIL_USER}>`,
    to: TO_EMAIL,
    subject: `[이케아 재고] ${PRODUCT_NAME} 입고! (${notifyNum}/${MAX_NOTIFICATIONS})`,
    text: [
      `${PRODUCT_NAME} 재고가 생겼습니다!`,
      '',
      '■ 매장별 재고',
      storeLines,
      '',
      '■ 사이트에서 확인',
      'https://ikea-matter-stock.vercel.app/',
      '',
      `(${notifyNum}/${MAX_NOTIFICATIONS}번째 알림 · 총 ${MAX_NOTIFICATIONS}회 발송 후 자동 중단)`,
    ].join('\n'),
  });

  console.log(`이메일 발송 완료 (${notifyNum}/${MAX_NOTIFICATIONS})`);

  // 상태 파일 업데이트
  state.count = notifyNum;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

main().catch(err => {
  console.error('오류 발생:', err);
  process.exit(1);
});
