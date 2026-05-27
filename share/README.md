# IKEA 한국 재고 API 활용 가이드

이 문서는 이케아 한국 매장의 실시간 재고 정보를 가져오는 방법을 설명합니다.
`ikea-matter-stock` 프로젝트의 실제 동작 코드를 기반으로 정리했습니다.

---

## 핵심 원칙: 반드시 백엔드에서 호출해야 합니다

브라우저(프론트엔드)에서 직접 IKEA API를 호출하면 **CORS 오류**가 발생합니다.
반드시 **서버(Node.js, Python, etc.)** 에서 호출한 뒤, 그 결과를 프론트엔드에 전달해야 합니다.

```
브라우저 → 내 서버 → IKEA API
           (여기서만 IKEA API 호출 가능)
```

---

## 필수 요청 헤더

모든 IKEA API 호출에 아래 헤더를 포함해야 합니다.
특히 `x-client-id`가 없으면 403 오류가 납니다.

```
x-client-id: b6c117e5-ae61-4ef5-b4cc-e0b1e37f0631
Accept: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
Origin: https://www.ikea.com
Referer: https://www.ikea.com/
```

---

## API 엔드포인트

### 1. 매장별 재고 조회

```
GET https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos={제품번호들}&expand=StoresList
```

- `itemNos`: 제품번호를 쉼표로 구분 (예: `50624741,90620053,00618950`)
- 한 번에 여러 제품 조회 가능

**응답 구조:**
```json
{
  "availabilities": [
    {
      "itemKey": { "itemNo": "50624741" },
      "classUnitKey": {
        "classUnitType": "STO",
        "classUnitCode": "476"
      },
      "buyingOption": {
        "cashCarry": {
          "availability": {
            "quantity": 15
          }
        }
      }
    }
  ]
}
```

- `classUnitType === "STO"` 인 항목만 매장 재고
- `classUnitCode`가 매장 ID (숫자) → 매장 이름으로 변환 필요 (아래 API 참고)
- `buyingOption.cashCarry.availability.quantity`가 재고 수량

---

### 2. 매장 목록 조회 (매장 ID → 매장 이름 변환용)

```
GET https://www.ikea.com/kr/ko/meta-data/informera/stores-suggested-detailed.json
```

**응답 구조:**
```json
[
  { "id": 476, "displayName": "기흥점" },
  { "id": 452, "displayName": "광명점" },
  { "id": 477, "displayName": "강동점" },
  { "id": 506, "displayName": "고양점" },
  { "id": 514, "displayName": "동부산점" }
]
```

---

### 3. 우편번호별 온라인 배송 가능 여부 조회

```
GET https://api.ingka.ikea.com/cia/availabilities/ru/kr?itemNos={제품번호들}&expand=StoresList&zip={우편번호}
```

**응답에서 배송 가능 여부 추출:**
```js
// classUnitType === "RU" 인 항목
availability.availableForHomeDelivery // true / false
```

**한국 주요 지역 우편번호 (매장 근처):**
| 매장 | 우편번호 |
|------|---------|
| 기흥점 | 17086 |
| 광명점 | 16938 |
| 강동점 | 05203 |
| 고양점 | 10551 |
| 동부산점 | 46084 |

---

### 4. 제품 이미지 가져오기

IKEA 이미지 API는 없습니다. 제품 페이지 HTML에서 og:image 태그를 파싱해야 합니다.

```
GET https://www.ikea.com/kr/ko/p/{제품-슬러그-{제품번호}}/
```

HTML에서 추출:
```js
const match = html.match(/property="og:image"\s+content="([^"]+)"/);
const imageUrl = match[1].replace(/_s5\.jpg/, '_s3.jpg'); // 썸네일 크기로 변환
```

> 이 작업은 요청마다 반복하면 느립니다. 서버 시작 시 한 번만 가져와서 메모리에 캐싱하세요.

---

## 제품번호 찾는 방법

IKEA 제품 페이지 URL 맨 끝 숫자가 제품번호입니다.

```
https://www.ikea.com/kr/ko/p/grillplats-plug-smart-50624741/
                                                    ^^^^^^^^
                                                    제품번호: 50624741
```

---

## 파일 목록

| 파일 | 설명 |
|------|------|
| `README.md` | 이 문서 |
| `minimal-server.js` | 최소한의 동작 예제 (Node.js + Express) |
| `full-server.js` | 실제 서비스 수준의 전체 예제 |
