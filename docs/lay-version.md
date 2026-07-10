# Hướng dẫn lấy version của app từ Google Play

Tài liệu này giải thích cách dùng method `version()` để lấy **phiên bản (version)**
của một app trên Google Play, và vì sao việc này lại không đơn giản như tưởng.

## TL;DR

```javascript
import gplay from '@longhaizz/google-play-scraper';

const result = await gplay.version({
  appId: 'org.telegram.messenger',
  requestOptions: {
    headers: { cookie: '<cookie play.google.com đã đăng nhập>' }
  }
});

console.log(result.version); // '12.8.3'
```

Không có cookie đăng nhập thì `version` sẽ là `null`. Đọc tiếp để hiểu tại sao.

---

## Vì sao lấy version lại khó

Google Play **không còn** hiển thị một con số version chung cho request ẩn danh.

- App đóng gói kiểu **App Bundle** (Telegram, WhatsApp, Spotify, và hầu hết app lớn)
  hiển thị **"Varies with device"** ở mục Version chung. Method `app()` sẽ trả
  `version: "VARY"` cho những app này.
- App đóng gói **APK đơn** (thường là app nhỏ) vẫn còn version chung, và `app()`
  lấy được bình thường — ví dụ `net.osmand` → `"5.3.10"`.

Version thật của từng máy nằm trong mục **"Compatibility for your active devices"**
trên trang app. Mục này **chỉ xuất hiện khi request kèm cookie của một tài khoản
Google đã đăng nhập và có thiết bị đã đăng ký**. Request ẩn danh không bao giờ
nhận được dữ liệu này — nó không tồn tại trong HTML trả về.

Đó là lý do `version()` cần cookie.

---

## Cài đặt

```bash
npm install github:longhaizz/google-play-scraper
```

---

## Bước 1 — Lấy cookie đăng nhập

1. Mở [play.google.com](https://play.google.com) trên Chrome, **đăng nhập** bằng
   tài khoản Google **có thiết bị đã đăng ký** (điện thoại bạn đang dùng).
2. Nhấn `F12` mở DevTools → tab **Network**.
3. Reload trang một app bất kỳ (ví dụ trang chi tiết Telegram).
4. Trong danh sách request, click vào request `details?id=...`.
5. Kéo tới phần **Request Headers**, tìm dòng `cookie:` và **copy toàn bộ giá trị**
   của nó (một chuỗi dài gồm `SID=...; HSID=...; SAPISID=...; ...`).

> ⚠️ Cookie này cho phép truy cập tài khoản Google của bạn. Đừng commit lên git,
> đừng chia sẻ. Nếu lỡ lộ, vào **Google Account → Security → Sign out of all
> devices** để vô hiệu hoá.

---

## Bước 2 — Gọi `version()`

### Tuỳ chọn

| Tên | Bắt buộc | Mô tả |
|---|---|---|
| `appId` | ✅ | Google Play id của app (phần `?id=` trên URL) |
| `requestOptions.headers.cookie` | (cần để có dữ liệu thật) | Cookie phiên đăng nhập |
| `lang` | ❌ | Mã ngôn ngữ 2 chữ, mặc định `'en'` |
| `country` | ❌ | Mã quốc gia 2 chữ, mặc định `'us'` |
| `throttle` | ❌ | Giới hạn số request/giây (nên đặt khi quét nhiều app) |

### Ví dụ

```javascript
import gplay from '@longhaizz/google-play-scraper';
import fs from 'fs';

// Đọc cookie từ file (nhớ thêm file này vào .gitignore)
const cookie = fs.readFileSync('.cookies.txt', 'utf8').trim();

const result = await gplay.version({
  appId: 'org.telegram.messenger',
  requestOptions: { headers: { cookie } }
});

console.log(result);
```

---

## Kết quả trả về

```javascript
{
  appId: 'org.telegram.messenger',
  version: '12.8.3',          // versionName cao nhất trong các thiết bị tương thích
  devices: [
    {
      device: 'Redmi 2201117TG',
      lastUsed: 'July 8, 2026',
      versionCode: 41161708,
      versionName: '12.8.3',
      compatible: true
    },
    {
      device: 'Google Sdk_gphone16k_x86_64',
      lastUsed: 'June 20, 2026',
      versionCode: 41063392,
      versionName: '12.8.3',
      compatible: true
    },
    {
      device: 'Google Android SDK Built For X86',
      lastUsed: 'May 5, 2026',
      versionCode: undefined,
      versionName: undefined,
      compatible: false        // "Does not work on your device"
    }
  ]
}
```

- `version`: version cao nhất trong số các thiết bị **tương thích**. Đây là giá trị
  bạn thường cần.
- `devices`: chi tiết từng thiết bị trong tài khoản. Thiết bị không tương thích có
  `versionName: undefined` và `compatible: false`.

---

## Các trường hợp cần lưu ý

### App APK đơn — có thể không cần cookie

Với app đóng gói APK đơn, method `app()` đã trả version thật rồi, không cần cookie:

```javascript
const app = await gplay.app({ appId: 'net.osmand' });
console.log(app.version); // '5.3.10'
```

Nếu `app().version` khác `"VARY"`, dùng luôn giá trị đó là đủ.

### Gọi `version()` mà không có cookie

Trả về `null` một cách sạch sẽ, **không ném lỗi**:

```javascript
const r = await gplay.version({ appId: 'org.telegram.messenger' });
// { appId: 'org.telegram.messenger', version: null, devices: [] }
```

### Quét nhiều app — nhớ throttle

```javascript
for (const appId of danhSachApp) {
  const r = await gplay.version({
    appId,
    requestOptions: { headers: { cookie } },
    throttle: 3 // tối đa 3 request/giây
  });
  console.log(appId, r.version);
}
```

---

## Phương án dự phòng: suy version từ reviews

Nếu không muốn dùng cookie, có thể **suy đoán** version từ các review gần nhất —
mỗi review có kèm version mà người dùng đang chạy. Đây chỉ là ước lượng thống kê,
**không chính xác tuyệt đối**, và **thất bại với app có ít/không có review**.

```javascript
function compareVersionDesc (a, b) {
  const pa = String(a).split(/[.\s(]/).map(Number);
  const pb = String(b).split(/[.\s(]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return y - x;
  }
  return 0;
}

async function guessVersionFromReviews (appId) {
  const { data } = await gplay.reviews({
    appId, sort: gplay.sort.NEWEST, num: 150
  });
  const versions = [...new Set(data.map(r => r.version).filter(Boolean))];
  return versions.length ? versions.sort(compareVersionDesc)[0] : null;
}
```

---

## Giới hạn & cảnh báo

- **Cookie hết hạn.** Cookie phiên Google không tồn tại mãi; pipeline sẽ chết định
  kỳ và cần lấy cookie mới.
- **Rủi ro tài khoản.** Dùng tài khoản cá nhân để scrape hàng loạt có thể khiến
  Google gắn cờ hoặc khoá tài khoản, và vi phạm Điều khoản dịch vụ của Play Store.
- **Dữ liệu là của thiết bị bạn.** `version` là bản build cho các thiết bị trong
  tài khoản bạn. Với app đa biến thể, máy khác có thể nhận version khác.
- **Parser dễ vỡ.** Toàn bộ thư viện scrape HTML nên sẽ hỏng khi Google đổi layout.
  Method `version()` phụ thuộc thêm vào field 128 và cookie nên còn mong manh hơn.

Nếu cần version chính xác, ổn định, ở quy mô lớn cho **production**, hãy dùng
**Play Store protobuf API** (cách mà Aurora Store / thư viện `gpapi` dùng) thay vì
scrape HTML kèm cookie. Với app bạn **sở hữu**, dùng Google Play Developer API.

---

## Chi tiết kỹ thuật (cho người muốn đào sâu)

Version nằm ở **field 128** trong payload chi tiết app (RPC `Ws7gDc`), theo đường
dẫn `[1, 2, 128, 0, <chỉ-số-thiết-bị>, 6, 3]`. Cấu trúc mỗi thiết bị:

```
[gaiaId, null, null, 6, "Tên thiết bị", "Ngày", [null, null, versionCode, versionName, minSdk], 0, 0]
```

Chỉ số khối `ds:*` **thay đổi** giữa ẩn danh và đăng nhập (ẩn danh ở `ds:5`, đăng
nhập ở `ds:7`), nên [lib/version.js](../lib/version.js) tìm khối theo **hình dạng**
(khối có title là chuỗi và field 128 là mảng) thay vì hardcode chỉ số.

Xem thêm code: [lib/version.js](../lib/version.js).
