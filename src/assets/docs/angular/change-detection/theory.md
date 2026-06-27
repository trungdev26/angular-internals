# ChangeDetection trong Angular

Tài liệu trình bày cơ chế Change Detection (CD) trong Angular: cách Angular đồng bộ dữ liệu với DOM, chi phí phát sinh ở từng bước, cách đo đạc, cách xác định nguyên nhân lag và các hướng tối ưu phổ biến (`OnPush`, `trackBy`/`track`, pure pipe, `runOutsideAngular`, ViewModel hoá, virtual scroll).

Các phần được tổ chức theo trình tự: cơ chế gốc → chi phí phát sinh → cách đo → cách phân tích nguyên nhân → cách tối ưu → trade-off.

---

## 1. Change Detection là gì

### 1.1. Vấn đề: đồng bộ dữ liệu trong memory với DOM

Trong JavaScript thuần, thay đổi một biến không tự động làm DOM thay đổi:

```html
<p id="counter">0</p>
<button id="btn">+1</button>
```

```js
let counter = 0;

document.getElementById('btn').addEventListener('click', () => {
  counter++;
  // Nếu không có dòng dưới, <p id="counter"> vẫn hiển thị "0"
  document.getElementById('counter').textContent = counter;
});
```

Lập trình viên phải tự đọc lại `counter` và gán vào `textContent` mỗi khi giá trị đổi — đó là cách DOM hoạt động "thuần", không có gì tự động.

Angular cho viết khai báo (declarative) thay vì làm thủ công:

```ts
@Component({
  selector: 'app-counter',
  template: `
    <p>{{ counter }}</p>
    <button (click)="increment()">+1</button>
  `
})
export class CounterComponent {
  counter = 0;

  increment() {
    this.counter++;
  }
}
```

Khi viết `{{ counter }}` trong template, không cần gọi `document.getElementById(...).textContent = ...`. Nhưng Angular phải biết `counter` đã đổi từ `0` thành `1` để cập nhật `<p>` — đó là việc Change Detection làm.

Diễn biến khi user click:

```text
1. User click button
2. Event handler increment() chạy
3. this.counter đổi từ 0 thành 1 (trong memory)
   → tại bước này, <p> trên màn hình VẪN còn hiển thị "0"
4. Angular chạy Change Detection
5. Angular đọc lại biểu thức {{ counter }}, thấy giá trị mới là 1
6. Angular so sánh với giá trị cũ đã render (0)
7. Khác nhau → Angular cập nhật <p> thành "1"
```

Bước 4-7 là Change Detection: cơ chế Angular dùng để phát hiện "có gì trong component đã đổi" và đồng bộ lại DOM cho khớp. Nếu không có bước này, `this.counter` trong memory đã là `1` nhưng `<p>` vẫn hiển thị `0` — giống ví dụ JavaScript thuần khi quên dòng cập nhật `textContent`.

### 1.2. Binding — các điểm Angular cần đọc lại

**Binding** là một biểu thức trong template gắn với dữ liệu/hàm của component. Change Detection thực chất là việc Angular đi qua tất cả binding trong template và đọc lại giá trị của chúng. Các loại binding phổ biến:

| Loại binding | Cú pháp | Ý nghĩa |
|---|---|---|
| Interpolation | `{{ item.name }}` | Hiển thị giá trị ra DOM dưới dạng text |
| Property/attribute binding | `[class.warning]="item.isWarning"` | Gán giá trị cho property, attribute, class hoặc style của element |
| Event binding | `(click)="save()"` | Gọi method khi event xảy ra — không phải thứ Change Detection "đọc lại", nhưng thường là nơi data bắt đầu thay đổi |
| Component input binding | `[row]="item"` | Truyền dữ liệu xuống component con qua `@Input` |

```html
{{ item.name }}
<span [class.warning]="item.isWarning"></span>
<button (click)="save()">Lưu</button>
<app-row [row]="item"></app-row>
```

Đoạn template trên có 1 interpolation, 1 property binding, 1 event binding và 1 input binding. Một component thực tế có thể có hàng chục binding như vậy; mỗi lần Change Detection chạy, Angular lần lượt đọc lại từng binding này.

### 1.3. Cơ chế: đọc lại binding và so sánh

Angular giữ một cây component — mỗi component có template, mỗi template có nhiều binding như ở [§1.2](#12-binding--các-điểm-angular-cần-đọc-lại). Mỗi lần Change Detection chạy, Angular đi qua các component cần kiểm tra, đọc lại binding, so với giá trị đã render lần trước, nếu khác thì cập nhật DOM:

```text
Data trong component
        ↓
Binding trong template
        ↓
Angular đọc lại binding
        ↓
So với giá trị cũ
        ↓
Khác thì cập nhật DOM
```

Ví dụ counter ở [§1.1](#11-vấn-đề-đồng-bộ-dữ-liệu-trong-memory-với-dom) chỉ có một binding (`{{ counter }}`). Trong thực tế một component có nhiều binding, và Change Detection đọc lại toàn bộ chúng theo cùng quy trình trên.

### 1.4. Hai loại chi phí: check cost và DOM update cost

Change Detection không đồng nghĩa với "render lại toàn bộ DOM". Nó gồm 2 phần chi phí:

```text
1. Check cost
   Angular chạy qua component, đọc binding, gọi expression/method trong template, so sánh giá trị.

2. DOM update cost
   Nếu giá trị khác, Angular cập nhật DOM tương ứng.
```

Dù DOM không đổi, Angular vẫn có thể đã tốn chi phí **check**. Ví dụ:

```html
<td>{{ calculateRiskScore(row) }}</td>
```

Nếu component bị check 100 lần, `calculateRiskScore(row)` có thể bị gọi 100 lần dù kết quả không đổi và DOM không cập nhật. Đây là nguồn lag phổ biến trong thực tế.

---

## 2. Một tick Change Detection

Một lượt Angular chạy Change Detection gọi là một **tick** (hoặc **CD cycle**).

Với cây component:

```text
AppComponent
├── HeaderComponent
├── ReceptionListComponent
│   ├── FilterComponent
│   ├── PatientTableComponent
│   │   ├── PatientRowComponent x 500
│   │   └── StatusBadgeComponent x 500
│   └── PagingComponent
└── FooterComponent
```

Với strategy mặc định `Default`, mỗi tick Angular đi từ gốc xuống các component con và kiểm tra binding:

```text
Tick xảy ra
  ↓
AppComponent được check
  ↓
Header được check
  ↓
ReceptionList được check
  ↓
Filter được check
  ↓
PatientTable được check
  ↓
500 PatientRow được check
  ↓
500 StatusBadge được check
```

Nếu mỗi row có 20 binding, 500 row là 10.000 binding. Method call trong template, pipe nặng, hoặc nhiều tầng component con làm chi phí tăng nhanh.

### 2.1. Công thức ước lượng chi phí

```text
Tổng chi phí ≈ số tick × số component bị check × số binding mỗi component × độ nặng của từng binding
```

Hoặc:

```text
Lag = tick nhiều + cây bị quét rộng + binding nặng + DOM nhiều + browser phải layout/paint nhiều
```

Mỗi giải pháp tối ưu nhắm vào một loại chi phí khác nhau:

| Giải pháp | Giảm cái gì? |
|---|---|
| `OnPush` | Giảm số component/subtree bị check |
| Pure pipe | Giảm tính toán lại trong component đã bị check |
| `trackBy` / `track` | Giảm xoá/tạo DOM node khi list thay đổi |
| Virtual scroll | Giảm số DOM node thật đang tồn tại |
| `runOutsideAngular` | Giảm số tick không cần thiết do async/event/timer |
| Debounce/throttle | Giảm tần suất event dẫn tới tick hoặc xử lý nặng |
| Tính trước data (ViewModel) | Giảm logic nặng trong template |

---

## 3. Zone.js và NgZone

Dữ liệu component thay đổi bằng câu lệnh JavaScript thông thường, ví dụ `this.count++` — câu lệnh này chỉ đổi giá trị trong memory, **không tự gọi Change Detection** ([§4.3](#43-binding-thay-đổi-không-tự-gây-change-detection)).

Vấn đề là câu lệnh đổi dữ liệu có thể nằm ở bất kỳ đâu trong code:

```text
- Event handler (click, input, keydown...)
- Callback setTimeout/setInterval
- .then() của Promise / async-await
- Response của HTTP request
```

Angular không theo dõi trực tiếp từng property để biết khi nào nó đổi.

**Quan sát**: hầu hết thay đổi dữ liệu xảy ra trong một đoạn code bất đồng bộ hoặc một event. Nếu biết được *thời điểm* các đoạn code đó vừa chạy xong, Angular có thể chạy Change Detection ngay sau đó — không cần biết trước *property nào* đã đổi:

```text
Đoạn code bất đồng bộ/event chạy xong
  ↓
Angular chạy Change Detection
  ↓
Quét lại binding (§1.3) → tự tìm ra phần cần cập nhật DOM
```

**Zone.js là thư viện cung cấp cho Angular thông tin về thời điểm đó** — nó theo dõi các API bất đồng bộ phổ biến và báo cho Angular biết khi một đoạn code/event như vậy vừa chạy xong, tức thời điểm "*có khả năng* dữ liệu đã thay đổi, nên kiểm tra lại".

- Zone.js **không** xác định *property nào* đã đổi hay *component nào* cần cập nhật.
- Việc đó thuộc về Change Detection ([§1](#1-change-detection-là-gì)–[§2](#2-một-tick-change-detection)).

Cơ chế cụ thể được trình bày trong các phần dưới đây.

### 3.1. Zone.js: theo dõi async/event, không theo dõi data

```ts
setTimeout(() => {
  this.count++;
}, 1000);
```

Khi callback trên chạy xong, `this.count` đã đổi trong memory, nhưng Angular không có cách trực tiếp để biết điều đó — Angular chỉ có thể biết **một callback bất đồng bộ vừa chạy xong**, callback đó *có thể* đã đổi data hoặc không.

**Zone.js** theo dõi điều đó bằng cách patch các API bất đồng bộ phổ biến:

```text
- DOM event: click, input, keydown, scroll...
- Timer: setTimeout, setInterval
- Promise / async-await
- XMLHttpRequest / fetch / HttpClient
- requestAnimationFrame
- Một số API async khác
```

Khi một callback thuộc các API trên chạy xong **trong Angular zone**, Zone.js báo cho Angular biết — Angular dựa vào đó để quyết định có nên chạy Change Detection. Zone.js dừng lại ở đó: nó không biết `count` là biến nào, không biết `{{ count }}` nằm trong template nào, và không tự cập nhật DOM — phần đó thuộc về Change Detection.

### 3.2. Cơ chế bên trong: `Zone` là gì, monkey-patch

**`Zone` là một "ngữ cảnh thực thi"** (execution context) đi theo code qua các ranh giới bất đồng bộ. Khi một đoạn code chạy bên trong `zone.run(fn)`, `Zone.current` là `zone` đó; nếu trong `fn` có lệnh `setTimeout(cb, ...)`, Zone.js đảm bảo `cb` — khi thực sự chạy sau này, từ event loop — vẫn thấy `Zone.current === zone`, dù lúc đó call stack hoàn toàn khác với lúc `setTimeout` được gọi.

Cơ chế để làm được điều đó là **monkey-patch**: Zone.js thay thế các API bất đồng bộ toàn cục (đã liệt kê ở [§3.1](#31-zonejs-theo-dõi-asyncevent-không-theo-dõi-data)) bằng bản bọc (wrapper) của chính nó. Rút gọn nguyên tắc cho `setTimeout`:

```js
const nativeSetTimeout = window.setTimeout;

window.setTimeout = function (callback, delay, ...args) {
  const capturedZone = Zone.current; // zone tại thời điểm GỌI setTimeout

  return nativeSetTimeout(function () {
    const previousZone = Zone.current;
    Zone.current = capturedZone;     // phục hồi zone tại thời điểm CALLBACK thực sự chạy
    try {
      return callback(...args);
    } finally {
      Zone.current = previousZone;
    }
  }, delay);
};
```

`addEventListener`, `Promise.prototype.then`, `XMLHttpRequest`, `requestAnimationFrame`... đều được patch theo cùng nguyên tắc: **capture zone lúc đăng ký, restore zone lúc callback chạy**. Bản thật của Zone.js phức tạp hơn — dùng khái niệm `Task` (microTask/macroTask/eventTask) và các hook `onScheduleTask`/`onInvokeTask`/`onCancelTask`/`onHasTask` — nhưng nguyên tắc capture-rồi-restore này là nền tảng của mọi thứ Zone.js làm, kể cả cách Angular zone được tạo ra ở [§3.3](#33-zonefork-ngzone-và-runoutsideangular).

### 3.3. `zone.fork()`, NgZone và `runOutsideAngular()`

Một zone có thể **fork** ra zone con với các hook riêng:

```ts
const childZone = parentZone.fork({
  name: 'tên zone con',

  // chạy trước/sau mỗi lần code ĐỒNG BỘ chạy trong zone này
  onInvoke: (delegate, current, target, callback, applyThis, applyArgs, source) => {
    return delegate.invoke(target, callback, applyThis, applyArgs, source);
  },

  // chạy trước/sau mỗi lần một TASK bất đồng bộ (timer/promise/event...) chạy trong zone này
  onInvokeTask: (delegate, current, target, task, applyThis, applyArgs) => {
    return delegate.invokeTask(target, task, applyThis, applyArgs);
  },

  // báo cho zone cha biết zone này còn microtask/macrotask đang chờ hay không
  onHasTask: (delegate, current, target, hasTaskState) => {
    delegate.hasTask(target, hasTaskState);
  }
});
```

Khi Angular khởi động, `NgZone` fork một zone con tên `'angular'` từ zone gốc, với các hook ở trên:

```text
Zone gốc (root)
  └── 'angular' (fork bởi NgZone)
        ├── onInvoke     → gọi onEnter() trước, onLeave() sau khi code đồng bộ chạy xong
        ├── onInvokeTask → gọi onEnter() trước, onLeave() sau khi một task (timer/promise/event) chạy xong
        └── onHasTask    → báo khi microtask/macrotask queue của zone 'angular' rỗng hoặc không còn rỗng
```

`onEnter()`/`onLeave()` chính là nơi NgZone phát ra `onUnstable`/`onMicrotaskEmpty`/`onStable` ([§4.2](#42-onunstable-onmicrotaskempty-onstable)) — các event này không phải Angular "tự đoán" trạng thái app, mà là **hook của zone fork** chạy mỗi khi có code hoặc task đi qua zone `'angular'`.

**`NgZone.run()` và `NgZone.runOutsideAngular()`** về bản chất chỉ là gọi `.run()` trên hai zone khác nhau:

```ts
class NgZone {
  private _inner: Zone;  // zone 'angular' — có các hook ở trên
  private _outer: Zone;  // zone cha — KHÔNG có các hook này

  run<T>(fn: () => T): T {
    return this._inner.run(fn);
  }

  runOutsideAngular<T>(fn: () => T): T {
    return this._outer.run(fn);
  }
}
```

- Code chạy trong `_inner` (`'angular'`): khi xong, hook `onInvokeTask`/`onHasTask` của `'angular'` chạy → có thể phát `onMicrotaskEmpty`/`onStable` → Angular tick.
- Code chạy trong `_outer`: không đi qua các hook đó → Angular không tự tick từ đoạn này.

`runOutsideAngular()` thường dùng cho các tác vụ không cần Angular cập nhật template ngay — rAF loop đo FPS, scroll/mousemove handler tần suất cao, `setInterval` chỉ log/polling nội bộ, third-party chart/animation library:

```ts
constructor(private ngZone: NgZone) {}

startHeavyTimer() {
  this.ngZone.runOutsideAngular(() => {
    setInterval(() => {
      // Code này chạy lặp lại nhưng không làm Angular tick liên tục
      console.log('running outside angular');
    }, 1000);
  });
}
```

Khi cần phản ánh kết quả lên UI, quay lại Angular zone bằng `run()`:

```ts
this.ngZone.run(() => {
  this.fps = latestFps;
});
```

Vì zone được **capture lại tại thời điểm schedule** ([§3.2](#32-cơ-chế-bên-trong-zone-là-gì-monkey-patch)), mọi `setTimeout`/`Promise`/event... được tạo ra *trong* `ngZone.run(fn)` sẽ tự động "mang theo" zone `'angular'` đến khi callback của chúng thực thi — không cần wrap lại từng cái:

```ts
this.ngZone.run(() => {
  // current zone = 'angular'
  fetch(url)
    .then(res => res.json())   // .then callback cũng capture zone = 'angular'
    .then(data => {
      this.data = data;        // chạy trong zone 'angular' → onInvokeTask → onLeave()
    });                         //   → onMicrotaskEmpty → ApplicationRef.tick()
});
```

Ngược lại, trong `runOutsideAngular`, không chỉ callback đầu tiên mà **cả các callback lồng/đệ quy bên trong** cũng giữ nguyên zone cha — ví dụ một vòng lặp `requestAnimationFrame` tự gọi lại chính nó:

```ts
this.ngZone.runOutsideAngular(() => {
  // current zone = zone cha (không phải 'angular')
  setInterval(() => {
    // callback này capture zone cha → chạy ở đây KHÔNG đi qua hook của 'angular'
    // → không phát onMicrotaskEmpty/onStable, Angular không tick từ đây
  }, 1000);

  const loop = () => {
    // mỗi frame ở đây vẫn nằm ngoài Angular zone,
    // dù requestAnimationFrame được gọi lại từ trong chính callback này
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
```

Đây là lý do `runOutsideAngular` không phải một "cờ tạm" chỉ có hiệu lực ngay trong câu lệnh — nó đổi **zone được capture** cho toàn bộ chain bất đồng bộ bắt đầu từ đó, kể cả các `.then`/callback lồng/đệ quy bên trong, cho đến khi code chủ động `run()` trở lại vào `'angular'`.

### 3.4. Hai trục độc lập

Zone.js trả lời câu hỏi "khi nào Angular có thể chạy Change Detection". Nó không trả lời "Angular sẽ quét bao nhiêu component". Đây là hai trục độc lập:

```text
Trục 1: Khi nào tick xảy ra?
  → Zone.js, event, timer, promise, HTTP, manual tick...

Trục 2: Tick đó quét đến đâu?
  → ChangeDetectionStrategy Default/OnPush, dirty marking, detach/detectChanges...
```

Phân biệt hai trục này là điểm mấu chốt khi phán đoán lag.

### 3.5. Đánh đổi của cơ chế zone-based

Cơ chế dựa trên Zone.js mang lại một ưu điểm lớn: lập trình viên chỉ cần đổi state, không cần tự gọi lại việc render UI.

```ts
@Component({
  selector: 'app-title',
  template: `<h1>{{ title }}</h1>`
})
export class TitleComponent {
  title = 'Initial title';

  constructor() {
    setTimeout(() => {
      this.title = 'Hello Angular';
    }, 1000);
  }
}
```

Sau 1 giây, `this.title` đổi. Vì `setTimeout` chạy trong Angular zone, Zone.js báo cho Angular biết async task đã hoàn tất, Angular chạy Change Detection và `<h1>` tự cập nhật — không cần gọi `this.cdr.detectChanges()` hay tương đương.

Ưu điểm:

```text
- Không cần tự gọi render lại UI sau mỗi thay đổi.
- Code đơn giản: chỉ cần "this.title = ..."
- Dễ xử lý các tác vụ async (timer, HTTP, event, Promise).
```

Nhược điểm: Zone.js chỉ biết "có một async task vừa hoàn thành", không biết **dữ liệu nào** đã đổi và **UI có cần cập nhật hay không**. Vì vậy Angular có thể chạy Change Detection dù không có gì hiển thị thay đổi:

```ts
setInterval(() => {
  console.log('tracking...');
}, 1000);
```

`setInterval` trên không đổi dữ liệu hiển thị, nhưng nếu chạy trong Angular zone, mỗi lần callback chạy xong vẫn có thể khiến Angular chạy Change Detection — chi tiết và cách xử lý ở [§13. Zone pollution](#13-zone-pollution).

Bảng tóm tắt vai trò:

| | Zone.js / NgZone | Change Detection |
|---|---|---|
| Vai trò | Phát hiện async task đã chạy xong, báo hiệu cho Angular | Đọc lại binding, so sánh, cập nhật DOM |
| Biết gì | Có thể có thay đổi (không biết chi tiết) | Binding nào thực sự đổi giá trị |
| Hành động | Gọi `ApplicationRef.tick()` | Check component, cập nhật DOM nếu cần |

### 3.6. Frame và `requestAnimationFrame`

**Frame** là một lần browser vẽ lại màn hình. Màn hình 60Hz vẽ lại ~60 lần/giây (~16.7ms/frame) — con số này thường được gọi là **FPS** (frames per second).

`requestAnimationFrame` (rAF) là API browser cho phép đăng ký một callback chạy **ngay trước khi browser vẽ frame kế tiếp**:

```ts
function loop() {
  // làm gì đó mỗi frame
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

rAF nằm trong danh sách API bị Zone.js patch ở [§3.1](#31-zonejs-theo-dõi-asyncevent-không-theo-dõi-data). Hệ quả:

```text
mỗi frame (~16.7ms)
  ↓
callback của requestAnimationFrame chạy trong Angular zone
  ↓
Zone.js coi đây là một async task vừa hoàn thành
  ↓
onMicrotaskEmpty
  ↓
ApplicationRef.tick() → Change Detection chạy
```

→ Một loop rAF chạy trong Angular zone tương đương với **ép Angular tick ~60 lần/giây**, dù không có tương tác người dùng nào. Đây là một dạng [zone pollution](#13-zone-pollution) thường gặp khi đo FPS hoặc chạy animation thủ công.

Muốn đo FPS mà không tự gây thêm tick, chạy rAF loop ngoài Angular zone (`runOutsideAngular`) và chỉ `ngZone.run()` khi cần cập nhật một giá trị hiển thị:

```ts
this.ngZone.runOutsideAngular(() => {
  const loop = (now: number) => {
    // tính fps...
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

// chỉ vào lại zone khi cần update UI
this.ngZone.run(() => (this.fps = fps));
```

Hai chủ đề liên quan trực tiếp đến Zone.js/NgZone được trình bày ở các phần riêng để tránh trùng lặp:

- **Khi nào Angular thực sự gọi `tick()`** — các event `onUnstable`/`onMicrotaskEmpty`/`onStable` và việc một câu lệnh đổi binding không tự gây Change Detection: xem [§4. NgZone lifecycle events](#4-ngzone-lifecycle-events).
- **Async task chạy trong Angular zone nhưng không cần update UI**, gây tick thừa: xem [§13. Zone pollution](#13-zone-pollution).

---

## 4. NgZone lifecycle events

`NgZone` phát ra các event `onUnstable`, `onMicrotaskEmpty`, `onStable`, `onError`. Hiểu đúng các event này tránh kết luận sai kiểu "1 HTTP request luôn gây đúng N lần ChangeDetection".

### 4.1. VM turn, microtask, macrotask

```text
VM turn / JavaScript turn
= một lượt JavaScript được event loop lấy ra để chạy.

Macrotask
= các task lớn như click event, setTimeout, setInterval, XMLHttpRequest callback...

Microtask
= các task nhỏ chạy sau đoạn code hiện tại nhưng trước khi browser chuyển sang task/render tiếp theo.
Ví dụ: Promise.then, async/await continuation, queueMicrotask...
```

```ts
console.log('A');

setTimeout(() => {
  console.log('B - macrotask');
}, 0);

Promise.resolve().then(() => {
  console.log('C - microtask');
});

console.log('D');
```

Thứ tự in ra:

```text
A
D
C - microtask
B - macrotask
```

Sau khi một đoạn JavaScript chạy xong, browser xử lý hết microtask queue trước. Khi microtask queue rỗng, đó là thời điểm Angular thường xem là phù hợp để chạy Change Detection.

### 4.2. `onUnstable`, `onMicrotaskEmpty`, `onStable`

| Event | Khi nào xảy ra | Ý nghĩa |
|---|---|---|
| `onUnstable` | Khi code bắt đầu chạy trong Angular zone (zone chuyển từ stable sang unstable) | Zone bắt đầu bận |
| `onMicrotaskEmpty` | Khi microtask queue trong VM turn hiện tại rỗng | Hint để Angular gọi `ApplicationRef.tick()` |
| `onStable` | Khi zone không còn microtask pending và VM turn sắp kết thúc | Zone đã ổn định trong lượt hiện tại |

Luồng thường thấy:

```text
Async/Event bắt đầu
  ↓
onUnstable
  ↓
Handler / subscribe / Promise chain chạy
  ↓
Microtask queue rỗng
  ↓
onMicrotaskEmpty
  ↓
ApplicationRef.tick()
  ↓
ChangeDetection
  ↓
onStable
```

Ba event này không phải Angular "đoán" trạng thái — chúng được phát ra từ các hook `onInvoke`/`onInvokeTask`/`onHasTask` của zone `'angular'` mà `NgZone` fork ra, xem cơ chế chi tiết ở [§3.3](#33-zonefork-ngzone-và-runoutsideangular).

Hai điểm cần lưu ý:

- `onMicrotaskEmpty` có thể phát nhiều lần trong cùng một VM turn, vì trong lúc Angular xử lý, code có thể enqueue thêm microtask mới. Vì vậy không đúng khi coi "một async event = đúng một lần `onMicrotaskEmpty` = đúng một lần tick" — số lần phụ thuộc vào async chain thực tế.
- Angular tick ở `onMicrotaskEmpty`, không đợi đến `onStable` mới tick. Mô tả chính xác là: khi microtask queue rỗng, `NgZone` phát `onMicrotaskEmpty`, Angular dựa vào tín hiệu này để gọi `ApplicationRef.tick()`; sau đó khi zone không còn việc trong lượt hiện tại, `NgZone` phát `onStable`.

### 4.3. Binding thay đổi không tự gây Change Detection

```ts
this.total = 100;
```

Câu lệnh trên chỉ đổi giá trị trong memory, không tự gọi `ApplicationRef.tick()`. Angular chỉ cập nhật DOM nếu sau đó có một lượt Change Detection chạy và binding liên quan được check.

Trong Angular zone:

```ts
setTimeout(() => {
  this.total = 100;
}, 1000);
```

```text
setTimeout callback chạy trong Angular zone
  ↓
this.total đổi
  ↓
onMicrotaskEmpty
  ↓
ApplicationRef.tick()
  ↓
Angular đọc lại {{ total }}
  ↓
DOM update
```

Ngoài Angular zone:

```ts
this.ngZone.runOutsideAngular(() => {
  setTimeout(() => {
    this.total = 100;
  }, 1000);
});
```

`total` vẫn đổi trong memory, nhưng Angular có thể không tự chạy CD từ callback đó. Muốn UI update, quay lại Angular zone hoặc tự báo Angular:

```ts
this.ngZone.run(() => {
  this.total = 100;
});
```

hoặc:

```ts
this.total = 100;
this.cdr.markForCheck();
```

`markForCheck()` cần có một tick sau đó để Angular quét; `detectChanges()` check ngay subtree hiện tại (chi tiết ở [§7](#7-changedetectorref--markforcheck-và-detectchanges)).

### 4.4. Số lần CD trên một HTTP request không cố định

Một HTTP request có thể tạo ra một hoặc nhiều async callback/event bên trong Angular zone. Mỗi lần async callback hoàn tất và microtask queue rỗng, Angular có thể chạy Change Detection. Số lần tick thực tế phụ thuộc vào Angular version, Zone.js, XHR/fetch event, interceptor, Observable chain, dev/prod mode và cách đo.

Với nhiều HTTP request độc lập:

```ts
this.api.getA().subscribe(a => this.a = a);
this.api.getB().subscribe(b => this.b = b);
this.api.getC().subscribe(c => this.c = c);
```

Nếu 3 response trả về ở 3 thời điểm khác nhau, mỗi response có thể khiến CD chạy riêng — màn hình có thể bị check nhiều lần dù người dùng không click gì.

Gom lại bằng `forkJoin`:

```ts
forkJoin({
  a: this.api.getA(),
  b: this.api.getB(),
  c: this.api.getC()
}).subscribe(result => {
  this.vm = result;
});
```

giúp giảm số lần cập nhật state ở component vì chỉ set `vm` khi cả nhóm request hoàn tất — tránh render/check theo từng response rải rác.

### 4.5. Dev mode và số lần method trong template được gọi

Trong development mode, Angular có thêm cơ chế kiểm tra để phát hiện binding bị thay đổi sau khi đã check xong, nên một lần `ApplicationRef.tick()` trong dev mode có thể khiến binding/template expression bị evaluate thêm lượt phụ.

```html
{{ calculateTotal(row) }}
```

```ts
calculateTotal(row: Row) {
  console.log('calculateTotal', row.id);
  return row.price * row.quantity;
}
```

Với table 500 dòng:

```text
1 tick × 500 row × 3 method trong template = 1500 lần gọi method
```

Nếu dev mode có thêm lượt check phụ, số log có thể gần gấp đôi. Số lần log method trong template không nên dùng để kết luận trực tiếp số lần HTTP trigger CD.

### 4.6. Quan sát NgZone events và đếm `ApplicationRef.tick()`

Service quan sát NgZone events khi học/debug:

```ts
import { Injectable, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ZoneDebugService {
  constructor(private ngZone: NgZone) {
    this.ngZone.onUnstable.subscribe(() => {
      console.log('[NgZone] onUnstable');
    });

    this.ngZone.onMicrotaskEmpty.subscribe(() => {
      console.log('[NgZone] onMicrotaskEmpty');
    });

    this.ngZone.onStable.subscribe(() => {
      console.log('[NgZone] onStable');
    });

    this.ngZone.onError.subscribe(error => {
      console.error('[NgZone] onError', error);
    });
  }
}
```

Inject service này ở `AppComponent` để nó được khởi tạo:

```ts
constructor(private zoneDebug: ZoneDebugService) {}
```

Đếm số lần `ApplicationRef.tick()` (chỉ dùng để học/debug local, không đưa vào production):

```ts
import { ApplicationRef, isDevMode } from '@angular/core';

constructor(appRef: ApplicationRef) {
  if (isDevMode()) {
    const originalTick = appRef.tick.bind(appRef);
    let count = 0;

    appRef.tick = () => {
      count++;
      console.log('[CD tick]', count);
      originalTick();
    };
  }
}
```

Khi phân tích lag, câu hỏi cần trả lời không phải "có bao nhiêu HTTP request" mà:

```text
Các async event đó làm phát sinh bao nhiêu tick?
Mỗi tick quét bao nhiêu component?
Trong các component bị quét, binding nào tốn nhất?
Có bao nhiêu DOM node thật phải render/layout/paint?
```

---

## 5. Default Change Detection

### 5.1. Default là gì

Nếu component không khai báo `changeDetection`, Angular dùng strategy mặc định:

```ts
@Component({
  selector: 'app-example',
  templateUrl: './example.component.html'
})
export class ExampleComponent {}
```

Mỗi khi có tick, component `Default` sẽ được kiểm tra. Khi mutate object:

```ts
this.patient.name = 'Tên mới';
```

```html
{{ patient.name }}
```

vì component vẫn bị check, Angular đọc lại `patient.name`, thấy khác thì update DOM — đây là lý do `Default` "dễ dùng".

### 5.2. Default quét toàn cây mỗi tick

`Default` không phân biệt "event này có liên quan tới component kia không". Với màn tiếp đón có table 500 dòng, khi user gõ vào ô search:

```text
keydown/input event
  ↓
Tick
  ↓
Angular check lại cả cây liên quan
  ↓
500 row bị check
  ↓
Mỗi row có nhiều binding/method
  ↓
Lag
```

Dù user chỉ đang gõ một ô input, Angular vẫn check lại rất nhiều component.

### 5.3. Khi nào Default phù hợp

`Default` phù hợp khi:

- Component nhỏ, ít binding.
- Không render list lớn.
- Logic trong template nhẹ.
- Team chưa kiểm soát tốt immutable update.
- Tốc độ phát triển quan trọng hơn tối ưu.

Việc chọn `OnPush` nên dựa trên đo đạc cho thấy `Default` là điểm nghẽn, không phải áp dụng mặc định cho mọi component.

---

## 6. OnPush Change Detection

### 6.1. OnPush là gì

```ts
@Component({
  selector: 'app-patient-row',
  templateUrl: './patient-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientRowComponent {
  @Input() row!: PatientRow;
}
```

Một component `OnPush` có thể bị bỏ qua trong một tick nếu Angular không thấy lý do cần kiểm tra nó.

### 6.2. Điều kiện để OnPush component được check

Một OnPush component/subtree thường được check khi có một trong các tín hiệu:

```text
1. Input từ cha truyền xuống có giá trị mới (reference mới).
2. Có event xảy ra trong chính subtree đó.
3. Component hoặc ancestor được mark dirty/markForCheck.
4. AsyncPipe nhận emission mới và tự markForCheck ([§7.8](#78-asyncpipe)).
5. detectChanges được gọi thủ công cho view/subtree đó.
```

Với object/array, điểm quan trọng là **tham chiếu**. Sai với OnPush:

```ts
this.row.name = 'Tên mới';
```

vì `row` vẫn là object cũ. Đúng:

```ts
this.row = {
  ...this.row,
  name: 'Tên mới'
};
```

Với list:

```ts
this.rows = this.rows.map(row =>
  row.id === changedId
    ? { ...row, name: 'Tên mới' }
    : row
);
```

### 6.3. Phạm vi tối ưu của OnPush

OnPush giảm **số component bị check**:

```text
Default:
Tick bất kỳ → có thể check 500 row

OnPush:
Tick bất kỳ → row nào không có input mới/event/dirty thì bỏ qua
```

Với table lớn, đây là khác biệt rất lớn.

Nếu component OnPush đã bị check, toàn bộ binding bên trong nó vẫn được đọc lại:

```html
<td>{{ calculateRiskScore(row) }}</td>
<td>{{ formatWarning(row) }}</td>
<td>{{ getTotal(row) }}</td>
```

Nếu row bị check, các hàm này vẫn chạy. OnPush giảm chiều rộng cây bị check, không tự làm binding bên trong nhẹ đi. Muốn giảm logic nặng bên trong component cần kết hợp: tính trước data, pure pipe, memoization cẩn thận, tránh method call nặng trong template.

### 6.4. Các lỗi thường gặp với OnPush

**Mutate object** — component con OnPush nhận `patient` có thể không update vì reference không đổi:

```ts
this.patient.status = 'DONE';
```

**Mutate array** — nên dùng spread thay vì `push`:

```ts
this.rows = [...this.rows, newRow];
```

**Kỳ vọng OnPush tự hết lag** — nếu một event nằm trong table làm cả table dirty, hoặc input list đổi liên tục, nhiều row vẫn có thể bị check.

**Dữ liệu đến từ thư viện ngoài Angular zone** (WebSocket raw, chart library, callback ngoài Angular) — UI có thể không update nếu không quay về Angular zone hoặc không mark đúng:

```ts
this.ngZone.run(() => {
  this.data = newData;
  this.cdr.markForCheck();
});
```

**OnPush nhưng codebase vẫn thiết kế mutable** — OnPush kéo theo style code: input immutable, data flow rõ ràng cha → con, component hiển thị ít side effect, event từ con emit lên cha, cha tạo state mới rồi truyền xuống.

---

## 7. ChangeDetectorRef — markForCheck() và detectChanges()

### 7.1. ChangeDetectorRef và các API

`ChangeDetectorRef` là đối tượng Angular cung cấp cho mỗi view/component để can thiệp vào quá trình Change Detection của chính view đó.

| API | Ý nghĩa |
| --- | --- |
| `markForCheck()` | Đánh dấu view cần được check ở CD cycle tiếp theo |
| `detectChanges()` | Check ngay view hiện tại và các view con |
| `detach()` | Tách view khỏi cây CD tự động |
| `reattach()` | Gắn view trở lại cây CD tự động |
| `checkNoChanges()` | Kiểm tra không có binding nào đổi sau khi đã check, chủ yếu dùng nội bộ/dev/test |

### 7.2. `markForCheck()`

```ts
constructor(private cdr: ChangeDetectorRef) {}

updateData(data: Data) {
  this.data = data;
  this.cdr.markForCheck();
}
```

`markForCheck()` đánh dấu view hiện tại là dirty — Angular sẽ kiểm tra view này trong lần Change Detection tiếp theo. Nó **không chạy Change Detection ngay**; nó chỉ đảm bảo component không bị bỏ qua ở lần CD kế tiếp.

`markForCheck()` hay dùng với component `OnPush` khi data đổi từ một nguồn mà Angular không tự nhận ra qua flow input/event thông thường — ví dụ subscribe trực tiếp vào một service/socket:

```ts
@Component({
  selector: 'app-message-box',
  template: `{{ message }}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageBoxComponent implements OnInit, OnDestroy {
  message = '';
  private sub?: Subscription;

  constructor(
    private socketService: SocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.sub = this.socketService.message$.subscribe(message => {
      this.message = message;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
```

Nếu không gọi `markForCheck()`, component `OnPush` có thể không được check khi dữ liệu đến từ ngoài cơ chế Angular đang tự theo dõi.

### 7.3. `detectChanges()`

```ts
this.cdr.detectChanges();
```

`detectChanges()` chạy Change Detection ngay lập tức cho view hiện tại và toàn bộ view con bên dưới nó — không chờ tick tiếp theo.

```ts
@Component({
  selector: 'app-local-clock',
  template: `{{ now | date:'HH:mm:ss' }}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocalClockComponent {
  now = new Date();

  constructor(private cdr: ChangeDetectorRef) {
    setInterval(() => {
      this.now = new Date();
      this.cdr.detectChanges();
    }, 1000);
  }
}
```

Không nên dùng `detectChanges()` như cách mặc định để update UI — gọi quá nhiều làm flow render khó đoán vì không còn theo nhịp tự nhiên của Angular.

### 7.4. So sánh `markForCheck()` và `detectChanges()`

| Tiêu chí | `markForCheck()` | `detectChanges()` |
| --- | --- | --- |
| Có chạy CD ngay không? | Không | Có |
| Tác dụng chính | Đánh dấu view dirty | Check ngay view hiện tại |
| Thời điểm chạy | Lần CD tiếp theo | Ngay tại dòng code gọi |
| Phạm vi | View hiện tại và đường lên ancestor, để tick sau không bỏ qua | View hiện tại và các view con |
| Hay dùng với | `OnPush`, async callback, observable tự subscribe | `detach()`, local CD, case cần kiểm soát thủ công |
| Mức độ can thiệp | Nhẹ hơn, đi theo nhịp Angular | Mạnh hơn, chủ động ép check |
| Rủi ro | Ít hơn | Cao hơn nếu gọi sai lifecycle hoặc lạm dụng |

Trong đa số case `OnPush`, `markForCheck()` đủ dùng: vẫn giữ CD theo nhịp chung của Angular, không tạo thêm lượt check ngay lập tức, ít nguy cơ đụng lifecycle, dễ đọc flow render. Nếu gọi `detectChanges()` trong mọi subscription, component tự ép check ngay mỗi lần data về — nếu nhiều stream emit liên tục sẽ tạo nhiều lần check nhỏ rời rạc, khó kiểm soát.

### 7.5. `detach()` và `reattach()`

`detach()` tách view khỏi cây Change Detection tự động — `ApplicationRef.tick()` không tự check view này nữa, dù view có được `markForCheck()`.

```ts
@Component({
  selector: 'app-heavy-table',
  templateUrl: './heavy-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeavyTableComponent implements OnInit {
  rows: RowVm[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private service: ReportService
  ) {}

  ngOnInit() {
    this.cdr.detach();

    setInterval(() => {
      this.rows = this.service.getLatestRows();
      this.cdr.detectChanges();
    }, 5000);
  }
}
```

Component nặng tham gia mọi CD tick toàn app có chi phí cao; `detach()` rồi tự `detectChanges()` theo nhịp phù hợp giải quyết vấn đề này. Áp dụng tốt cho: component render chart lớn không cần update liên tục, dashboard realtime nhận data dày nhưng UI chỉ cần refresh mỗi vài giây, popup/view độc lập cần check local sau khi thao tác DOM hoặc thư viện ngoài Angular.

Muốn cập nhật view đã detach:

```ts
// Check thủ công ngay
this.cdr.detectChanges();

// Hoặc gắn lại vào cây CD tự động
this.cdr.reattach();
this.cdr.markForCheck();
```

```ts
pause() {
  this.cdr.detach();
}

resume() {
  this.cdr.reattach();
  this.cdr.markForCheck();
}

refreshNow() {
  this.cdr.detectChanges();
}
```

### 7.6. Các lỗi thường gặp

**Kỳ vọng `markForCheck()` cập nhật DOM ngay** — `markForCheck()` chỉ đánh dấu dirty; DOM được cập nhật khi Change Detection chạy sau đó.

**Lạm dụng `detectChanges()` để che lỗi data flow** — nếu UI không update, trước khi thêm `detectChanges()` cần kiểm tra: component có OnPush không, `@Input` có bị mutate không, data có đi ngoài Angular zone không, có đang detach view không, có subscribe thủ công thay vì async pipe không, có gọi code vào lifecycle chưa phù hợp không. Nếu vấn đề gốc là mutate object, hướng đúng là immutable update, không phải thêm `detectChanges()`.

**Gọi `detectChanges()` trong lifecycle không phù hợp** — gọi tuỳ tiện trong `ngAfterViewInit`/`ngAfterViewChecked` có thể che hoặc tạo lỗi kiểu view đổi sau khi đã được check. Không phải lúc nào `ExpressionChangedAfterItHasBeenCheckedError` cũng nên fix bằng `detectChanges()`; câu hỏi đúng là vì sao state bị đổi sau khi Angular đã check view, state đó có nên được tính sớm hơn, có đang update ngược từ child lên parent trong cùng vòng check, có side effect trong getter/template/lifecycle.

**Dùng `markForCheck()` với view đang detached** — nếu view đã `detach()`, không nên kỳ vọng global tick sẽ tự check view đó; cần `detectChanges()` hoặc `reattach()` + `markForCheck()`.

### 7.7. Quy tắc chọn API

| Tình huống | Nên dùng |
| --- | --- |
| Component `OnPush`, data đổi từ subscription thủ công | `markForCheck()` |
| Component `OnPush`, dùng `async pipe` | Thường không cần gọi tay — xem [§7.8](#78-asyncpipe) |
| Data đổi do `@Input` reference mới | Không cần gọi tay |
| Data đổi do event trong component | Thường không cần gọi tay |
| View đã `detach()` và muốn refresh ngay | `detectChanges()` |
| Dashboard/list rất nặng, muốn tự kiểm soát nhịp refresh | `detach()` + `detectChanges()` |
| UI không update nhưng chưa rõ nguyên nhân | Kiểm tra data flow trước, không vội dùng `detectChanges()` |

Áp dụng cho table 500 dòng, mỗi row `OnPush`:

- Nếu row nhận data mới qua `@Input` reference mới → không cần `markForCheck()`, Angular đã có tín hiệu.
- Nếu row tự subscribe vào service riêng (`this.rowStatusService.status$(this.rowId).subscribe(...)`) → `markForCheck()` trong callback là hợp lý.
- Nếu table nhận data realtime liên tục nhưng UI chỉ cần refresh mỗi 2 giây:

```ts
this.cdr.detach();

interval(2000).subscribe(() => {
  this.visibleRows = this.buildVisibleRows();
  this.cdr.detectChanges();
});
```

`detectChanges()` ở đây có chủ đích: kiểm soát nhịp check local, thay vì để table bị kéo vào mọi global CD tick.

Quy tắc chung: ưu tiên data flow đúng + OnPush + async pipe; chỉ dùng `ChangeDetectorRef` thủ công khi có lý do rõ; nếu phải dùng nhiều `detectChanges()`, nghi ngờ thiết kế state/data flow; nếu dùng `detach()`, phải có chiến lược `reattach()`/`detectChanges()` rõ ràng.

### 7.8. AsyncPipe

`AsyncPipe` (`| async`) là pipe có sẵn của Angular, subscribe trực tiếp vào `Observable`/`Promise` ngay trong template:

```html
<span>{{ price$ | async }}</span>
```

Về hiệu ứng, dòng trên tương đương với:

```ts
ngOnInit() {
  this.sub = this.price$.subscribe(value => {
    this.price = value;
    this.cdr.markForCheck();
  });
}

ngOnDestroy() {
  this.sub.unsubscribe();
}
```

nhưng Angular tự làm cả 3 việc: subscribe, gọi `markForCheck()` mỗi khi `price$` emit giá trị mới, và `unsubscribe()` khi view bị destroy.

**Vì sao AsyncPipe đủ cho OnPush** — đây chính là điều kiện 4 ở [§6.2](#62-điều-kiện-để-onpush-component-được-check): "AsyncPipe nhận emission mới và tự markForCheck". Khác với mutate object ([§6.4](#64-các-lỗi-thường-gặp-với-onpush)), AsyncPipe không cần Angular so sánh reference của object gốc — pipe tự lưu giá trị mới nhất và tự đánh dấu view dirty, nên component `OnPush` không bị skip ở tick kế tiếp:

```ts
@Component({
  selector: 'app-price-ticker',
  template: `<span>{{ price$ | async }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceTickerComponent {
  price$ = this.priceService.price$;
  constructor(private priceService: PriceService) {}
}
```

So với cách subscribe tay ở [§7.2](#72-markforcheck), component này không còn `OnInit`/`OnDestroy`/`ChangeDetectorRef`/`Subscription`.

**Nhiều `| async` trên cùng một Observable = nhiều subscription**

```html
<span>{{ (data$ | async)?.price }}</span>
<span>{{ (data$ | async)?.volume }}</span>
```

Mỗi `| async` ở trên là một subscription riêng vào `data$`. Cách tránh — alias ra biến để chỉ subscribe một lần:

```html
@if (data$ | async; as data) {
  <span>{{ data.price }}</span>
  <span>{{ data.volume }}</span>
}
```

hoặc cú pháp cũ:

```html
<ng-container *ngIf="data$ | async as data">
  <span>{{ data.price }}</span>
  <span>{{ data.volume }}</span>
</ng-container>
```

**Áp dụng cho list OnPush** — nếu `rows` đến từ `rows$: Observable<ChiSoMau[]>`:

```html
@if (rows$ | async; as rows) {
  <tr app-indicator-row-onpush *ngFor="let row of rows; trackBy: trackById" [data]="row"></tr>
}
```

Mỗi khi `rows$` emit mảng mới (reference mới), AsyncPipe tự `markForCheck()`, các row `OnPush` nhận `[data]` reference mới → được check — cùng cơ chế với `randomUpdate()` ở [§16.5](#165-pure-pipe--mutate-object--vì-sao-điểm-rủi-ro-không-cập-nhật-ngay), nhưng không cần `subscribe`/`markForCheck` thủ công trong component.

---

## 8. Pure Pipe

### 8.1. Method trong template

```html
<td>{{ getRiskLevel(row) }}</td>
```

```ts
getRiskLevel(row: PatientRow): string {
  return calculateRisk(row);
}
```

Mỗi lần component bị check, Angular gọi lại hàm này. Với 500 row, mỗi row 5 method:

```text
1 tick = 500 × 5 = 2.500 function calls
10 tick = 25.000 function calls
```

Nếu function nhẹ thì không sao; nếu function nặng, lag rõ.

### 8.2. Pure pipe

Pipe mặc định là pure:

```ts
@Pipe({
  name: 'riskLevel',
  pure: true
})
export class RiskLevelPipe implements PipeTransform {
  transform(row: PatientRow): string {
    return calculateRisk(row);
  }
}
```

```html
<td>{{ row | riskLevel }}</td>
```

Pure pipe chỉ chạy lại khi input đổi theo cách Angular nhận ra:

```text
primitive (number/string/boolean): đổi giá trị → pipe chạy lại
object/array: reference đổi → pipe chạy lại, reference không đổi → pipe không chạy lại
```

### 8.3. Pure pipe + OnPush

Hai cơ chế tối ưu ở 2 tầng khác nhau:

```text
OnPush:    giảm số component bị check.
Pure pipe: khi component đã bị check, giảm số lần tính toán lại nếu input không đổi.
```

Bộ đôi cho table lớn: row component `OnPush`, logic format/tính toán nặng dùng pure pipe hoặc pre-compute, list update dùng immutable + `trackBy`.

### 8.4. Khi nào dùng / không dùng pipe

Nên dùng pipe khi: logic thuần (input nào output đó), không side effect, dùng để format/tính toán hiển thị, có thể cache theo input.

Không nên dùng pipe khi: logic cần gọi API, logic phụ thuộc state bên ngoài khó kiểm soát, logic có side effect, logic quá domain/business — nên tính ở service/view model trước.

---

## 9. trackBy / track

### 9.1. Vấn đề định danh trong `*ngFor`

```html
<tr *ngFor="let row of rows">
  <td>{{ row.name }}</td>
</tr>
```

Khi `rows` đổi, Angular cần biết phần tử mới tương ứng với DOM node cũ nào. Nếu không có định danh ổn định, Angular có thể phải làm nhiều DOM operation hơn cần thiết.

### 9.2. `trackBy` trong `*ngFor`

```html
<tr *ngFor="let row of rows; trackBy: trackById">
  <td>{{ row.name }}</td>
</tr>
```

```ts
trackById(index: number, row: PatientRow) {
  return row.id;
}
```

`trackBy` nhận diện row bằng id ổn định thay vì object reference hoặc vị trí. Khi update list immutable:

```ts
this.rows = this.rows.map(row =>
  row.id === changedId
    ? { ...row, status: 'DONE' }
    : row
);
```

Angular thấy `id=1`/`id=2` vẫn là các phần tử cũ, `id=3` đổi nội dung nhưng vẫn là DOM node của `id=3` — không cần phá toàn bộ DOM list.

### 9.3. `track` trong control flow `@for`

```html
@for (row of rows; track row.id) {
  <app-patient-row [row]="row" />
}
```

Tư duy giống `trackBy`: dùng định danh ổn định để Angular tối ưu DOM operation.

### 9.4. Phạm vi tác dụng

`trackBy`/`track` không làm method trong template nhẹ hơn, không tự giảm số tick, không thay thế OnPush. Nó chủ yếu giảm chi phí DOM khi danh sách thay đổi:

```text
OnPush       → giảm check component
Pure pipe    → giảm tính toán lại
trackBy      → giảm tạo/xoá DOM node
Virtual scroll → giảm số DOM thật
```

---

## 10. Phân tích nguyên nhân lag

### 10.1. Các tầng nguyên nhân có thể

"Table 500 dòng lag" là mô tả hiện tượng, chưa phải nguyên nhân. Một table 500 dòng có thể lag vì nhiều tầng:

```text
1. Data quá nhiều
2. DOM node quá nhiều
3. Component instance quá nhiều
4. Binding quá nhiều
5. Method trong template quá nặng
6. Pipe impure hoặc pipe input đổi liên tục
7. Event input/search gây tick liên tục
8. Không có trackBy nên list bị recreate nhiều
9. Third-party component nặng: select, datepicker, tooltip, dropdown...
10. CSS/layout/paint tốn: sticky column, dynamic height, shadow, overflow...
11. Change Detection quét quá rộng
12. API trả data làm transform phía client quá nặng
```

Với 500 dòng chỉ số cây/phòng khám, mỗi dòng có 1 row component, 10 cell, mỗi cell có binding hiển thị, một số cell dùng `nz-select`/`nz-input-number`/datepicker, một vài binding gọi function tính cảnh báo, có validate realtime. Ước lượng:

```text
500 dòng × 10 cell = 5.000 cell
Mỗi cell 3 binding = 15.000 binding
Mỗi tick xảy ra khi gõ input/search → binding bị đọc lại liên tục
Nếu có 5 method/row → 2.500 method calls/tick
```

### 10.2. Phân tích theo triệu chứng

**Lag lúc load màn hình**

Nguyên nhân thường gặp: API trả quá nhiều data, transform/map/filter client quá nặng, render quá nhiều DOM node lần đầu, component init nhiều logic, third-party component khởi tạo nặng.

Cách kiểm tra: Network tab (API mất bao lâu), Performance tab (scripting/rendering/layout), Angular profiler (component nào render/check lâu), `console.time` quanh đoạn transform data.

Hướng xử lý: paging/virtual scroll/lazy load, chuyển filter/sort nặng về backend nếu hợp lý, pre-compute view model, tránh render component phức tạp cho dữ liệu chưa cần nhìn.

**Lag lúc gõ input/search**

Nguyên nhân thường gặp: mỗi keypress gây tick, filter trực tiếp trên list lớn, table bị check lại toàn bộ, method trong template chạy lại, form validation quá nặng.

```ts
searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged()
).subscribe(keyword => {
  this.search(keyword);
});
```

Kèm: OnPush cho row/table, trackBy cho list, không gọi filter trực tiếp trong template, không bind function nặng.

**Lag lúc scroll**

Nguyên nhân thường gặp: DOM quá nhiều, sticky column/header gây layout nặng, scroll event chạy trong NgZone, tooltip/dropdown/listener quá nhiều, browser paint/layout nhiều hơn Angular CD.

Hướng xử lý: virtual scroll, giảm component/DOM trong mỗi row, `runOutsideAngular` cho scroll listener không cần update UI, kiểm tra Performance tab phần Rendering/Layout/Paint.

**Lag dù không thao tác**

Nguyên nhân thường gặp: `setInterval` trong app, realtime polling, WebSocket bắn liên tục, `requestAnimationFrame` trong Angular zone, chart/animation library gây zone pollution.

```ts
this.ngZone.runOutsideAngular(() => {
  this.socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (shouldUpdateUi(data)) {
      this.ngZone.run(() => {
        this.data = data;
        this.cdr.markForCheck();
      });
    }
  };
});
```

### 10.3. Case study: màn 500 component bị giật

Hiện tượng: màn hiển thị 500 chỉ số, mỗi chỉ số là một component/cell/row, khi nhập dữ liệu hoặc search thì UI giật.

Không kết luận ngay "do 500 component nên lag". Cách diễn đạt đúng hơn: 500 component tạo điều kiện để lag — cần đo xem chi phí chính nằm ở Change Detection, DOM render, event frequency, hay logic trong binding.

Các giả thuyết cần kiểm chứng:

```text
A. Mỗi lần nhập input làm toàn bộ 500 row bị check.
B. Mỗi row có method tính toán trong template.
C. Không có trackBy nên update list làm recreate DOM.
D. Component UI library trong mỗi cell quá nặng.
E. Form validation chạy toàn bộ form mỗi keypress.
F. Scroll/render DOM quá nhiều, cần virtual scroll.
```

Cách đo:

1. Angular DevTools Profiler — record thao tác nhập/search, xem row/cell component có bị check hàng loạt không, component nào tốn thời gian.
2. Chrome Performance — Scripting hay Rendering/Layout/Paint đang chiếm chính, có long task không.
3. Log tạm thời (không để lại production):

```ts
ngDoCheck() {
  console.count(`Row checked ${this.row.id}`);
}
```

```ts
getRiskLevel(row: Row) {
  console.count('getRiskLevel called');
  return calculateRisk(row);
}
```

Hướng tối ưu theo tầng:

- **Giảm event thừa** — debounce/distinctUntilChanged cho search (xem [§10.2](#102-phân-tích-theo-triệu-chứng)).
- **Giảm component bị check** — `ChangeDetectionStrategy.OnPush` cho row/cell/table presentational component, với điều kiện input immutable, không mutate row/list, có trackBy.
- **Giảm tính toán trong template** — thay `{{ calculateScore(row) }}` bằng `{{ row.scoreText }}` (ViewModel) hoặc `{{ row | scoreText }}` (pure pipe).
- **Giảm DOM thật** — nếu 500 dòng đều render thật và mỗi dòng phức tạp: virtual scroll, pagination, collapse/lazy render phần chi tiết, chỉ render editor khi row được focus/edit. Không phải dòng nào cũng cần `nz-select`/date-picker thật ngay từ đầu; có thể hiển thị text, render control nặng khi click edit.

### 10.4. Định dạng trình bày kết luận

Kết luận nên gắn với cơ chế, bằng chứng và giải pháp cụ thể, ví dụ:

> Qua profiler, khi gõ search mỗi keypress tạo một CD tick. Trong mỗi tick, toàn bộ `PatientRowComponent` khoảng 500 dòng bị check lại vì table đang dùng `Default` strategy. Mỗi row có 3 method call trong template, tổng cộng khoảng 1.500 function calls/tick. DOM không nhất thiết render lại toàn bộ, nhưng chi phí scripting do check binding và method call đang cao. Hướng xử lý: debounce search, chuyển row/table sang `OnPush` với immutable input, thêm `trackBy` theo `row.id`, đưa các method tính toán sang ViewModel/pure pipe. Đo lại bằng Angular DevTools để xác nhận số component check và scripting time giảm.

---

## 11. Đo đạc với Angular DevTools Profiler

### 11.1. Mục tiêu

Profiler dùng để trả lời:

```text
- Tick xảy ra bao nhiêu lần?
- Tick nào tốn nhiều thời gian?
- Component nào bị check?
- Component nào tốn nhiều nhất?
- Event nào gây ra tick?
- Sau khi tối ưu, số tick/check/time có giảm không?
```

### 11.2. Quy trình đo

```text
Bước 1: Mở Angular DevTools → Profiler
Bước 2: Start recording
Bước 3: Thực hiện đúng thao tác gây lag
        Ví dụ: gõ search, scroll table, đổi trạng thái, mở popup
Bước 4: Stop recording
Bước 5: Xem flame chart / component chart
Bước 6: Ghi lại component tốn nhiều nhất
Bước 7: Đưa giả thuyết
Bước 8: Sửa một thay đổi nhỏ
Bước 9: Đo lại để so sánh
```

### 11.3. Đọc kết quả

| Quan sát | Giả thuyết | Hướng xử lý |
|---|---|---|
| Nhiều row component bị check khi chỉ gõ search | Search input gây tick; table Default nên toàn bộ row bị check | Tách search/filter khỏi table nếu cần, debounce search, OnPush row component, immutable input, tránh method trong row template |
| Một component mất rất nhiều time | Binding/template nặng, có method call hoặc third-party component nặng | Kiểm tra template, tìm function call, tính trước data, pure pipe, chia nhỏ component, lazy render phần chưa cần |
| Không thao tác gì nhưng vẫn có tick | Có timer/interval/requestAnimationFrame/websocket/chart library/polling chạy trong NgZone | Tìm `setInterval`/`setTimeout`/`rAF`, kiểm tra chart/third-party lib, `runOutsideAngular` cho phần không cần update Angular, `ngZone.run` chỉ khi cần update UI |

---

## 12. Kiến trúc component để tối ưu được

### 12.1. Container / Presentational / Row

Container:

```ts
@Component({
  selector: 'app-reception-page',
  template: `
    <app-reception-filter
      [filter]="filter"
      (filterChange)="onFilterChange($event)">
    </app-reception-filter>

    <app-patient-table
      [rows]="rowsVm"
      (rowChange)="onRowChange($event)">
    </app-patient-table>
  `
})
export class ReceptionPageComponent {
  rowsVm: PatientRowVm[] = [];
}
```

Presentational:

```ts
@Component({
  selector: 'app-patient-table',
  templateUrl: './patient-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientTableComponent {
  @Input() rows: PatientRowVm[] = [];
  @Output() rowChange = new EventEmitter<RowChange>();

  trackById = (_: number, row: PatientRowVm) => row.id;
}
```

Row:

```ts
@Component({
  selector: 'app-patient-row',
  templateUrl: './patient-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientRowComponent {
  @Input() row!: PatientRowVm;
  @Output() rowChange = new EventEmitter<RowChange>();
}
```

### 12.2. Lợi ích

Data flow rõ (cha truyền xuống, con emit lên) giúp: dễ dùng OnPush, dễ đo component nào lag, dễ thay row/cell mà không ảnh hưởng toàn page, dễ pre-compute ViewModel trước khi render.

### 12.3. ViewModel hoá dữ liệu

Thay vì template tự tính:

```html
<td>{{ calculateAge(patient.birthDate) }}</td>
<td>{{ getStatusText(patient.status) }}</td>
<td [class.warning]="isWarning(patient)"></td>
```

Chuẩn bị ViewModel trước:

```ts
this.rowsVm = patients.map(p => ({
  id: p.id,
  name: p.name,
  ageText: calculateAge(p.birthDate),
  statusText: getStatusText(p.status),
  isWarning: isWarning(p)
}));
```

Template chỉ đọc dữ liệu đã chuẩn bị:

```html
<td>{{ row.ageText }}</td>
<td>{{ row.statusText }}</td>
<td [class.warning]="row.isWarning"></td>
```

Template không nên là nơi xử lý business logic — nó chủ yếu đọc dữ liệu đã chuẩn bị.

---

## 13. Zone pollution

### 13.1. Zone pollution là gì

Zone pollution là khi có async task chạy trong Angular zone nhưng không thật sự cần Angular update UI, làm Angular tick liên tục. Ví dụ: `setInterval` cập nhật log nội bộ, `requestAnimationFrame` đo FPS, chart library lắng nghe `mousemove`, scroll listener không update binding, third-party lib tạo timer. Hậu quả: không thao tác gì nhưng Angular vẫn check liên tục.

### 13.2. Cách xử lý

Chạy phần không cần Angular ở ngoài zone:

```ts
this.ngZone.runOutsideAngular(() => {
  window.addEventListener('scroll', this.onScrollPassive);
});
```

Khi cần update UI thật:

```ts
this.ngZone.run(() => {
  this.visibleRange = range;
  this.cdr.markForCheck();
});
```

### 13.3. Nguyên tắc áp dụng

Không phải mọi đoạn async đều cần chạy trong Angular zone. Với mỗi callback, xác định: callback này có cần cập nhật Angular template không — nếu không, chạy `runOutsideAngular`; nếu có, chỉ re-enter Angular ở đoạn update state tối thiểu.

---

## 14. Checklist khi gặp màn hình bị giật

**A. Xác định hiện tượng**

```text
[ ] Lag lúc load?
[ ] Lag lúc gõ input/search?
[ ] Lag lúc scroll?
[ ] Lag lúc mở popup/dropdown?
[ ] Lag dù không thao tác?
```

**B. Đo bằng tool**

```text
[ ] Angular DevTools Profiler: component nào bị check nhiều?
[ ] Angular DevTools Profiler: component nào tốn time nhất?
[ ] Chrome Performance: Scripting hay Rendering/Layout/Paint tốn chính?
[ ] Network: API có chậm hoặc trả data quá lớn không?
```

**C. Kiểm tra template**

```text
[ ] Có function call trong template không? ({{ getName(row) }}, [class.warning]="isWarning(row)", *ngIf="shouldShow(row)"...)
[ ] Có tạo object/array inline không? ([config]="{ mode: 'edit' }", [data]="buildChartData(row)")
[ ] Có pipe impure (pure: false) không?
[ ] Có *ngFor/@for list lớn thiếu trackBy/track không?
[ ] Có component UI library nặng lặp lại nhiều không?
```

Với function call trong template, đánh giá: function có nặng không, có loop/filter/map bên trong không, có tạo object/array mới không, có bị gọi hàng nghìn lần không, có thể tính trước không. Với object/array tạo inline: mỗi lần check có thể tạo reference mới, làm component con OnPush bị check lại — nên đưa ra field ổn định hoặc memo/precompute.

Nếu một component vừa fetch data, transform data, quản lý form, render table lớn, validate, mở popup, tính toán trạng thái — rất khó tối ưu; cần tách theo kiến trúc container/presentational/row/cell ([§12](#12-kiến-trúc-component-để-tối-ưu-được)).

**D. Kiểm tra Change Detection**

```text
[ ] Component row/cell có OnPush chưa?
[ ] Input truyền xuống có immutable không?
[ ] Có mutate object/array không?
[ ] Async data có dùng async pipe hoặc markForCheck đúng không?
```

**E. Kiểm tra event/timer**

```text
[ ] Search/input có debounce chưa?
[ ] Scroll/mousemove có throttle hoặc outside Angular chưa?
[ ] Có setInterval/requestAnimationFrame trong Angular zone không?
[ ] Có websocket/polling bắn quá nhiều không?
```

**F. Chọn giải pháp**

```text
[ ] Nếu tick nhiều vô nghĩa → runOutsideAngular/debounce/throttle
[ ] Nếu check quá rộng → OnPush/tách component
[ ] Nếu binding nặng → precompute/pure pipe/bỏ method template
[ ] Nếu DOM quá nhiều → virtual scroll/paging/lazy render
[ ] Nếu list recreate → trackBy/track
```

**G. Đo lại**

```text
[ ] Trước fix có số liệu
[ ] Sau fix có số liệu
[ ] So sánh tick/check/time/FPS
[ ] Không phá correctness/UI update
```

---

## 15. Tóm tắt

```text
Change Detection = Angular đọc lại binding để đồng bộ data → DOM.
Zone.js = giúp Angular biết khi nào có async/event vừa chạy xong để có thể tick.
Default = tick thì quét rộng, dễ đúng nhưng dễ tốn.
OnPush = bỏ qua subtree nếu không có tín hiệu cần check.
OnPush không làm binding nhẹ hơn; nó chỉ giảm số component bị check.
Pure pipe = giảm tính toán lại khi input không đổi.
trackBy/track = giữ danh tính DOM node trong list, giảm xoá/tạo DOM.
runOutsideAngular = tránh tick vô nghĩa từ timer/event/lib không cần update UI.
Virtual scroll = giảm số DOM node thật.
Tối ưu dựa trên đo đạc, không dựa trên cảm giác.
```

### Tài liệu tham khảo

- Angular Docs — `ChangeDetectionStrategy`
- Angular Docs — `ChangeDetectorRef`
- Angular Docs — Skipping component subtrees
- Angular Docs — `NgZone`
- Angular Docs — Resolving zone pollution
- Angular Docs — `NgFor` / `TrackByFunction`
- Angular Docs — Template control flow `@for ... track`
- Chrome DevTools — Performance profiling
- Angular DevTools — Profiler

---

## 16. Thực hành: đối chiếu với trang demo Change Detection

Trang demo tại `src/app/features/change-detection` minh hoạ trực tiếp các khái niệm ở trên bằng số liệu đo được trên UI.

### 16.1. Thành phần chính

```text
IndicatorsTableComponent          → state: rows, strategy, stressMode, tickCount
├── IndicatorRowDefaultComponent    (Default, *ngIf strategy === 'default')
├── IndicatorRowOnpushComponent     (OnPush, *ngIf strategy === 'onpush')
└── IndicatorRowOnpushPipeComponent (OnPush + pure pipe `riskScore`)
```

- `RenderCounterService.checkCount` — bộ đếm toàn cục, dùng chung cho mọi row.
- `computeRiskScore()` — hàm cố ý nặng (~4000 vòng `Math.sin`), dùng để khuếch đại chi phí check.

### 16.2. `checkRender()` — cảm biến đo CD check

```html
<td>{{ checkRender() }}{{ data.id }}</td>
```

```ts
checkRender(): string {
  this.renderCount++;
  this.counter.increment();
  return '';
}
```

Vì interpolation được Angular **đọc lại mỗi lần CD check qua component đó**, số lần `checkRender()` chạy = số lần CD thực sự "ghé vào" template của row này. `renderCount` (cột "Render") và `counter.checkCount` ("Tổng lượt CD check") tăng cùng lúc vì cùng một lệnh gọi tăng cả hai.

### 16.3. Stress mode = rAF loop trong Angular zone

```ts
private startStress(): void {
  const loop = () => {
    this.tickCount++;
    this.rafId = requestAnimationFrame(loop);
  };
  this.rafId = requestAnimationFrame(loop);
}
```

Theo [§3.6](#36-frame-và-requestanimationframe), mỗi frame (~16.7ms) callback này chạy trong Angular zone → mỗi frame trigger 1 CD tick. `tickCount` đếm số tick, hoàn toàn độc lập với `checkCount` — đúng với mô hình "2 trục" ở [§3.4](#34-hai-trục-độc-lập).

### 16.4. Số liệu minh hoạ (20 rows, stress mode 1 giây, không tương tác)

| Strategy | `tickCount` | `checkCount` | Vì sao |
|---|---|---|---|
| Default | ~60 | ~1200 (= 60 × 20) | Mỗi tick, cả 20 row đều bị check ([§5.2](#52-default-quét-toàn-cây-mỗi-tick)) |
| OnPush | ~60 | 0 | `[data]="row"` không đổi reference → row bị skip ([§6.2](#62-điều-kiện-để-onpush-component-được-check)) |
| OnPush + Pure Pipe | ~60 | 0 | Giống OnPush; pure pipe cũng không cần tính lại nếu row có bị check |

`tickCount` tăng đều ở cả 3 strategy (CD vẫn được trigger), nhưng `checkCount` chỉ tăng ở Default — minh chứng trực quan cho [§6.3](#63-phạm-vi-tối-ưu-của-onpush): OnPush không ngăn tick, nó ngăn Angular *đi sâu vào* component khi input reference không đổi.

### 16.5. Pure pipe + mutate object — vì sao "Điểm rủi ro" không cập nhật ngay

```html
<nz-input-number [(ngModel)]="data.giaTri" ...></nz-input-number>
...
<nz-tag>{{ data | riskScore }}</nz-tag>
```

`[(ngModel)]="data.giaTri"` mutate trực tiếp property `giaTri` của object `data` — **reference của `data` không đổi**. Theo [§8.2](#82-pure-pipe), pure pipe chỉ tính lại khi reference input đổi → `data | riskScore` **không tính lại** dù `giaTri` vừa thay đổi và row vừa bị CD check (do `checkRender()` ở cột đầu vẫn chạy).

Giá trị "Điểm rủi ro" chỉ cập nhật khi `data` được thay bằng **object mới** — ví dụ nút "Cập nhật ngẫu nhiên 1 dòng" tạo row mới qua spread `{ ...row, giaTri: ... }`. Đây là minh chứng thực tế cho lỗi mutate object ở [§6.4](#64-các-lỗi-thường-gặp-với-onpush), áp dụng cho cả pure pipe.

### 16.6. "Stress mode OFF" không có nghĩa là 0 CD tick

`app-fps-meter` ([fps-meter.service.ts](../../../app/base/services/fps-meter.service.ts)) luôn chạy, bất kể Stress mode ON/OFF:

```ts
this.ngZone.runOutsideAngular(() => {
  let lastTime = performance.now();
  let frames = 0;
  const loop = (now: number) => {
    frames++;
    const elapsed = now - lastTime;
    if (elapsed >= 500) {                    // lấy mẫu mỗi ~500ms để tính FPS
      const fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      lastTime = now;
      this.ngZone.run(() => (this.fps = fps)); // ← quay lại zone để cập nhật số hiển thị
    }
    this.rafId = requestAnimationFrame(loop);
  };
  this.rafId = requestAnimationFrame(loop);
});
```

- rAF loop chạy **ngoài** Angular zone (`runOutsideAngular`) → bản thân 60 lần/giây này không gây CD.
- Nhưng cứ **~500ms**, `ngZone.run(() => this.fps = fps)` chạy **trong** zone → đây là 1 task hoàn thành trong zone → theo [§3.6](#36-frame-và-requestanimationframe), CD tick được trigger.
- `500ms` ở đây chỉ là **khoảng lấy mẫu để tính/hiển thị FPS cho mượt** (tránh số nhảy loạn mỗi frame) — không liên quan gì đến "chu kỳ CD". CD tick mỗi 500ms chỉ là **tác dụng phụ** của việc gọi `ngZone.run()`, đúng với [§13. Zone pollution](#13-zone-pollution).

Cập nhật bảng ở [§16.4](#164-số-liệu-minh-hoạ-20-rows-stress-mode-1-giây-không-tương-tác) với baseline khi Stress mode OFF:

| Strategy | Stress mode OFF (chỉ có FPS meter) | Stress mode ON |
|---|---|---|
| Default | `checkCount` vẫn tăng, ~40/giây (= 2 tick/giây × 20 row) | `checkCount` tăng ~1200/giây |
| OnPush / OnPush + Pipe | `checkCount` đứng yên ở 0 (tick từ FPS meter vẫn bị skip vì `data` không đổi reference) | `checkCount` đứng yên ở 0 |

→ Quy tắc "không có task chạy trong zone thì CD không chạy" vẫn đúng — chỉ là trong app thực tế gần như luôn có ít nhất 1 nguồn task nền (timer, polling, đo FPS...). Với `Default`, mọi tick — dù do nguồn nào — đều quét hết cả 20 row, nên `checkCount` không bao giờ thực sự "đứng yên" nếu có bất kỳ task nào chạy trong zone, kể cả task không liên quan gì đến bảng dữ liệu.
