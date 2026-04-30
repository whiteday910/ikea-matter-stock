# IKEA 매장별 재고 현황

한국 IKEA 매장의 Matter 스마트홈 제품 재고를 실시간으로 조회하는 웹 애플리케이션입니다.

![스크린샷](https://www.ikea.com/kr/ko/images/products/grillplats-plug-with-remote-control-smart__1486054_pe1002286_s3.jpg)

## 조회 매장

| 매장 | 지역 |
|------|------|
| IKEA 기흥점 | 경기도 용인시 |
| IKEA 광명점 | 경기도 광명시 |
| IKEA 강동점 | 서울특별시 강동구 |
| IKEA 고양점 | 경기도 고양시 |
| IKEA 동부산점 | 부산광역시 기장군 |

## 조회 제품

| 제품명 | 제품 번호 |
|--------|----------|
| 그릴플랏스 플러그+리모컨 세트 | 906.200.53 |
| 빌레사 듀얼 버튼 | 406.415.24 |
| 빌레사 듀얼버튼 3색 세트 | 806.415.22 |
| 빌레사 스크롤 버튼 | 106.415.25 |
| 빌레사 스크롤 3색 세트 | 606.415.23 |
| 뮉스프라위 무선 모션센서 | 006.194.50 |
| 뮈그베트 도어/창문 센서 | 406.176.42 |

## 주요 기능

- 7개 Matter 제품 × 5개 매장의 재고 수량 실시간 조회
- 제품 썸네일 이미지 자동 로딩
- 재고 수준에 따른 색상 구분 (초록 / 노랑 / 회색)
- 새로고침 버튼으로 최신 재고 확인
- 제품명 클릭 시 IKEA 제품 페이지 이동

## 기술 스택

- **Backend**: Node.js, Express
- **Frontend**: Vanilla HTML / CSS / JavaScript
- **데이터 출처**: IKEA Ingka Availability API

## 설치 및 실행

### 요구 사항

- Node.js 18 이상

### 실행 방법

```bash
# 의존성 설치
npm install

# 서버 시작
npm start
```

브라우저에서 `http://localhost:3000` 접속

개발 모드 (파일 변경 시 자동 재시작):

```bash
npm run dev
```

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/stock` | 전체 재고 현황 JSON |
| `GET /api/debug/stores` | 한국 IKEA 매장 목록 |
| `GET /api/debug/availability/:itemNo` | 특정 제품 원시 재고 데이터 |

### `/api/stock` 응답 예시

```json
{
  "products": [
    {
      "id": "90620053",
      "name": "그릴플랏스 세트",
      "url": "https://www.ikea.com/kr/ko/p/...",
      "imageUrl": "https://www.ikea.com/..."
    }
  ],
  "stores": ["기흥점", "광명점", "강동점", "고양점", "동부산점"],
  "stock": {
    "기흥점": { "90620053": 268 },
    "광명점": { "90620053": 407 }
  },
  "updatedAt": "2026-04-30T08:53:15.468Z"
}
```

## 재고 색상 기준

| 색상 | 의미 |
|------|------|
| 🟢 초록 | 30개 이상 |
| 🟡 노랑 | 1 ~ 29개 |
| ⚫ 회색 | 품절 (0개) |
| — | 정보 없음 |

## 라이선스

MIT
