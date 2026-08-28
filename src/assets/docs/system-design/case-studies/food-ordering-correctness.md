# Food Ordering Correctness Case Study

Tài liệu này dùng hệ thống đặt món để phân tích các failure mode thường gặp trong backend transactional và multi-tenant. Mỗi case bắt đầu từ dữ liệu không được phép sai, sau đó mới chọn database mechanism hoặc architecture pattern phù hợp.

## Khung phân tích

Mỗi tình huống đi qua bảy câu hỏi:

1. Hiện tượng người dùng hoặc vận hành nhìn thấy là gì?
2. Business invariant nào bị đe dọa?
3. Hai execution flow xen kẽ theo timeline nào?
4. Component nào đang sở hữu state quyết định?
5. Database primitive nhỏ nhất nào bảo vệ được invariant?
6. Giải pháp tạo thêm contention, retry hoặc operational cost gì?
7. Tín hiệu nào cho biết phải nâng cấp thiết kế?

## Case 1 — Hai khách cùng đặt món cuối

Tồn kho còn `1`. Request A và B cùng đọc `1`, cùng kết luận đủ hàng rồi cùng tạo đơn.

```text
A: SELECT soLuong → 1
B: SELECT soLuong → 1
A: UPDATE soLuong = 0
B: UPDATE soLuong = 0
A/B: đều báo đặt thành công
```

Invariant là tổng số lượng đã giữ không vượt tồn khả dụng. Một optimistic token trên `DonHang` không bảo vệ row tồn kho nếu hai request tạo hai Aggregate khác nhau.

Giải pháp nhỏ nhất là atomic conditional update:

```sql
UPDATE tonKho
SET soLuong = soLuong - @soLuongDat
WHERE tenantId = @tenantId
  AND shopId = @shopId
  AND hangHoaId = @hangHoaId
  AND soLuong >= @soLuongDat;
```

Affected rows bằng `0` được map thành hết hàng. Khi một đơn chứa nhiều món và cần quyết định phức tạp, cân nhắc lock các row theo thứ tự ổn định hoặc thiết kế reservation.

## Case 2 — Double-click tạo hai đơn

Client gửi cùng request hai lần do double-click hoặc retry sau timeout. Cả hai request hợp lệ và database transaction không tự biết chúng là cùng một intent.

Invariant là một client operation chỉ tạo một kết quả logic. Dùng `Idempotency-Key` với unique scope `(tenantId, userId, key)` và lưu response/result identity.

```text
request 1 → insert idempotency row → tạo đơn → commit
request 2 → unique conflict/found row → trả kết quả cũ
```

Không dùng distributed lock làm mặc định; unique constraint là arbiter bền vững hơn cho một database. Key cần TTL/retention và request hash để ngăn reuse key với payload khác.

## Case 3 — Client timeout nhưng server đã commit

Payment hoặc tạo đơn hoàn tất tại server, nhưng response mất trên mạng. Client không thể suy “timeout = thất bại”. Nếu retry không idempotent, duplicate side effect xuất hiện.

Giải pháp kết hợp idempotency với endpoint tra cứu operation status. Trạng thái `Unknown` ở client là trạng thái thật cần xử lý, không được biến thành `Failed` chỉ vì timeout.

## Case 4 — Hai nhân viên cập nhật cùng đơn

Nhân viên A mở đơn ở trạng thái `MoiTao`. Nhân viên B xác nhận trước; A sau đó hủy dựa trên màn hình cũ và ghi đè state mới.

Invariant là transition phải dựa trên version đã đọc. Optimistic concurrency token đưa old version vào `UPDATE ... WHERE`. Conflict trả `409`, client reload state rồi quyết định lại.

Không automatic retry command “hủy đơn”: state mới có thể làm business intent không còn hợp lệ. Retry chỉ phù hợp khi operation có thể đánh giá lại an toàn.

## Case 5 — EF tạo đơn, Dapper trừ tồn nhưng commit lệch

EF và Dapper mở hai connection riêng. Dapper commit tồn kho, sau đó EF SaveChanges lỗi. Hệ thống mất tồn nhưng không có đơn.

Invariant là đơn hàng và reservation/tồn kho cùng commit hoặc cùng rollback. Hai công cụ phải dùng cùng `DbConnection` instance và `DbTransaction` instance. Một UOW sở hữu lifecycle; Dapper command luôn nhận transaction.

Shared transaction chỉ áp dụng cho cùng database. Nếu tồn kho ở service/database khác, cần consistency protocol khác như reservation + Outbox/Saga, không thể kéo local transaction qua network một cách miễn phí.

## Case 6 — Gửi email trong database transaction

Use case mở transaction, cập nhật đơn rồi gọi email provider mất 8 giây. Row lock bị giữ suốt thời gian network call; request khác chờ và có thể timeout. Nếu email gửi xong nhưng database commit lỗi, khách nhận thông báo cho đơn chưa tồn tại.

Database transaction chỉ bao local state cần atomic. Ghi Outbox trong transaction, commit, rồi worker gửi email. Outbox giải delivery gap nhưng kéo theo duplicate delivery; consumer/provider call cần idempotency key.

## Case 7 — Domain Event handler phát event mới

`DonHangDaXacNhan` làm handler tạo lịch sử, việc đó phát `LichSuDonHangDaTao`. Dispatcher chỉ chụp event list một lần nên event thứ hai không chạy.

Nếu nested event là behavior được cho phép, commit loop phải SaveChanges và dispatch đến khi không còn pending event, đồng thời track event đã xử lý theo identity/reference. Nếu event tạo cycle A → B → A, cần sửa boundary thay vì tăng giới hạn loop tùy ý.

## Case 8 — Deadlock khi cập nhật nhiều món

Đơn A lock món `X` rồi chờ `Y`. Đơn B lock `Y` rồi chờ `X`. InnoDB chọn một transaction làm victim và rollback.

Giải pháp đầu tiên là sort resource keys và lock/update theo cùng thứ tự. Transaction cần ngắn và query cần index. Retry deadlock là lớp bảo vệ sau cùng, chỉ khi toàn use case idempotent.

Không tăng lock timeout để “sửa” deadlock; cách đó thường chỉ làm request chờ lâu hơn.

## Case 9 — Query không có index làm giảm concurrency

Một `UPDATE` có predicate đúng nhưng không có composite index `(tenantId, shopId, status)`. InnoDB scan nhiều index records và lock footprint lớn hơn dự kiến, khiến Shop khác cũng chờ.

Phân tích execution plan và access path trước khi đổi isolation. Index đúng không chỉ làm query nhanh; nó thu hẹp tập record/range bị scan và lock.

## Case 10 — Dapper query quên Tenant

EF query có global filter nhưng report dùng Dapper:

```sql
SELECT * FROM donHang WHERE shopId = @shopId;
```

Nếu identifier không globally unique hoặc join sai, dữ liệu Tenant khác có thể xuất hiện. Dapper/raw SQL phải truyền `tenantId` tường minh và dùng composite index phù hợp.

Global filter là safety net cho EF, không phải authorization boundary cho mọi data access technology.

## Case 11 — Cache key thiếu Tenant

Hai Tenant đều có `shopId = 10`. Cache dùng key `shop:10:menu`; Tenant B nhận menu của Tenant A.

Cache key phải chứa ownership scope:

```text
tenant:{tenantId}:shop:{shopId}:menu
```

Fix database filter không sửa được leak ở cache. Review tenant isolation phải đi qua request context, database, cache, message và job payload.

## Case 12 — Unique constraint sai scope

Hai Tenant cùng dùng mã hàng `BM001`. Unique index chỉ trên `maHangHoa` khiến Tenant thứ hai không tạo được dữ liệu.

Nếu business uniqueness nằm trong Tenant, constraint phải là `(tenantId, maHangHoa)`. Ngược lại, subdomain trên shared base domain có thể cần globally unique. Scope của invariant quyết định key, không phải thói quen thêm mọi cột vào index.

## Case 13 — Background job chạy sai Tenant

Request enqueue job chỉ chứa `donHangId`. Worker không có `HttpContext`, lấy nhầm ambient/default tenant hoặc query không scope.

Payload phải chứa trusted `tenantId` và operation identity. Worker tạo explicit tenant scope trước query. Không serialize toàn bộ user session nếu job chỉ cần tenant ownership và actor identity tối thiểu.

## Case 14 — Đổi isolation lên Serializable để tránh mọi race

`SERIALIZABLE` có thể giảm một số anomaly nhưng tăng blocking và không thay thế idempotency, unique constraint hay external consistency. Duplicate HTTP request vẫn là hai transaction hợp lệ; email đã gửi vẫn không rollback theo database.

Chọn mechanism theo invariant:

| Invariant/failure | Mechanism ưu tiên |
|---|---|
| Không tạo trùng intent | Idempotency key + unique constraint |
| Không bán âm | Atomic conditional update |
| Không ghi đè state cũ | Optimistic token |
| Cần đọc rồi quyết định trên row nóng | Pessimistic locking có giới hạn |
| Local writes cùng thành công | Shared transaction |
| External message không được mất | Transactional Outbox |

## Case 15 — Retry toàn transaction một cách mù quáng

Execution strategy chạy lại use case sau transient error, nhưng handler đã gọi payment provider hoặc Dapper statement không idempotent. Retry tạo charge hoặc counter duplicate.

Trước retry cần phân loại:

```text
Operation có idempotency key không?
External side effect nằm sau durable boundary chưa?
Statement có thể chạy lại an toàn không?
Error có thực sự transient không?
```

Nếu chưa trả lời được, fail rõ và reconciliation thường an toàn hơn automatic retry.

## Decision map

```text
Viết invariant
→ dựng timeline hai request hoặc partial failure
→ xác định source of truth
→ chọn primitive nhỏ nhất tại đúng boundary
→ mô tả conflict/result cho caller
→ đo contention và failure rate
→ chỉ nâng cấp khi có tín hiệu
```

Pattern chỉ là tên gọi sau khi đã hiểu failure. Hai case có cùng từ “concurrency” có thể cần hai giải pháp khác nhau: lost update dùng version token, overselling dùng atomic update, duplicate request dùng idempotency và cross-database side effect dùng Outbox/Saga.
