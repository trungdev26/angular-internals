# Concurrency Control Patterns

Transaction trả lời câu hỏi: "Những thay đổi nào phải cùng commit?"

Locking & Deadlock trả lời câu hỏi: "Database điều phối đọc/ghi đồng thời như thế nào?"

Bài này trả lời câu hỏi thực dụng hơn:

```text
Khi nhiều request cùng đụng vào một dữ liệu, mình nên chọn pattern nào?
```

Concurrency control không phải là một kỹ thuật duy nhất. Nó là cách phối hợp transaction, constraint, câu SQL, lock, version, retry và idempotency để bảo vệ invariant nghiệp vụ khi production có nhiều request thật.

---

## 1. Tư duy chọn pattern

Đừng bắt đầu bằng câu hỏi "có cần lock không?"

Hãy bắt đầu bằng 4 câu hỏi:

1. Invariant nào không được phá?
2. Nhiều request có thể cùng tác động vào cùng key/dòng/khoảng dữ liệu không?
3. Khi conflict xảy ra, nên chờ, fail nhanh, retry hay báo user tải lại?
4. Operation có thể retry an toàn không?

Ví dụ:

| Invariant | Rủi ro đồng thời | Pattern thường dùng |
|---|---|---|
| Email user không trùng | Hai request cùng tạo user | Unique constraint |
| Một request thanh toán không charge hai lần | Client retry sau timeout | Idempotency key + unique constraint |
| Tồn kho không âm | Nhiều đơn cùng trừ kho | Atomic update có điều kiện hoặc pessimistic lock |
| Không ghi đè thay đổi của người khác | Hai người cùng sửa form | Optimistic concurrency |
| Không booking trùng slot | Hai request cùng đặt cùng khoảng thời gian | Constraint/atomic insert/serializable/range lock |
| Một job chỉ được một worker xử lý | Nhiều worker cùng claim job | Atomic claim hoặc `SKIP LOCKED` |
| Event không mất sau commit | App crash giữa DB và queue | Outbox + consumer idempotent |

---

## 2. Bảng chọn nhanh

| Tình huống | Ưu tiên chọn | Vì sao |
|---|---|---|
| Chống duplicate theo business key | Unique constraint | Database là nơi chắc nhất để chặn trùng khi request chạy song song |
| Client/API có thể retry | Idempotency key | Retry không được tạo thêm dữ liệu hoặc side effect mới |
| Cập nhật số lượng/số dư/quota | Atomic update có điều kiện | Giảm cửa sổ race của read-check-write |
| User mở form lâu rồi submit | Optimistic concurrency | Không giữ lock trong lúc user suy nghĩ/nhập liệu |
| Conflict hiếm, UX chấp nhận báo lỗi | Optimistic concurrency | Scale tốt hơn lock trước |
| Conflict cao, dữ liệu rất nóng | Pessimistic lock hoặc queue theo key | Chấp nhận chờ để tránh nhiều conflict/retry |
| Cần check điều kiện trên một khoảng | Constraint nếu có, nếu không thì isolation/lock phù hợp | `SELECT rồi INSERT` thường không đủ an toàn |
| Nhiều worker lấy việc | Atomic claim | Không để hai worker cùng xử lý một job |
| Deadlock/serialization failure | Retry có backoff | Chỉ retry khi operation idempotent |
| Side effect sau commit | Outbox/inbox | Không publish trực tiếp trong transaction |

Nguyên tắc ngắn:

```text
Constraint bảo vệ invariant.
Atomic update bảo vệ phép ghi đơn giản.
Optimistic concurrency bảo vệ form/edit flow.
Pessimistic lock bảo vệ vùng tranh chấp nóng.
Idempotency bảo vệ retry.
Outbox bảo vệ side effect sau commit.
```

---

## 3. Bảng đổi pattern: không dùng X thì dùng Y

Một pattern tốt trong case này có thể là lựa chọn tệ trong case khác. Khi review thiết kế, nên hỏi thêm:

```text
Nếu không dùng pattern này, mình đang chuyển rủi ro sang đâu?
```

| Đang định dùng | Nhược điểm chính | Khi không nên dùng | Thay bằng |
|---|---|---|---|
| Unique constraint | Chỉ chặn được invariant biểu diễn được bằng key/index | Rule là khoảng thời gian chồng lấn phức tạp hoặc cần workflow phê duyệt | Exclusion constraint, atomic state transition, hoặc transaction isolation phù hợp |
| Idempotency key | Tốn bảng lưu key/result, phải xử lý trạng thái đang chạy | Operation không retry hoặc chỉ là read request | Không cần idempotency; dùng cache/log/correlation id nếu chỉ cần trace |
| Atomic update | Khó diễn đạt logic nhiều bước, không phù hợp khi phải gọi service ngoài | Cần đọc nhiều bảng, tính rule phức tạp, hoặc conflict rất cao | Transaction ngắn + pessimistic lock, hoặc queue theo key nóng |
| Optimistic concurrency | User có thể gặp conflict và phải reload/merge | Conflict xảy ra liên tục hoặc mỗi conflict rất đắt | Pessimistic lock, atomic state transition, hoặc queue tuần tự |
| Pessimistic lock | Giữ lock, gây blocking, dễ deadlock nếu dùng rộng | User nhập form lâu, gọi API ngoài, batch lớn | Optimistic concurrency, atomic update, hoặc outbox/job sau commit |
| Queue theo key | Không realtime tuyệt đối, tăng độ phức tạp vận hành | Cần trả kết quả đồng bộ ngay và throughput thấp | Atomic update hoặc transaction local ngắn |
| Atomic claim | Cần timeout/recover job kẹt, handler phải idempotent | Chỉ có một worker hoặc job không quan trọng nếu chạy trùng | Worker đơn giản, scheduled job tuần tự, hoặc unique processing key |
| Outbox/inbox | Có độ trễ, at-least-once, cần worker/monitoring | Không có side effect ngoài DB hoặc event mất không ảnh hưởng | Gọi trực tiếp sau commit nếu nghiệp vụ nhẹ và chấp nhận mất event |

Không có pattern nào miễn phí. Senior không chọn pattern vì nó "ngầu", mà vì chi phí của nó nhỏ hơn rủi ro nghiệp vụ nếu không dùng.

---

## 4. Pattern 1: Unique constraint

Unique constraint là pattern concurrency đơn giản nhưng cực mạnh.

Sai:

```sql
SELECT COUNT(*)
FROM Users
WHERE Email = @email;

-- Nếu chưa có thì insert
INSERT INTO Users(Email)
VALUES (@email);
```

Hai request chạy cùng lúc có thể đều thấy email chưa tồn tại rồi cùng insert.

Đúng hơn:

```sql
CREATE UNIQUE INDEX UX_Users_Email
ON Users(Email);
```

Khi insert:

```text
Insert thành công -> tạo user.
Unique violation -> trả lỗi email đã tồn tại hoặc đọc lại user cũ nếu nghiệp vụ cho phép.
```

Điểm quan trọng:

- Check trước insert chỉ giúp UX tốt hơn, không thay thế constraint.
- Constraint phải bám theo business invariant thật.
- App phải xử lý lỗi unique violation như một nhánh nghiệp vụ có kiểm soát.

Nhược điểm:

- Chỉ bảo vệ được rule biểu diễn được bằng key/index.
- Có thể làm insert fail ở runtime, nên app phải map lỗi database sang lỗi nghiệp vụ dễ hiểu.
- Unique index trên bảng ghi rất nóng có thể trở thành điểm contention.
- Với soft delete/multi-tenant, phải thiết kế key cẩn thận, ví dụ `(TenantId, Email)` hoặc filtered unique index.

Khi không dùng unique constraint thì dùng gì?

| Case | Không nên chỉ dùng unique constraint | Thay bằng |
|---|---|---|
| Booking theo khoảng thời gian tự do | Unique `(RoomId, StartTime)` không chặn được overlap `09:00-10:00` và `09:30-10:30` | Exclusion constraint nếu DB hỗ trợ, hoặc serializable/range lock |
| Rule cần người duyệt trùng dữ liệu | Database không biết trường hợp nào được phép trùng tạm thời | Workflow trạng thái + review queue |
| Dữ liệu trùng được merge sau | Chặn cứng có thể làm mất UX nhập liệu | Cho tạo draft + job phát hiện duplicate + merge flow |

---

## 5. Pattern 2: Idempotency key

Idempotency dùng khi cùng một command có thể được gửi lại.

Ví dụ:

```text
Client gửi request tạo payment.
Server xử lý xong nhưng response timeout.
Client retry.
```

Nếu không có idempotency, retry có thể charge tiền lần hai.

Thiết kế thường dùng:

```sql
CREATE UNIQUE INDEX UX_Payments_IdempotencyKey
ON Payments(IdempotencyKey);
```

Flow:

```text
1. Client gửi IdempotencyKey.
2. Server kiểm tra key đã xử lý chưa.
3. Nếu đã xử lý, trả lại kết quả cũ.
4. Nếu đang xử lý, trả trạng thái đang xử lý hoặc chờ tùy thiết kế.
5. Nếu chưa có, xử lý request mới trong transaction.
```

Idempotency key nên đi cùng:

- Unique constraint
- Lưu trạng thái xử lý
- Lưu response/result đủ để trả lại
- TTL hoặc chính sách lưu trữ nếu dữ liệu lớn
- Log/correlation id để debug retry

Nhược điểm:

- Phải lưu key, trạng thái và có thể cả response/result.
- Nếu key scope sai, có thể chặn nhầm request hợp lệ hoặc không chặn được duplicate.
- Nếu request đầu tiên đang xử lý lâu, request retry cần chính sách rõ: chờ, trả `Processing`, hay fail nhanh.
- Không thay thế transaction. Nó chỉ giúp gọi lại an toàn hơn.

Khi không dùng idempotency key thì dùng gì?

| Case | Vì sao không cần/không đủ | Thay bằng |
|---|---|---|
| GET/search/list | Request không đổi state | Cache, correlation id, rate limit nếu cần |
| Command không được retry bởi client/worker | Key làm phức tạp không cần thiết | Log business id + transaction bình thường |
| Message consumer có thể nhận trùng | Idempotency key ở API không bảo vệ consumer | Inbox table hoặc processed-message unique key |
| External provider tự có idempotency | Tự làm thêm có thể trùng trách nhiệm | Dùng provider idempotency key + lưu mapping nội bộ |

---

## 6. Pattern 3: Atomic update có điều kiện

Atomic update phù hợp với các phép ghi kiểu trừ kho, trừ quota, chuyển trạng thái.

Sai:

```text
Read StockQuantity
Check còn đủ
Tính số mới trong memory
Update StockQuantity = số mới
```

Dễ lost update khi hai request cùng đọc một giá trị cũ.

Tốt hơn:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

Sau đó check affected rows:

```text
1 row affected -> trừ kho thành công.
0 row affected -> không đủ tồn hoặc product không còn hợp lệ.
```

Ưu điểm:

- Check và update xảy ra trong cùng một câu lệnh.
- Database tự đảm bảo atomic ở mức statement.
- Giảm cửa sổ race condition.
- Dễ kết hợp với transaction để ghi lịch sử kho.

Nhược điểm:

- Chỉ hợp với rule có thể đưa vào `WHERE` hoặc biểu thức update gọn.
- Logic phức tạp nhiều bảng có thể làm câu SQL khó đọc, khó test.
- Nếu update nhiều dòng không theo thứ tự nhất quán, vẫn có thể deadlock.
- Không giải quyết side effect ngoài database.

Khi không dùng atomic update thì dùng gì?

| Case | Atomic update chưa đủ | Thay bằng |
|---|---|---|
| Trừ kho cần kiểm tra nhiều bảng giá, khuyến mãi, hạn mức | Một câu `UPDATE` trở nên quá phức tạp | Transaction ngắn + lock đúng dòng cần đọc |
| Một product quá nóng, hàng nghìn request cùng trừ | Database row trở thành điểm nghẽn | Queue theo ProductId hoặc reservation service |
| Cần gọi payment trước khi giữ hàng | Không nên giữ transaction trong lúc gọi provider | Saga/reservation timeout + outbox |

---

## 7. Pattern 4: Optimistic concurrency

Optimistic concurrency phù hợp khi conflict không quá thường xuyên và không muốn giữ lock lâu.

Ví dụ form sửa thông tin bệnh nhân, đơn hàng, cấu hình:

```text
User A mở form lúc Version = 5.
User B cũng mở form lúc Version = 5.
User A lưu trước, Version thành 6.
User B lưu sau với expected Version = 5.
Hệ thống phát hiện dữ liệu đã bị đổi.
```

SQL ý tưởng:

```sql
UPDATE Patients
SET FullName = @fullName,
    PhoneNumber = @phoneNumber,
    RowVersion = RowVersion + 1
WHERE Id = @id
  AND RowVersion = @expectedVersion;
```

Check affected rows:

```text
1 row affected -> lưu thành công.
0 row affected -> dữ liệu đã bị người khác sửa, cần reload/merge/báo user.
```

Nên dùng khi:

- User có thể giữ form lâu.
- Conflict không quá dày.
- UX chấp nhận báo "dữ liệu đã thay đổi".
- Không muốn lock database trong lúc user nhập liệu.

Không nên dùng một mình khi:

- Conflict rất cao.
- Mỗi conflict gây thiệt hại lớn.
- Operation cần tuần tự hóa mạnh, ví dụ rút tiền hoặc claim tài nguyên khan hiếm.

Nhược điểm:

- Conflict bị phát hiện muộn, thường là lúc user bấm lưu.
- Cần UX xử lý conflict: reload, merge, hoặc cho user chọn ghi đè có kiểm soát.
- Nếu conflict cao, nhiều request sẽ fail/retry làm user khó chịu.
- Nếu quên gửi/kiểm tra version ở một API update, pattern bị thủng.

Khi không dùng optimistic concurrency thì dùng gì?

| Case | Vì sao không hợp | Thay bằng |
|---|---|---|
| Rút tiền/chuyển tiền | Conflict không nên để user retry thủ công | Transaction chặt + atomic update/lock theo tài khoản |
| Claim voucher số lượng ít lúc flash sale | Conflict rất cao, nhiều request fail | Queue theo voucher/campaign hoặc atomic update thật gọn |
| Admin muốn khóa hồ sơ để xử lý độc quyền | UX cần quyền giữ hồ sơ tạm thời | Application-level lease/lock có timeout |

---

## 8. Pattern 5: Pessimistic lock

Pessimistic lock khóa trước khi xử lý, giả định khả năng tranh chấp cao.

Ví dụ PostgreSQL:

```sql
BEGIN;

SELECT StockQuantity
FROM Products
WHERE Id = @productId
FOR UPDATE;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

COMMIT;
```

Ví dụ SQL Server:

```sql
BEGIN TRANSACTION;

SELECT StockQuantity
FROM Products WITH (UPDLOCK, ROWLOCK)
WHERE Id = @productId;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

COMMIT;
```

Dùng khi:

- Conflict cao.
- Không muốn nhiều request cùng xử lý rồi fail/retry.
- Cần bảo vệ một đoạn logic phải đọc rồi ghi.

Cẩn thận:

- Transaction phải ngắn.
- Query phải có index đúng.
- Không gọi API ngoài khi đang giữ lock.
- Luôn update nhiều dòng theo thứ tự nhất quán.

Nhược điểm:

- Làm request khác phải chờ.
- Transaction dài sẽ kéo theo blocking, timeout, deadlock.
- Dễ bị lạm dụng thành "khóa cho chắc" và làm giảm throughput.
- Hành vi lock khác nhau giữa SQL Server, PostgreSQL, MySQL/InnoDB.

Khi không dùng pessimistic lock thì dùng gì?

| Case | Vì sao không hợp | Thay bằng |
|---|---|---|
| User mở form nhập 10 phút | Không thể giữ DB lock trong lúc user nhập | Optimistic concurrency bằng RowVersion |
| Gửi email/payment/upload file | Side effect chậm và không rollback được | Commit DB trước + outbox/job |
| Batch update hàng triệu dòng | Lock lớn, log phình, rollback lâu | Chia batch nhỏ + checkpoint + index đúng |
| Conflict thấp | Lock trước làm tốn chi phí không cần thiết | Atomic update hoặc optimistic concurrency |

---

## 9. Pattern 6: Queue theo key nóng

Không phải mọi vấn đề concurrency đều nên giải bằng lock database.

Nếu một key quá nóng, ví dụ một mã khuyến mãi flash sale hoặc một sản phẩm hot, có thể dùng queue theo key:

```text
Request vào -> ghi command/job.
Worker xử lý tuần tự theo ProductId hoặc PromotionId.
Mỗi key nóng chỉ có một luồng ghi chính.
```

Ưu điểm:

- Giảm contention trực tiếp lên database.
- Dễ kiểm soát throughput.
- Dễ retry theo job.

Đổi lại:

- Kết quả có thể không còn realtime tuyệt đối.
- Cần trạng thái pending/processing/done.
- Cần idempotency cho command.
- Cần monitoring queue lag.

Pattern này hợp với:

- Flash sale
- Claim voucher
- Cập nhật điểm/quota rất nóng
- Workflow có thể xử lý async

Nhược điểm:

- Kết quả thường là eventual consistency.
- Cần vận hành queue, worker, retry, dead-letter, monitoring lag.
- Nếu partition key chọn sai, vẫn nghẽn hoặc xử lý sai thứ tự.
- Debug khó hơn request/response đồng bộ.

Khi không dùng queue theo key thì dùng gì?

| Case | Vì sao không hợp | Thay bằng |
|---|---|---|
| User cần biết kết quả ngay | Queue làm UX thành pending | Atomic update đồng bộ |
| Throughput thấp, conflict thấp | Queue làm kiến trúc nặng hơn vấn đề | Transaction local đơn giản |
| Cần transaction mạnh trong một DB | Queue tách flow thành nhiều bước | Transaction ngắn + constraint/lock |

---

## 10. Pattern 7: Atomic claim cho worker

Khi nhiều worker cùng lấy job, không được làm kiểu:

```sql
SELECT *
FROM Jobs
WHERE Status = 'Pending'
LIMIT 1;

-- Sau đó mới update Processing
```

Hai worker có thể cùng đọc một job.

Tốt hơn là claim bằng update có điều kiện:

```sql
UPDATE Jobs
SET Status = 'Processing',
    WorkerId = @workerId,
    StartedAt = CURRENT_TIMESTAMP
WHERE Id = @jobId
  AND Status = 'Pending';
```

Check affected rows:

```text
1 row affected -> worker claim được job.
0 row affected -> job đã bị worker khác lấy.
```

Với PostgreSQL có thể dùng pattern `FOR UPDATE SKIP LOCKED` cho worker pool:

```sql
SELECT Id
FROM Jobs
WHERE Status = 'Pending'
ORDER BY CreatedAt
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

Dù dùng cách nào, worker vẫn cần:

- Retry có giới hạn
- Timeout cho job bị kẹt ở Processing
- Idempotent handler
- Log job id/correlation id

Nhược điểm:

- Job có thể kẹt ở `Processing` nếu worker chết sau khi claim.
- Cần cơ chế lease/timeout để đưa job về `Pending`.
- Handler vẫn phải idempotent vì worker có thể chạy lại sau timeout.
- Nếu query lấy job thiếu index, worker pool có thể scan và lock rộng.

Khi không dùng atomic claim thì dùng gì?

| Case | Vì sao không cần/không hợp | Thay bằng |
|---|---|---|
| Chỉ có một worker duy nhất | Không có cạnh tranh claim job | Scheduled worker tuần tự đơn giản |
| Broker đã có cơ chế ack/visibility timeout | Tự claim trong DB có thể trùng trách nhiệm | Dùng semantics của broker + idempotent consumer |
| Job phải giữ thứ tự nghiêm theo key | Claim tự do có thể làm đảo thứ tự | Queue partition theo key |

---

## 11. Pattern 8: Outbox/inbox

Outbox giải quyết vấn đề DB commit và side effect ngoài database không atomic với nhau.

Sai:

```text
Begin transaction
Insert Order
Publish OrderCreated vào queue
Commit fail
```

Consumer nhận event nhưng order không tồn tại.

Sai theo hướng ngược:

```text
Begin transaction
Insert Order
Commit
Publish OrderCreated fail
```

Order tồn tại nhưng event mất.

Tốt hơn:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status)
VALUES (@orderId, @customerId, 'Created');

INSERT INTO OutboxMessages(Id, Type, Payload, CreatedAt)
VALUES (@messageId, 'OrderCreated', @payload, CURRENT_TIMESTAMP);

COMMIT;
```

Worker đọc outbox sau commit và publish ra ngoài.

Điểm quan trọng:

- Outbox thường là at-least-once delivery.
- Consumer phải idempotent.
- Inbox giúp consumer chống xử lý trùng message.
- Cần retry/backoff và monitoring message bị kẹt.

Nhược điểm:

- Event không đi ngay lập tức, có độ trễ từ worker.
- Consumer có thể nhận trùng vì thường là at-least-once.
- Cần thêm bảng outbox/inbox, cleanup, retry, dashboard vận hành.
- Nếu payload/schema event thiết kế kém, lỗi sẽ lan sang consumer.

Khi không dùng outbox/inbox thì dùng gì?

| Case | Vì sao không cần/không hợp | Thay bằng |
|---|---|---|
| Không có side effect ngoài DB | Outbox là thừa | Transaction DB bình thường |
| Event chỉ để analytics không quan trọng | Mất event chấp nhận được | Publish best-effort sau commit + log |
| Cần response realtime từ service ngoài | Outbox async không trả kết quả ngay | Saga/request-reply có timeout, hoặc gọi ngoài trước transaction tùy nghiệp vụ |
| Hạ tầng DB/broker hỗ trợ transaction chung thật sự | Có thể không cần outbox | Cân nhắc distributed transaction, nhưng phải tính chi phí vận hành |

---

## 12. Case thực tế 1: Tạo đơn hàng và trừ kho

Yêu cầu:

- Tạo order
- Tạo order items
- Trừ tồn kho
- Không cho tồn âm
- Client có thể retry khi timeout
- Phát event `OrderCreated`

Thiết kế đề xuất:

```text
1. Client gửi IdempotencyKey.
2. Begin transaction.
3. Insert Order với IdempotencyKey unique.
4. Insert OrderItems.
5. Sort ProductId tăng dần trước khi trừ kho.
6. Trừ kho bằng atomic update có điều kiện.
7. Nếu product nào affected rows = 0 thì rollback.
8. Insert StockTransactions.
9. Insert OutboxMessage(OrderCreated).
10. Commit.
11. Worker publish event sau commit.
```

SQL ý tưởng:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status, IdempotencyKey)
VALUES (@orderId, @customerId, 'Created', @idempotencyKey);

INSERT INTO OrderItems(OrderId, ProductId, Quantity, Price)
VALUES (@orderId, @productId, @quantity, @price);

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

-- Nếu affected rows = 0: rollback và báo không đủ tồn

INSERT INTO StockTransactions(ProductId, Quantity, RefId)
VALUES (@productId, -@quantity, @orderId);

INSERT INTO OutboxMessages(Id, Type, Payload)
VALUES (@messageId, 'OrderCreated', @payload);

COMMIT;
```

Pattern đang dùng:

- Idempotency key chống retry tạo trùng order.
- Unique constraint trên `Orders.IdempotencyKey`.
- Atomic update chống oversell.
- Sort ProductId để giảm deadlock khi order có nhiều sản phẩm.
- Outbox để event không mất.

Vì sao không chọn pattern khác?

| Không chọn | Lý do |
|---|---|
| Chỉ dùng transaction | Transaction không tự chống oversell nếu code read-check-write sai |
| Chỉ dùng pessimistic lock | Có thể đúng nhưng dễ giữ lock lâu hơn; atomic update đủ gọn cho trừ kho |
| Publish event trực tiếp | Event có thể đi ra ngoài dù transaction rollback hoặc bị mất sau commit |
| Retry mù | Timeout retry có thể tạo trùng order nếu không có idempotency key |

---

## 13. Case thực tế 2: Hai người cùng sửa một hồ sơ

Yêu cầu:

- User A và User B có thể cùng mở màn hình edit.
- Không được để người lưu sau âm thầm ghi đè người lưu trước.
- Không muốn giữ lock trong lúc user đang nhập liệu.

Thiết kế đề xuất:

```text
1. API detail trả thêm RowVersion.
2. UI giữ RowVersion cùng form.
3. Khi submit, gửi expected RowVersion.
4. Backend update với điều kiện RowVersion = expected.
5. Nếu affected rows = 0, báo dữ liệu đã thay đổi.
6. UI cho user reload, so sánh hoặc nhập lại tùy nghiệp vụ.
```

SQL:

```sql
UPDATE MedicalRecords
SET Diagnosis = @diagnosis,
    Note = @note,
    RowVersion = RowVersion + 1
WHERE Id = @id
  AND RowVersion = @expectedVersion;
```

Pattern đang dùng:

- Optimistic concurrency.
- Affected rows làm tín hiệu conflict.
- Không giữ lock dài.

Điểm UX cần rõ:

```text
Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại trước khi lưu tiếp.
```

Vì sao không chọn pattern khác?

| Không chọn | Lý do |
|---|---|
| Pessimistic lock DB | Không thể giữ lock trong lúc user mở form lâu |
| Last write wins | Người lưu sau âm thầm ghi đè người lưu trước |
| Queue async | User cần biết lưu thành công/thất bại ngay |

---

## 14. Case thực tế 3: Booking phòng khám không trùng giờ

Yêu cầu:

- Một phòng không được có hai lịch hẹn chồng thời gian.
- Hai request có thể đặt cùng slot gần như đồng thời.

Sai:

```text
SELECT lịch trùng.
Nếu không có thì INSERT booking.
```

Nếu hai transaction cùng SELECT trước khi ai INSERT, cả hai đều nghĩ slot trống.

Hướng xử lý tùy database:

1. Nếu có constraint phù hợp, ưu tiên constraint.
2. Nếu slot là block rời rạc, dùng unique constraint trên `(RoomId, SlotStart)`.
3. Nếu là khoảng thời gian tự do, cân nhắc exclusion constraint trong PostgreSQL.
4. Nếu DB không hỗ trợ constraint phù hợp, dùng transaction isolation/lock range có kiểm soát.

Ví dụ slot rời rạc:

```sql
CREATE UNIQUE INDEX UX_Bookings_Room_Slot
ON Bookings(RoomId, SlotStart);
```

Flow:

```text
Insert booking.
Nếu unique violation -> slot đã có người đặt.
```

Pattern đang dùng:

- Constraint bảo vệ invariant.
- Không tin vào check trước insert.
- App xử lý duplicate như conflict nghiệp vụ.

Vì sao không chọn pattern khác?

| Không chọn | Lý do |
|---|---|
| Chỉ `SELECT` kiểm tra rồi `INSERT` | Hai request có thể cùng thấy slot trống |
| Optimistic concurrency trên từng booking row | Booking row chưa tồn tại nên không có version để so |
| Queue toàn hệ thống | Quá nặng nếu chỉ cần chống trùng theo phòng/slot |

---

## 15. Case thực tế 4: Nhiều worker gửi thông báo

Yêu cầu:

- Nhiều worker cùng xử lý notification.
- Một notification không được gửi hai lần.
- Nếu worker chết giữa chừng, job phải được xử lý lại.

Thiết kế đề xuất:

```text
1. Worker claim job Pending bằng atomic update.
2. Chuyển job sang Processing với WorkerId và StartedAt.
3. Commit claim.
4. Gửi notification.
5. Mark Sent nếu thành công.
6. Nếu lỗi, tăng RetryCount và chuyển Failed/Pending tùy policy.
7. Job Processing quá timeout được đưa về Pending.
```

Claim:

```sql
UPDATE Notifications
SET Status = 'Processing',
    WorkerId = @workerId,
    StartedAt = CURRENT_TIMESTAMP
WHERE Id = @notificationId
  AND Status = 'Pending';
```

Pattern đang dùng:

- Atomic claim chống hai worker lấy cùng job.
- Timeout để recover job bị kẹt.
- Idempotency ở provider hoặc business key để chống gửi trùng khi retry.

Vì sao không chọn pattern khác?

| Không chọn | Lý do |
|---|---|
| `SELECT Pending` rồi update sau | Hai worker có thể đọc cùng một job |
| Lock job trong suốt lúc gửi notification | Gửi external chậm, giữ transaction lâu |
| Không retry | Worker chết giữa chừng làm mất thông báo |

---

## 16. Case thực tế 5: Duyệt phiếu chỉ một lần

Yêu cầu:

- Phiếu chỉ được duyệt từ `Draft` sang `Approved`.
- Hai người bấm duyệt cùng lúc thì chỉ một request thắng.
- Không cần lock form từ trước.

SQL:

```sql
UPDATE Requests
SET Status = 'Approved',
    ApprovedBy = @userId,
    ApprovedAt = CURRENT_TIMESTAMP
WHERE Id = @requestId
  AND Status = 'Draft';
```

Check affected rows:

```text
1 row affected -> duyệt thành công.
0 row affected -> phiếu không còn ở trạng thái Draft.
```

Pattern đang dùng:

- Optimistic concurrency theo business state.
- Atomic state transition.
- Không cần đọc trước rồi mới quyết định.

Điểm cần thêm:

- Permission check trước khi update.
- Audit log trong cùng transaction.
- Nếu có event sau duyệt, dùng outbox.

Vì sao không chọn pattern khác?

| Không chọn | Lý do |
|---|---|
| Lock form từ lúc mở màn hình | User có thể mở lâu rồi không làm gì |
| Read status rồi update không điều kiện | Hai request có thể cùng đọc `Draft` rồi cùng update |
| Serializable toàn hệ thống | Quá đắt cho một state transition có thể giải bằng `WHERE Status = 'Draft'` |

---

## 17. Khi nào pattern bị dùng sai?

### 16.1. Lạm dụng Serializable

Serializable mạnh nhưng đắt.

Không nên bật toàn hệ thống chỉ vì một vài use case cần chống race. Hãy khoanh vùng đoạn nghiệp vụ cần mạnh, đo hiệu năng và chuẩn bị retry serialization failure.

### 16.2. Lạm dụng distributed lock

Distributed lock nghe hấp dẫn nhưng dễ tạo hệ thống khó vận hành.

Trước khi dùng Redis lock/ZooKeeper/etcd lock, hãy hỏi:

- Có giải được bằng database constraint không?
- Có giải được bằng atomic update không?
- Có thể queue theo key không?
- Nếu process giữ lock chết thì lease/timeout thế nào?
- Clock drift/network partition ảnh hưởng ra sao?

### 16.3. Retry không idempotent

Retry một command tạo dữ liệu mà không có idempotency key có thể làm lỗi nặng hơn.

Retry chỉ nên dùng khi:

- Exception đúng loại transient.
- Operation idempotent.
- Có giới hạn số lần retry.
- Có backoff/jitter.
- Có log để thấy retry đang tăng bất thường.

### 16.4. Lock trong lúc gọi hệ thống ngoài

Không giữ transaction database trong lúc:

- Gọi payment gateway
- Gửi email/SMS
- Upload file
- Gọi service khác
- Chờ user input

Hãy commit dữ liệu cần thiết trước, rồi xử lý side effect qua outbox/job sau commit.

---

## 18. Checklist thiết kế concurrency

Khi review một use case ghi dữ liệu, hỏi:

1. Invariant chính là gì?
2. Invariant đó đã được bảo vệ ở database chưa?
3. Có request retry không?
4. Có idempotency key không?
5. Có read-check-write nào dễ lost update không?
6. Có thể đổi sang atomic update không?
7. Có cần RowVersion/optimistic concurrency không?
8. Có cần lock trước không?
9. Transaction có đủ ngắn không?
10. Có side effect ngoài database trong transaction không?
11. Có unique constraint cho business key không?
12. Có check affected rows không?
13. Update nhiều dòng có thứ tự nhất quán không?
14. Có retry deadlock/serialization đúng cách không?
15. Có test hai request chạy song song không?
16. Pattern đang chọn có nhược điểm gì?
17. Nếu không dùng pattern này thì dùng pattern nào và mất gì?

---

## 19. Câu tổng kết

Concurrency control tốt không phải là "thêm lock cho chắc".

Nó là chọn đúng mức bảo vệ cho từng invariant:

```text
Trùng dữ liệu -> constraint.
Retry -> idempotency.
Ghi số lượng -> atomic update.
Edit form -> optimistic concurrency.
Tài nguyên nóng -> pessimistic lock hoặc queue theo key.
Side effect -> outbox/inbox.
Deadlock transient -> retry có kiểm soát.
```

Senior backend không chỉ hỏi "code có transaction chưa", mà hỏi sâu hơn:

```text
Nếu 100 request cùng bấm trong một giây, invariant nào vẫn đứng vững?
Nếu request timeout rồi retry, dữ liệu có bị nhân đôi không?
Nếu worker chết giữa chừng, job có bị mất hoặc xử lý trùng không?
Nếu dữ liệu tăng 10 lần, lock còn đủ ngắn không?
```

Đó là điểm concurrency control chuyển từ kiến thức database thành năng lực thiết kế production.
