# Cách đánh giá dữ liệu trong hệ thống: SQL, Cache hay cả hai?

Khi thiết kế hệ thống, không nên chọn giải pháp lưu trữ theo cảm giác ("dùng cache cho nhanh", "dùng SQL cho chắc", "tách bảng riêng cho dễ"). Cách đúng là hiểu **bản chất dữ liệu** và **mục đích sử dụng dữ liệu** trước khi quyết định nơi lưu.

---

## 1. Trước tiên phải hỏi: dữ liệu này là gì?

Một dữ liệu trong hệ thống thường rơi vào vài nhóm chính:

1. Dữ liệu nghiệp vụ chính
2. Dữ liệu lịch sử / sự kiện
3. Dữ liệu trạng thái hiện tại
4. Dữ liệu tạm thời
5. Dữ liệu thống kê / tổng hợp
6. Dữ liệu phục vụ tăng tốc

Ví dụ:

**Dữ liệu nghiệp vụ chính**: Khách hàng, Hóa đơn, Phiếu khám, Đơn hàng, Giao dịch kho

**Dữ liệu lịch sử / sự kiện**: Lịch sử đăng nhập, Lịch sử đổi quyền, Lịch sử thanh toán, Lịch sử duyệt / từ chối, Lịch sử thay đổi dữ liệu

**Dữ liệu trạng thái hiện tại**: User đang online, Đơn hàng đang xử lý, Session còn sống, Thiết bị đang kết nối

**Dữ liệu tạm thời**: OTP, Token tạm, Mã xác nhận, Dữ liệu import tạm

**Dữ liệu thống kê / tổng hợp**: Tổng doanh thu ngày, Số lượt truy cập, Số đơn theo trạng thái, Tồn kho tổng hợp

**Dữ liệu phục vụ tăng tốc**: Cache danh mục, Cache cấu hình, Cache kết quả tìm kiếm

---

## 2. Phân biệt State và Event

Đây là nền tảng quan trọng nhất.

```text
State = trạng thái hiện tại của hệ thống
Event = sự kiện đã xảy ra trong quá khứ
```

**State** trả lời câu hỏi: *"Hiện tại nó đang như thế nào?"*

- User đang online không?
- Đơn hàng đang ở trạng thái nào?
- Session còn hạn không?
- Thiết bị còn kết nối không?

**Event** trả lời câu hỏi: *"Đã từng xảy ra chuyện gì?"*

- Ai đã đăng nhập?
- Ai đã đổi quyền?
- Ai đã hủy đơn?
- Ai đã sửa giá?
- Ai đã duyệt phiếu?

Cách nhớ nhanh: **State = hiện tại, Event = lịch sử**.

---

## 3. Khi nào nên dùng SQL?

SQL phù hợp với dữ liệu cần lưu bền vững, có quan hệ, cần truy vấn lại, cần báo cáo hoặc cần audit.

Nên dùng SQL khi:

- Đây là dữ liệu nguồn của hệ thống
- Dữ liệu cần lưu lâu dài
- Mất dữ liệu là không chấp nhận được
- Cần truy vấn lại theo điều kiện
- Cần báo cáo
- Cần đối soát
- Cần audit / truy vết
- Dữ liệu có quan hệ với bảng khác

Ví dụ nên lưu SQL: Khách hàng, Nhân viên, Đơn hàng, Hóa đơn, Phiếu khám, Thanh toán, Tồn kho, Lịch sử thao tác, Lịch sử đăng nhập, Lịch sử đổi quyền.

SQL thường là nơi lưu **Source of Truth** — nguồn dữ liệu đúng nhất của hệ thống.

---

## 4. Khi nào nên dùng Cache?

Cache phù hợp với dữ liệu cần đọc nhanh, tạm thời, có thể hết hạn hoặc có thể tạo lại từ nguồn khác.

Nên dùng cache khi:

- Dữ liệu cần đọc rất nhanh
- Dữ liệu có thể tính lại
- Dữ liệu có TTL
- Dữ liệu không cần lưu lịch sử đầy đủ
- Dữ liệu mất tạm thời không làm sai nghiệp vụ nghiêm trọng
- Dữ liệu chỉ là bản sao để tăng tốc

Ví dụ nên dùng cache: Session, OTP, User online, Last active, Token blacklist, Rate limit, Số lần login sai trong vài phút, Cache danh mục ít thay đổi, Cache cấu hình hệ thống.

> Cache không nên là nguồn dữ liệu chính. Cache thường là lớp phụ để tăng tốc hoặc giữ trạng thái tạm thời.

Phần "khi nào dùng cache" chỉ là điểm khởi đầu. Để thiết kế cache đúng ở mức senior, cần hiểu thêm các **design pattern, cách invalidate, và xử lý concurrency** — xem mục 17-22.

---

## 5. Khi nào dùng cả SQL và Cache?

Nhiều bài toán thực tế không phải chọn một trong hai, mà là dùng cả hai: **SQL lưu dữ liệu chuẩn, bền vững. Cache tăng tốc hoặc phục vụ realtime.**

| Dữ liệu | SQL | Cache |
|---|---|---|
| Danh mục sản phẩm | Lưu dữ liệu gốc | Đọc nhanh |
| Cấu hình hệ thống | Lưu cấu hình gốc | Tránh query nhiều lần |
| Login user | Lưu lịch sử đăng nhập | Lưu session / online status |
| Tồn kho | Lưu giao dịch kho | Lưu số tồn hiện tại để đọc nhanh |
| Báo cáo | Lưu giao dịch chi tiết | Bảng tổng hợp / cache số liệu đã tính sẵn |

---

## 6. Câu hỏi quan trọng nhất: dữ liệu này có phải Source of Truth không?

**Source of Truth** = nguồn dữ liệu chính xác nhất, dùng để khôi phục, đối soát và làm căn cứ nghiệp vụ.

Nếu dữ liệu là Source of Truth → **không nên chỉ để trong cache, phải lưu DB bền vững**.

Ví dụ Source of Truth: Hóa đơn, Thanh toán, Đơn hàng, Phiếu khám, Giao dịch kho, Lịch sử duyệt, Lịch sử thay đổi quan trọng.

Ví dụ không phải Source of Truth: Cache danh mục, Session tạm, Online status, Kết quả query đã cache, Counter tạm trong vài phút.

---

## 7. Đánh giá theo câu hỏi nghiệp vụ

Muốn biết nên lưu ở đâu, hãy hỏi: *"Dữ liệu này dùng để trả lời câu hỏi gì?"*

| Câu hỏi | Nơi lưu |
|---|---|
| "Hiện tại user có online không?" | Cache |
| "User này đã từng đăng nhập lúc nào?" | SQL |
| "Cấu hình này hiện tại là gì?" | SQL là gốc, cache để đọc nhanh |
| "Trong 5 phút user login sai bao nhiêu lần?" | Cache |
| "Tháng trước có bao nhiêu lần login sai?" | SQL |
| "Hiện tại tồn kho sản phẩm A là bao nhiêu?" | Cache / bảng tổng hợp để đọc nhanh |
| "Tồn kho này hình thành từ những giao dịch nào?" | SQL lưu lịch sử giao dịch |

---

## 8. Đánh giá theo mức độ mất dữ liệu

Câu hỏi cực quan trọng: **nếu dữ liệu này mất thì có sao không?**

- Mất gây sai nghiệp vụ (hóa đơn, giao dịch thanh toán, lịch sử duyệt, giao dịch kho) → **phải lưu DB bền vững**
- Mất vẫn tạo lại được (cache danh mục → query lại DB, online status → user heartbeat lại, cache báo cáo → tính lại) → **có thể dùng cache**

---

## 9. Đánh giá theo tần suất đọc / ghi

```text
Đọc nhiều, ít thay đổi        → SQL + cache
Ghi nhiều, cần lưu lịch sử    → SQL table riêng / queue / batch insert
Ghi rất nhiều, chỉ cần realtime → Cache / stream / queue / bảng tổng hợp
Cần truy vấn lịch sử chi tiết → SQL / log storage / Elasticsearch
```

Ví dụ:

- Danh mục tỉnh/thành: ít thay đổi, đọc nhiều → cache hợp lý
- Log thao tác: ghi nhiều, cần lịch sử → bảng log riêng, có index, có archive
- Online user: cập nhật liên tục, không cần lịch sử đầy đủ → cache hợp lý

---

## 10. Đánh giá theo thời gian sống của dữ liệu

```text
Sống vài giây / vài phút        → Cache
Sống theo phiên làm việc        → Cache / session store
Sống nhiều ngày / tháng / năm   → SQL
Cần lưu theo quy định / đối soát → SQL, archive, backup
```

Ví dụ: OTP sống 2 phút → Cache; Session sống vài giờ → Cache/Redis; Hóa đơn sống nhiều năm → SQL; Log bảo mật cần lưu vài tháng/năm → SQL/log storage.

---

## 11. Đánh giá theo cách truy vấn

Nếu cần truy vấn linh hoạt (theo user, thời gian, trạng thái, chi nhánh, loại nghiệp vụ, IP, nhân viên...) → **SQL** phù hợp hơn.

Nếu chỉ cần lấy theo key đơn giản (`userId -> online status`, `token -> blacklist`, `phone -> OTP`, `configKey -> configValue`) → **Cache** phù hợp hơn.

Cách nhớ: **Query phức tạp, cần lọc/báo cáo → SQL. Key-value, đọc nhanh, TTL → Cache.**

---

## 12. Đánh giá theo nhu cầu báo cáo

Nếu dữ liệu cần lên báo cáo → **không nên chỉ lưu cache**, vì báo cáo thường cần lọc theo thời gian, tổng hợp, đối chiếu, xuất file, kiểm tra lịch sử.

- Báo cáo doanh thu → SQL
- Báo cáo lịch sử truy cập → SQL
- Báo cáo tồn kho → SQL / bảng tổng hợp
- Số user online hiện tại → Cache

---

## 13. Checklist chọn giải pháp

Khi gặp một yêu cầu mới, tự hỏi:

1. Dữ liệu này là State hay Event?
2. Đây có phải dữ liệu nghiệp vụ chính không?
3. Đây có phải Source of Truth không?
4. Dữ liệu có cần lưu lịch sử không?
5. Có cần báo cáo / audit / đối soát không?
6. Mất dữ liệu có chấp nhận được không?
7. Dữ liệu sống trong bao lâu?
8. Truy vấn theo key đơn giản hay lọc phức tạp?
9. Đọc nhiều hay ghi nhiều?
10. Có cần realtime không?
11. Có cần TTL không?
12. Có thể tính lại từ dữ liệu gốc không?

---

## 14. Công thức phán đoán nhanh

```text
Dữ liệu nghiệp vụ chính              → SQL
Dữ liệu lịch sử / audit / đối soát   → SQL
Dữ liệu tạm thời / có TTL            → Cache
Dữ liệu đọc nhiều, ít thay đổi       → SQL + Cache
Dữ liệu realtime, trạng thái hiện tại → Cache
Vừa cần realtime vừa cần lịch sử     → SQL + Cache
Ghi nhiều nhưng cần lưu lại          → SQL table riêng + index + archive
  (lớn hơn nữa thì thêm queue / log storage)
```

---

## 15. Ví dụ tổng hợp

| Dữ liệu | Giải pháp |
|---|---|
| Khách hàng | SQL |
| Hóa đơn | SQL |
| Thanh toán | SQL |
| Phiếu khám | SQL |
| Lịch sử đổi quyền | SQL |
| Log truy cập | SQL |
| OTP | Cache |
| Session | Cache |
| User online | Cache |
| Login fail trong 5 phút | Cache (đếm nhanh); SQL nếu cần lưu lịch sử |
| Danh mục thuốc | SQL là gốc, Cache để đọc nhanh |
| Cấu hình hệ thống | SQL là gốc, Cache để đọc nhanh |
| Tồn kho hiện tại | SQL / bảng tổng hợp là gốc, Cache nếu cần đọc cực nhanh |
| Báo cáo doanh thu | SQL giao dịch gốc + bảng tổng hợp nếu dữ liệu lớn + cache cho dashboard |

---

## 16. Sai lầm hay gặp

1. **Thấy cần nhanh là dùng cache** → Sai, cache không thay thế DB cho dữ liệu quan trọng.
2. **Thấy dữ liệu nhỏ thì nhét chung bảng** → Sai nếu dữ liệu có vòng đời, tần suất ghi, mục đích truy vấn khác nhau.
3. **Không phân biệt dữ liệu gốc và dữ liệu tính toán** → Dễ lưu sai nơi, khó đối soát.
4. **Lưu mọi thứ vào SQL mà không nghĩ tới tần suất ghi** → Có thể làm DB phình to, query chậm.
5. **Dùng cache cho dữ liệu cần audit** → Dễ mất lịch sử, không điều tra được khi có sự cố.

---

## 17. Cache Patterns — các mô hình đọc/ghi cache phổ biến

Khi đã quyết định dùng cache, câu hỏi tiếp theo là: **đọc/ghi cache theo cách nào?** Đây là phần senior hay bị hỏi vì ảnh hưởng trực tiếp đến consistency, latency và rủi ro mất dữ liệu.

### 17.1 Cache-Aside (Lazy Loading)

```text
Đọc: App đọc cache → miss → query DB → set cache → trả kết quả
Ghi: App ghi DB → xoá (hoặc update) cache
```

- Phổ biến nhất, dễ implement, app chủ động quản lý cache.
- Nhược điểm: lần đầu đọc luôn miss (cold start), dễ stampede nếu nhiều request cùng miss.
- Ví dụ: cache danh mục sản phẩm, cache thông tin user theo id.

### 17.2 Read-Through

```text
App chỉ nói chuyện với cache layer.
Cache layer tự query DB khi miss, tự set lại cache.
```

- App không cần biết DB ở đâu khi đọc — cache provider lo việc load lại.
- Cần cache layer hỗ trợ (thư viện cache, hoặc tự build wrapper bao DB call).
- Khác Cache-Aside chủ yếu ở **chỗ chứa logic load lại**: trong app (Cache-Aside) hay trong cache layer (Read-Through).

### 17.3 Write-Through

```text
Ghi: App ghi vào cache → cache ghi đồng bộ xuống DB → xác nhận thành công
```

- Cache luôn đồng bộ với DB ngay sau khi ghi → đọc lại luôn đúng, không có khoảng trống stale.
- Tăng latency ghi vì phải chờ cả 2 bước hoàn tất.
- Phù hợp dữ liệu cần đọc ngay sau khi ghi và không chấp nhận stale (vd: cấu hình hệ thống).

### 17.4 Write-Behind (Write-Back)

```text
Ghi: App ghi vào cache → trả kết quả ngay → cache flush xuống DB sau (async, batch)
```

- Ghi rất nhanh, giảm tải DB (có thể batch nhiều write thành 1 lần ghi DB).
- Rủi ro: cache crash trước khi flush → mất dữ liệu chưa kịp xuống DB.
- Thường dùng cho counter, log, metrics — **không dùng cho dữ liệu Source of Truth** (giao dịch, thanh toán).

### 17.5 Write-Around

```text
Ghi: App ghi thẳng DB, KHÔNG cập nhật cache.
Đọc: lần đọc tiếp theo sẽ miss → load lại theo Cache-Aside.
```

- Tránh cache bị "rác" bởi dữ liệu vừa ghi nhưng ít khi đọc lại.
- Đánh đổi: lần đọc đầu sau khi ghi sẽ chậm hơn (miss).

### So sánh nhanh

| Pattern | Độ phức tạp | Latency ghi | Rủi ro mất data | Khi dùng |
|---|---|---|---|---|
| Cache-Aside | Thấp | Thấp (ghi DB như thường) | Thấp | Mặc định cho hầu hết trường hợp |
| Read-Through | Trung bình (cần cache layer hỗ trợ) | — | Thấp | Khi muốn tách logic load khỏi app |
| Write-Through | Trung bình | Cao | Thấp | Cần đọc ngay sau ghi, không chấp nhận stale |
| Write-Behind | Cao | Rất thấp | Cao nếu cache crash | Counter, log, dữ liệu không quan trọng tuyệt đối |
| Write-Around | Thấp | Thấp | Thấp | Dữ liệu ghi nhiều, đọc lại ít |

> Senior tip: 90% hệ thống chỉ cần **Cache-Aside cho đọc + invalidate cache khi ghi DB**. Đừng vội nhảy vào Write-Through/Write-Behind nếu chưa đo được vấn đề thật cần giải quyết.

---

## 18. Cache Invalidation — bài toán khó nhất của caching

> "There are only two hard things in Computer Science: cache invalidation and naming things."

Dữ liệu cache **đúng tại thời điểm set**, nhưng DB có thể thay đổi sau đó → cache trở thành stale. Có 4 hướng xử lý chính:

### 18.1 TTL-based (hết hạn theo thời gian)

- Đơn giản nhất: set TTL, hết hạn tự bay, không cần code invalidate riêng.
- Đánh đổi giữa **độ mới của dữ liệu** và **tần suất query DB**.
- TTL ngắn → dữ liệu mới hơn nhưng cache miss nhiều hơn (tải DB cao hơn).
- TTL dài → giảm tải DB nhưng dữ liệu có thể cũ trong suốt khoảng TTL đó.

### 18.2 Event-based (invalidate khi ghi)

```text
Update DB → xoá (hoặc update) cache key liên quan ngay lập tức
```

- Chính xác hơn TTL, nhưng phải invalidate **đúng và đủ** các key liên quan — dễ sót khi 1 entity được cache ở nhiều dạng (detail, list, count...).
- Senior cần thiết kế **cache key có cấu trúc** để biết invalidate cái gì khi 1 entity thay đổi (xem mục 20.3).

### 18.3 Versioning / Key theo version

```text
key = "product:{id}:v{version}"
```

- Khi data đổi, tăng version → key cũ tự "chết" (không ai đọc nữa), không cần xoá tay từng key.
- Cache cũ tự bị evict theo policy (LRU/TTL) mà không gây sai dữ liệu.
- Hữu ích khi invalidate theo event quá phức tạp (nhiều entity liên quan tới nhau).

### 18.4 Stale-While-Revalidate

```text
Đọc cache đã hết hạn → vẫn trả về (stale) ngay cho user
→ đồng thời trigger 1 request nền để refresh lại cache
```

- Ưu tiên latency: user luôn nhận response nhanh, dữ liệu "cũ một chút" vẫn chấp nhận được (vd: danh mục, tin tức).
- Không phù hợp với dữ liệu cần chính xác tuyệt đối (giá, tồn kho lúc thanh toán).

---

## 19. Cache Stampede & Race Condition — vấn đề concurrency khi cache miss

### 19.1 Cache Stampede / Thundering Herd

```text
Key hot expire → hàng nghìn request cùng lúc miss
→ hàng nghìn query cùng dồn xuống DB cùng thời điểm → DB sập
```

Giải pháp:

- **Locking / Mutex**: request đầu tiên miss sẽ "lock" key, đi query DB và set lại cache; các request khác trong lúc đó **chờ** hoặc **trả dữ liệu cũ (stale)** thay vì cùng query DB.
- **Jitter TTL**: thay vì TTL cố định (vd: tất cả key cùng hết hạn sau 60s), random TTL trong khoảng (vd: 50-70s) để các key không expire đồng loạt.
- **Early/Probabilistic refresh**: trước khi key thật sự hết hạn (vd: còn 10% TTL), một số request sẽ "âm thầm" refresh trước — tránh để key chết hẳn rồi mới refresh.

### 19.2 Race Condition giữa update DB và update cache

Thứ tự sai có thể khiến **dữ liệu cũ bị cache lại**:

```text
Sai:
1. Update DB
2. Xoá cache
   (giữa lúc đó, 1 request khác đọc miss → query DB cũ → set cache cũ)
```

Hướng xử lý phổ biến:

- **Xoá cache sau khi commit DB thành công**, không update cache trực tiếp — update trực tiếp dễ bị out-of-order khi có nhiều writer.
- **Double-delete**: xoá cache trước khi update DB, và xoá lại lần nữa sau khi update DB (delay nhỏ) để dọn các bản cache bị set nhầm trong khoảng race.
- Với dữ liệu cực nhạy (giá, tồn kho lúc đặt hàng) → **đừng tin cache ở bước quyết định cuối cùng** (checkout, trừ kho) — đọc thẳng DB hoặc dùng lock.

---

## 20. Eviction, Multi-level Cache & Cache Key Design

### 20.1 Eviction Policy — cache đầy thì bỏ gì?

| Policy | Bỏ key nào | Phù hợp |
|---|---|---|
| LRU (Least Recently Used) | Lâu nhất chưa được đọc | Phổ biến nhất, hợp lý cho đa số trường hợp |
| LFU (Least Frequently Used) | Ít được đọc nhất | Dữ liệu có "hot key" rõ rệt, truy cập lệch |
| FIFO | Vào trước ra trước | Hàng đợi, không quan tâm tần suất đọc |
| TTL-based | Hết hạn theo thời gian | Dữ liệu có vòng đời rõ (OTP, session) |

### 20.2 Multi-level Caching

```text
Browser/CDN cache → App in-memory (local) cache → Distributed cache (Redis) → DB
```

- **Local cache** (in-memory trong từng instance): nhanh nhất, nhưng không đồng bộ giữa nhiều instance (mỗi instance có bản riêng) → dễ gây inconsistency khi scale-out.
- **Distributed cache** (Redis/Memcached): đồng bộ giữa các instance, thêm 1 network hop nhưng vẫn nhanh hơn DB rất nhiều.
- Senior thường kết hợp cả hai: local cache TTL rất ngắn (vài giây, giảm tải lên Redis cho hot key) + Redis là tầng cache chính + DB là nguồn cuối.

### 20.3 Cache Key Design

- Đặt key có **namespace + entity + id + version**: `product:{id}:v{version}`, `report:revenue:{branchId}:{date}`.
- Tránh **cardinality explosion**: key sinh ra theo tổ hợp quá nhiều tham số (vd: cache theo từng filter combo của user) → cache phình to, hit ratio thấp.
- Khi 1 entity thay đổi, phải biết **danh sách pattern key nào cần invalidate** (detail, list, count, related entity) — nếu không thiết kế trước, rất dễ sót.

### 20.4 Cache Warm-up

- Sau deploy/restart, cache rỗng → traffic đầu tiên dồn hết xuống DB ("cold start spike").
- Với dữ liệu hot, ít thay đổi (danh mục, cấu hình) → **pre-load cache khi service start**, trước khi nhận traffic thật.

---

## 21. Cache Down thì sao? — Failure Handling

Senior luôn đặt câu hỏi: **"Nếu Redis chết ngay bây giờ, hệ thống còn chạy đúng không, chỉ chậm hơn hay sập luôn?"**

- Cache nên là **tầng tối ưu, không phải tầng bắt buộc**: code đọc cache miss/lỗi → fallback query DB, không throw lỗi cho user.
- Tránh **single point of failure**: nếu toàn bộ luồng nghiệp vụ chính (login, checkout, đặt hàng) bắt buộc phải có Redis mới chạy được → cache đã âm thầm trở thành một phần "Source of Truth" mà không ai chủ đích thiết kế vậy.
- Có circuit breaker / timeout ngắn cho cache: nếu Redis chậm/down, fail-fast và đi DB, đừng để request bị treo chờ cache.
- Monitor **cache hit ratio** — hit ratio giảm bất thường thường là dấu hiệu sớm của vấn đề (cache bị flush, key design sai, TTL sai).

---

## 22. Tư duy Senior khi thiết kế Cache (tổng hợp)

Junior hỏi: *"Cái này có nên cache không?"*

Senior hỏi thêm:

1. **Nếu cache sai/mất/down, hệ thống còn đúng không?** (chỉ chậm hơn = ổn; sai nghiệp vụ = thiết kế lại)
2. **Ai chịu trách nhiệm invalidate cache khi data đổi?** — có sót case nào không (update qua API khác, batch job, import...)?
3. **Pattern nào phù hợp** — Cache-Aside (đa số), hay cần Write-Through/Behind (có lý do rõ ràng)?
4. **TTL bao nhiêu là hợp lý** dựa trên mức độ "chấp nhận cũ" của dữ liệu (staleness budget)?
5. **Hot key nào có thể gây stampede** khi expire? Cần jitter/lock không?
6. **Cache key có bị cardinality explosion** không khi data/filter tăng?
7. **Local cache hay distributed cache** — và hệ quả khi scale ra nhiều instance?
8. **Có đang vô tình biến cache thành Source of Truth** không (dữ liệu chỉ tồn tại trong cache, mất là mất luôn)?

```text
Công thức nhớ:
Cache = optimization, có thể tắt được mà hệ thống vẫn ĐÚNG (chỉ CHẬM hơn).
Nếu tắt cache mà hệ thống SAI → đó không còn là cache, đó là Source of Truth giả danh cache.
```

---

## 23. Tư duy chốt

Đừng bắt đầu bằng câu hỏi *"Dùng cache hay SQL?"*. Hãy bắt đầu bằng:

- Dữ liệu này là gì?
- Nó dùng để trả lời câu hỏi nào?
- Nó có phải dữ liệu gốc không?
- Mất nó có sao không?
- Nó cần sống bao lâu?
- Có cần truy vấn lịch sử không?

**Kết luận**: SQL dùng cho dữ liệu bền vững, dữ liệu gốc, lịch sử, báo cáo, audit. Cache dùng cho dữ liệu tạm thời, tăng tốc, realtime, có TTL, có thể tính lại. Hệ thống thực tế thường kết hợp: **SQL làm nguồn đúng, Cache làm lớp tăng tốc.**
