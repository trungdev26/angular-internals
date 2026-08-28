# Transaction và tính nhất quán trong Database

Transaction là một đơn vị công việc gồm một hoặc nhiều thao tác dữ liệu. Database chỉ công nhận kết quả cuối cùng khi toàn bộ đơn vị công việc đáp ứng điều kiện commit; nếu không, các thay đổi thuộc transaction phải được hoàn tác.

```text
Trạng thái hợp lệ A
        ↓
Transaction
        ↓
Commit   → Trạng thái hợp lệ B
Rollback → Trở về trạng thái trước transaction
```

Transaction không chỉ là cú pháp `BEGIN`, `COMMIT` và `ROLLBACK`. Một thiết kế đúng phải trả lời được:

- Invariant nào cần được bảo vệ?
- Những thay đổi nào phải commit cùng nhau?
- Request đồng thời có thể tạo ra xung đột nào?
- Transaction được mở trong bao lâu?
- Điều gì xảy ra nếu process dừng ngay trước hoặc sau commit?
- Side effect ngoài database được đồng bộ bằng cơ chế nào?

---

## Index

1. [Invariant và phạm vi transaction](#1-invariant-và-phạm-vi-transaction)
2. [ACID và lifecycle thực thi](#2-acid-và-lifecycle-thực-thi)
3. [Isolation trong môi trường đồng thời](#3-isolation-trong-môi-trường-đồng-thời)
4. [Các mẫu cập nhật an toàn](#4-các-mẫu-cập-nhật-an-toàn)
5. [Transaction boundary trong application](#5-transaction-boundary-trong-application)
6. [Side effect và tính nhất quán ngoài database](#6-side-effect-và-tính-nhất-quán-ngoài-database)
7. [Vận hành và chẩn đoán](#7-vận-hành-và-chẩn-đoán)
8. [tạo đơn hàng và giữ tồn kho](#8-case-study-tạo-đơn-hàng-và-giữ-tồn-kho)
9. [Khung quyết định và checklist](#9-khung-quyết-định-và-checklist)

---

## 1. Invariant và phạm vi transaction

### 1.1. Transaction bảo vệ điều gì?

**Invariant** là điều kiện luôn phải đúng trước và sau một thay đổi nghiệp vụ.

Ví dụ:

- Tổng tiền đã thanh toán không vượt quá giá trị hóa đơn.
- Tồn kho khả dụng không nhỏ hơn `0`.
- Một email chỉ thuộc về một tài khoản đang hoạt động.
- Một lịch khám không có hai booking chiếm cùng bác sĩ và khung giờ.
- Tổng phát sinh Nợ và Có của một bút toán phải cân bằng.

Một nghiệp vụ tạo đơn hàng có thể gồm:

```text
Insert Order
Insert OrderItems
Giảm tồn kho khả dụng
Ghi lịch sử tồn kho
Ghi OutboxMessage(OrderCreated)
```

Nếu các thay đổi này cùng cấu thành một invariant, chúng phải nằm trong cùng transaction local.

### 1.2. Atomicity không thay thế business rule

Atomicity bảo đảm các thao tác đã chọn cùng commit hoặc cùng rollback. Nó không xác định thao tác nào là hợp lệ.

Ví dụ:

```sql
BEGIN TRANSACTION;

UPDATE Accounts
SET Balance = Balance - 1000000
WHERE Id = 1;

UPDATE Accounts
SET Balance = Balance + 1000000
WHERE Id = 2;

COMMIT;
```

Transaction trên vẫn có thể làm tài khoản âm nếu thiếu điều kiện nghiệp vụ.

Phiên bản bảo vệ invariant tốt hơn:

```sql
BEGIN TRANSACTION;

UPDATE Accounts
SET Balance = Balance - @amount
WHERE Id = @sourceAccountId
  AND Balance >= @amount;

-- Affected rows phải bằng 1

UPDATE Accounts
SET Balance = Balance + @amount
WHERE Id = @destinationAccountId;

-- Affected rows phải bằng 1

COMMIT;
```

Điểm quan trọng:

> Transaction bảo vệ một tập thay đổi; constraint và điều kiện ghi bảo vệ tính đúng của thay đổi đó.

### 1.3. Constraint là tuyến phòng thủ cuối

Rule có thể được bảo vệ ở nhiều lớp:

| Cơ chế             | Phù hợp với                                   |
| ------------------ | --------------------------------------------- |
| `PRIMARY KEY`      | Định danh duy nhất                            |
| `FOREIGN KEY`      | Quan hệ tham chiếu                            |
| `UNIQUE`           | Không trùng business key                      |
| `CHECK`            | Điều kiện có thể biểu diễn trên row           |
| `NOT NULL`         | Thuộc tính bắt buộc                           |
| Conditional update | Invariant phụ thuộc trạng thái hiện tại       |
| Application rule   | Rule cần phối hợp nhiều aggregate hoặc policy |

Kiểm tra trùng chỉ bằng application không đủ an toàn:

```text
Request A: SELECT chưa thấy email
Request B: SELECT chưa thấy email
Request A: INSERT
Request B: INSERT
```

Unique constraint biến race condition này thành một kết quả xác định:

```sql
CREATE UNIQUE INDEX UX_Users_Email
ON Users(Email);
```

Application vẫn nên kiểm tra trước để trả lỗi thân thiện, nhưng database constraint mới là nơi quyết định cuối cùng khi có concurrency.

### 1.4. Boundary quá rộng và quá hẹp

Boundary quá hẹp:

```text
Insert Order      → commit
Insert OrderItems → commit
Update Stock      → lỗi
```

Order tồn tại nhưng nghiệp vụ chưa hoàn chỉnh.

Boundary quá rộng:

```text
Begin transaction
Ghi database
Gọi payment API
Upload file
Gửi email
Commit
```

Transaction giữ connection, lock hoặc row version trong lúc chờ network. Side effect đã xảy ra cũng không thể được database rollback.

Boundary phù hợp thường có đặc điểm:

- Bao đủ các thay đổi local cần nhất quán mạnh.
- Không chờ người dùng hoặc dịch vụ ngoài.
- Chuẩn bị dữ liệu trước khi mở transaction.
- Mở muộn, ghi nhanh và commit sớm.
- Đẩy công việc sau commit sang outbox hoặc background worker khi cần.

---

## 2. ACID và lifecycle thực thi

### 2.1. ACID là contract, không phải khẩu hiệu

| Tính chất   | Contract                                           | Câu hỏi kiểm tra                                       |
| ----------- | -------------------------------------------------- | ------------------------------------------------------ |
| Atomicity   | Không công bố trạng thái nửa chừng                 | Một câu lệnh lỗi thì phần đã ghi được xử lý thế nào?   |
| Consistency | Invariant còn đúng sau commit                      | Constraint và điều kiện nghiệp vụ nằm ở đâu?           |
| Isolation   | Kết quả có thể được giải thích khi chạy đồng thời  | Transaction khác được phép nhìn thấy hoặc thay đổi gì? |
| Durability  | Commit thành công sống sót qua failure theo policy | Log đã được flush và replica đã xác nhận tới đâu?      |

ACID có chi phí. Isolation mạnh hơn có thể giảm concurrency; durability đồng bộ hơn có thể tăng commit latency. Cấu hình engine và yêu cầu nghiệp vụ quyết định điểm cân bằng.

### 2.2. Auto-commit và explicit transaction

Trong auto-commit, mỗi câu lệnh là một transaction độc lập:

```sql
UPDATE Products
SET Price = 100000
WHERE Id = 1;
```

Một method application không tự động trở thành transaction chỉ vì các câu lệnh nằm cạnh nhau:

```text
Method CreateOrder()
├── Insert Order      → auto-commit
├── Insert OrderItems → auto-commit
└── Update Stock      → auto-commit
```

Khi nhiều thao tác phải cùng thành công, application hoặc ORM phải mở explicit transaction trên cùng connection:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status)
VALUES (@orderId, @customerId, 'Created');

INSERT INTO OrderItems(OrderId, ProductId, Quantity)
VALUES (@orderId, @productId, @quantity);

COMMIT;
```

### 2.3. Commit, rollback và savepoint

Lifecycle tổng quát:

```text
BEGIN
  ↓
Thực thi câu lệnh
  ├── Thành công → tiếp tục
  └── Lỗi        → ROLLBACK
  ↓
Kiểm tra invariant
  ├── Đạt        → COMMIT
  └── Không đạt  → ROLLBACK
```

Savepoint đánh dấu một vị trí có thể rollback cục bộ:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId)
VALUES (@orderId, @customerId);

SAVEPOINT BeforeOptionalItems;

-- Các thao tác có thể hoàn tác tới savepoint

ROLLBACK TO SAVEPOINT BeforeOptionalItems;

COMMIT;
```

Savepoint không biến phần bên trong thành một transaction durable độc lập. Outer transaction rollback vẫn có thể hoàn tác toàn bộ thay đổi.

### 2.4. Durability, WAL và thời điểm commit

Database thường sửa page trong Buffer Pool trước. Page đã thay đổi nhưng chưa xuống data file được gọi là **Dirty Page**.

Write-Ahead Logging đặt ra thứ tự:

```text
Thay đổi page trong RAM
        ↓
Tạo WAL / transaction log record
        ↓
Flush log cần thiết xuống durable storage
        ↓
Xác nhận COMMIT
        ↓
Flush dirty page xuống data file ở thời điểm phù hợp
```

Vì vậy:

```text
COMMIT thành công
├── Log đã đủ để recovery theo durability policy
└── Dirty page có thể vẫn nằm trong Buffer Pool
```

Checkpoint hoặc background writer ghi dirty page xuống data file sau đó. Cơ chế này tách commit latency khỏi random write của data page.

Chi tiết về Buffer Pool, WAL và checkpoint nằm trong [Cơ chế lưu trữ, Buffer Pool và I/O](/database/storage-io/theory).

### 2.5. Failure boundary quanh commit

Application phải phân biệt ba thời điểm:

| Failure                         | Trạng thái có thể xảy ra                    | Cách xử lý                                      |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Trước khi database nhận commit  | Transaction chưa commit                     | Rollback hoặc connection đóng                   |
| Trong lúc commit                | Client không biết commit đã thành công chưa | Kiểm tra bằng idempotency key hoặc business key |
| Sau commit nhưng trước response | Dữ liệu đã commit, client thấy timeout      | Retry phải idempotent                           |

Trường hợp thứ hai và thứ ba tạo ra **ambiguous outcome**: application không được giả định timeout đồng nghĩa rollback.

---

## 3. Isolation trong môi trường đồng thời

### 3.1. Transaction không tự động loại bỏ race condition

Giả sử tồn kho bằng `1`:

```text
Request A đọc Stock = 1
Request B đọc Stock = 1
A quyết định bán 1
B quyết định bán 1
A ghi Stock = 0
B ghi Stock = 0
```

Mỗi request có thể chạy trong một transaction riêng nhưng invariant vẫn bị phá. Nguyên nhân là quyết định nghiệp vụ dựa trên dữ liệu đã cũ.

Isolation level, câu SQL, lock, version column và constraint phải được thiết kế cùng nhau.

### 3.2. Các anomaly quan trọng

#### Dirty Read

Transaction đọc thay đổi chưa commit của transaction khác:

```text
B cập nhật Balance = 0 nhưng chưa commit
A đọc Balance = 0
B rollback
```

A đã sử dụng một giá trị chưa từng trở thành trạng thái chính thức.

#### Non-repeatable Read

Cùng một row được đọc hai lần trong một transaction nhưng trả về hai giá trị:

```text
A đọc Order.Status = Pending
B cập nhật thành Paid và commit
A đọc lại Order.Status = Paid
```

#### Phantom Read

Cùng một predicate trả về tập row khác nhau:

```text
A đếm 10 order Pending
B insert một order Pending và commit
A đếm lại được 11
```

#### Lost Update

Hai transaction đọc cùng phiên bản rồi ghi đè kết quả:

```text
Stock = 10
A đọc 10, trừ 2, ghi 8
B đọc 10, trừ 3, ghi 7
Kết quả đúng phải là 5
```

#### Write Skew

Hai transaction cập nhật hai row khác nhau nhưng cùng phá một invariant tổng thể:

```text
Invariant: luôn có ít nhất một bác sĩ trực

A thấy B đang trực → cho A nghỉ
B thấy A đang trực → cho B nghỉ

Hai row khác nhau cùng commit
→ không còn bác sĩ trực
```

Snapshot nhất quán không mặc nhiên chặn write skew. Invariant đa row có thể cần Serializable, explicit lock hoặc mô hình dữ liệu khác.

### 3.3. Isolation levels

| Isolation level  | Guarantee chính                                    | Anomaly còn có thể gặp                                | Chi phí điển hình |
| ---------------- | -------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| Read Uncommitted | Ít hoặc không cách ly đọc                          | Dirty read và các anomaly khác                        | Thấp              |
| Read Committed   | Không đọc dữ liệu chưa commit                      | Non-repeatable read, phantom, lost update tùy pattern | Thấp đến vừa      |
| Repeatable Read  | Row đã đọc ổn định hơn trong transaction           | Phantom hoặc write skew tùy engine                    | Vừa               |
| Serializable     | Kết quả tương đương một thứ tự chạy tuần tự hợp lệ | Transaction có thể bị block hoặc abort để retry       | Cao nhất          |

Tên isolation level không đủ để suy ra toàn bộ hành vi. SQL Server, PostgreSQL và MySQL/InnoDB có khác biệt về MVCC, lock, snapshot và phantom protection.

Khi điều tra concurrency bug, cần xác nhận:

- Engine và version đang chạy.
- Isolation level của session/transaction.
- Database option liên quan snapshot hoặc MVCC.
- Câu SQL và execution plan thực tế.
- Lock hoặc version conflict quan sát được.

### 3.4. Lock-based concurrency và MVCC

Lock-based read có thể khiến reader chờ writer hoặc writer chờ reader, tùy lock compatibility và isolation.

MVCC giữ nhiều phiên bản dữ liệu:

```text
Writer tạo version mới
Reader tiếp tục đọc snapshot phù hợp
```

MVCC giảm read/write blocking nhưng không loại bỏ:

- Writer chặn writer.
- Unique-key conflict.
- Serialization failure.
- Version store hoặc undo/WAL tăng do transaction dài.
- Cleanup/vacuum bị trì hoãn.

Chi tiết về lock compatibility, escalation, deadlock graph và lock ordering nằm trong [Locking và Deadlock](/database/locking-deadlock/theory).

### 3.5. Chọn isolation theo invariant

Không nên chọn isolation chỉ theo tên “mạnh” hoặc “nhẹ”.

Quy trình:

1. Xác định dữ liệu được đọc để ra quyết định.
2. Xác định transaction khác có thể thay đổi dữ liệu đó như thế nào.
3. Xác định anomaly nào làm sai nghiệp vụ.
4. Chọn atomic statement, constraint hoặc concurrency pattern trước.
5. Nâng isolation khi các cơ chế cục bộ chưa bảo vệ đủ invariant.
6. Chuẩn bị retry nếu engine có thể abort transaction do conflict.

Serializable phù hợp khi cần bảo vệ predicate hoặc invariant đa row và contention có thể chấp nhận được. Nó không nên được bật toàn hệ thống như một biện pháp thay thế thiết kế.

---

## 4. Các mẫu cập nhật an toàn

### 4.1. Atomic conditional update

Pattern dễ sai:

```text
SELECT Stock
→ kiểm tra trong application
→ tính giá trị mới
→ UPDATE
```

Khoảng thời gian giữa `SELECT` và `UPDATE` cho phép request khác thay đổi dữ liệu.

Đưa điều kiện vào write path:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

Diễn giải `affected rows`:

```text
1 row → invariant được thỏa và update thành công
0 row → không tồn tại, không đủ tồn hoặc trạng thái đã đổi
```

Nếu cần phân biệt các nguyên nhân của `0 row`, application có thể đọc lại sau thất bại. Việc đọc lại dùng để tạo response, không dùng để quyết định update ban đầu.

### 4.2. State transition có điều kiện

Chuyển trạng thái nên kiểm tra trạng thái nguồn trong câu `UPDATE`:

```sql
UPDATE Orders
SET Status = 'Paid',
    PaidAt = CURRENT_TIMESTAMP
WHERE Id = @orderId
  AND Status = 'Pending';
```

Pattern này bảo đảm chỉ một request thắng transition `Pending → Paid`.

Nếu `affected rows = 0`, cần xác định:

- Order không tồn tại.
- Order đã được xử lý.
- Transition không hợp lệ.

### 4.3. Optimistic concurrency

Optimistic concurrency phát hiện dữ liệu đã thay đổi kể từ lúc được đọc.

```sql
UPDATE Products
SET Name = @name,
    Price = @price,
    Version = Version + 1
WHERE Id = @id
  AND Version = @expectedVersion;
```

`0 row affected` là conflict, không phải update thành công.

Phù hợp khi:

- Xung đột tương đối hiếm.
- User giữ form lâu trước khi lưu.
- Có thể hiển thị conflict, reload hoặc merge.
- Không muốn giữ database lock trong thời gian user thao tác.

Version phải được tăng atomically trong database. Chỉ so sánh `UpdatedAt` có thể không đủ nếu độ phân giải timestamp thấp hoặc clock không đáng tin cậy.

### 4.4. Pessimistic locking

Pessimistic locking khóa dữ liệu trước khi ra quyết định.

PostgreSQL:

```sql
BEGIN;

SELECT StockQuantity
FROM Products
WHERE Id = @productId
FOR UPDATE;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

Phù hợp khi:

- Contention cao.
- Nghiệp vụ cần giữ quyền cập nhật trong một transaction ngắn.
- Chi phí conflict/retry cao hơn chi phí chờ lock.

Transaction phải ngắn và các code path phải lock resource theo thứ tự nhất quán.

### 4.5. Unique constraint và idempotency key

Unique constraint giải quyết cạnh tranh trên một business key:

```sql
CREATE UNIQUE INDEX UX_Payments_IdempotencyKey
ON Payments(IdempotencyKey);
```

Idempotency record nên lưu:

- Key do client hoặc upstream cung cấp.
- Hash hoặc thuộc tính định danh request.
- Trạng thái xử lý.
- Business entity đã tạo.
- Response có thể trả lại.
- Thời gian hết hạn nếu policy cho phép.

Hai request dùng cùng key nhưng payload khác nhau phải bị từ chối. Nếu không, key có thể vô tình ánh xạ hai ý định nghiệp vụ khác nhau.

Catalog lựa chọn giữa atomic update, optimistic version, pessimistic lock, queue theo key, atomic claim và outbox/inbox nằm trong [Concurrency Control Patterns](/database/concurrency-control-patterns/theory).

---

## 5. Transaction boundary trong application

### 5.1. Boundary thuộc về use case

Transaction boundary thường nằm ở application service hoặc use-case handler vì lớp này biết những thay đổi nào thuộc cùng một nghiệp vụ.

```text
CreateOrderUseCase
├── Begin transaction
├── OrderRepository.Insert
├── InventoryRepository.Reserve
├── OutboxRepository.Add
└── Commit
```

Repository không nên tự commit nếu caller cần phối hợp nhiều repository trong cùng transaction.

### 5.2. Cùng transaction yêu cầu cùng database context

Cần kiểm tra khi dùng ORM:

- Các repository có dùng cùng connection/session/context không?
- `SaveChanges` có mở transaction riêng không?
- Nhiều lần `SaveChanges` có nằm trong cùng explicit transaction không?
- Execution strategy có tự retry toàn bộ delegate không?
- Exception có làm transaction trở thành trạng thái không thể commit không?
- Connection có bị dispose trước commit không?

Hai `DbContext` hoặc hai connection không tự động chia sẻ một local transaction.

### 5.3. Nested transaction và savepoint

Mô hình:

```text
Outer transaction begin
  Inner transaction begin
  Inner commit
Outer rollback
```

Trong nhiều engine/framework, inner transaction chỉ là:

- Savepoint.
- Transaction counter.
- Scope tham gia ambient transaction.
- Một transaction độc lập trên connection khác.

Không được suy luận từ tên API. Cần xác nhận:

- Inner commit có durable độc lập không?
- Outer rollback có hoàn tác phần inner không?
- Framework có tạo savepoint không?
- Error ở inner scope có làm outer transaction unusable không?

Một use case có một owner rõ ràng cho commit/rollback giúp tránh ambiguity.

### 5.4. Async và external call

`await` không tự gây lỗi transaction. Vấn đề là await điều gì trong lúc transaction đang mở.

Không nên giữ transaction khi:

- Gọi HTTP API.
- Chờ message broker.
- Upload/download file.
- Gửi email.
- Chờ user input.
- Chạy CPU work dài.

Flow phù hợp hơn:

```text
Validate dữ liệu không cần lock
Chuẩn bị command
Begin transaction
Thực hiện các write cần thiết
Ghi outbox
Commit
Xử lý side effect sau commit
```

### 5.5. Index ảnh hưởng write transaction

Một câu `UPDATE` thiếu access path phù hợp có thể scan nhiều row:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE Status = 'Pending'
  AND CreatedAt < @expiredBefore;
```

Hệ quả:

- Nhiều logical reads.
- Lock nhiều row/page hơn.
- Transaction kéo dài.
- Blocking và deadlock risk tăng.
- WAL/transaction log tăng nếu update nhiều row.

Index phù hợp giúp tìm target row nhanh hơn, nhưng mỗi index bổ sung cũng làm write amplification tăng. Quyết định index phải cân bằng read path, write cost và lock footprint.

### 5.6. Batch transaction

Một transaction cập nhật hàng triệu row có thể gây:

- Log tăng nhanh.
- Lock escalation.
- Version store/undo tăng.
- Replication lag.
- Rollback kéo dài.
- Checkpoint và I/O burst.

Chia batch giới hạn blast radius:

```text
Đọc batch key ổn định
Begin transaction
Update 1.000 rows
Commit
Ghi progress
Lặp batch tiếp theo
```

Batching thay đổi atomicity: toàn bộ job không còn là một transaction. Job phải có checkpoint logic, idempotency và trạng thái resume rõ ràng.

### 5.7. Retry đúng boundary

Các lỗi có thể retry:

- Deadlock victim.
- Serialization failure.
- Transient connection failure khi outcome xác định.
- Lock timeout nếu policy nghiệp vụ cho phép.

Retry phải chạy lại toàn bộ transaction từ đầu vì dữ liệu đã đọc ở attempt cũ có thể không còn đúng.

```text
Attempt
├── Begin transaction
├── Đọc trạng thái cần thiết
├── Kiểm tra invariant
├── Ghi dữ liệu
└── Commit
```

Không retry mù mọi exception. Retry cần:

- Phân loại lỗi transient.
- Giới hạn attempt.
- Exponential backoff và jitter.
- Idempotency.
- Metric và log cho từng attempt.
- Cơ chế xử lý ambiguous commit.

---

## 6. Side effect và tính nhất quán ngoài database

### 6.1. Local transaction có giới hạn

Database transaction không rollback được:

- Email đã gửi.
- HTTP request đã được hệ thống khác xử lý.
- Message đã publish ra broker.
- File đã upload.
- Cache đã cập nhật.

Hai thứ tự đều có failure window:

```text
Publish trước commit
→ transaction rollback nhưng consumer đã nhận event
```

```text
Commit trước publish
→ dữ liệu tồn tại nhưng process dừng trước khi publish
```

### 6.2. Transactional Outbox

Outbox ghi business data và intent phát message trong cùng local transaction:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status)
VALUES (@orderId, @customerId, 'Created');

INSERT INTO OutboxMessages(Id, Type, AggregateId, Payload, CreatedAt)
VALUES (
  @messageId,
  'OrderCreated',
  @orderId,
  @payload,
  CURRENT_TIMESTAMP
);

COMMIT;
```

Relay hoặc worker:

```text
Đọc outbox chưa publish
→ publish message
→ đánh dấu processed
→ retry nếu thất bại
```

Failure sau publish nhưng trước khi đánh dấu có thể tạo duplicate delivery. Consumer phải idempotent; outbox không tự tạo exactly-once end-to-end.

### 6.3. Inbox và idempotent consumer

Consumer lưu `MessageId` đã xử lý:

```sql
BEGIN TRANSACTION;

INSERT INTO InboxMessages(MessageId, ProcessedAt)
VALUES (@messageId, CURRENT_TIMESTAMP);

-- Unique constraint trên MessageId
-- Thực hiện business update

COMMIT;
```

Nếu duplicate message đến, unique constraint giúp nhận biết message đã được xử lý.

Business operation vẫn nên idempotent khi có thể, vì duplicate có thể xuất hiện ở nhiều boundary khác nhau.

### 6.4. Saga và compensating action

Một workflow qua nhiều service thường không thể dùng local transaction chung:

```text
Create Order
→ Reserve Inventory
→ Authorize Payment
→ Confirm Order
```

Saga chia workflow thành nhiều local transaction. Nếu bước sau thất bại, hệ thống chạy hành động bù:

```text
Payment thất bại
→ Release Inventory
→ Cancel Order
```

Compensation không phải rollback vật lý. Nó là một business transition mới và cũng có thể thất bại, retry hoặc bị xử lý trùng.

Saga cần:

- State machine rõ ràng.
- Correlation ID.
- Timeout cho từng bước.
- Idempotent command và compensation.
- Cơ chế resume sau crash.
- Reconciliation cho workflow bị kẹt.

### 6.5. Cache sau commit

Cache không cùng transaction với database.

Failure window:

```text
Database commit thành công
→ cache invalidation thất bại
→ reader tiếp tục thấy dữ liệu cũ
```

Các lựa chọn:

- Invalidate sau commit với retry.
- Phát invalidation event qua outbox.
- TTL giới hạn thời gian stale.
- Versioned cache key.
- Không cache dữ liệu cần strong consistency.

Consistency của cache phải được mô tả như một contract, không nên chỉ dựa vào thứ tự gọi trong code.

---

## 7. Vận hành và chẩn đoán

### 7.1. Transaction dài tạo áp lực gì?

Transaction dài có thể giữ:

- Lock.
- Connection.
- Row version cũ.
- Undo record hoặc WAL/log chưa thể reclaim.
- Snapshot làm cleanup/vacuum bị trì hoãn.
- Resource phục vụ rollback.

Triệu chứng production:

- Blocking chain tăng.
- Lock timeout.
- Deadlock tăng.
- Version store hoặc table bloat tăng.
- Transaction log tăng bất thường.
- Replica lag.
- Rollback mất nhiều thời gian.

### 7.2. Phân biệt blocking, deadlock và timeout

```text
Blocking
Transaction B đang chờ A; A vẫn có thể tiến tới commit.

Deadlock
A chờ B và B chờ A theo một chu trình.
Database phải abort ít nhất một transaction.

Timeout
Một operation chờ quá giới hạn do application hoặc database cấu hình.
Không nhất thiết tồn tại chu trình.
```

Ba hiện tượng có cách điều tra và retry khác nhau.

### 7.3. Dữ liệu cần thu thập

Khi xảy ra sự cố:

- Transaction/session ID.
- Business ID và correlation ID.
- Thời điểm begin, commit hoặc rollback.
- Câu SQL đang chạy và execution plan.
- Isolation level.
- Lock đang giữ và lock đang chờ.
- Blocking head/root blocker.
- Deadlock graph hoặc serialization error.
- Số row và page bị đọc/ghi.
- Retry count và idempotency key.
- Thời gian gọi external dependency nếu transaction đang mở.

Không nên log payload nhạy cảm hoặc toàn bộ SQL parameter nếu vi phạm bảo mật. Business key và correlation ID thường đủ để truy vết.

### 7.4. Test concurrency

Unit test tuần tự không phát hiện được phần lớn race condition.

Một concurrency test nên:

1. Tạo trạng thái ban đầu xác định.
2. Dùng barrier để nhiều worker bắt đầu cùng thời điểm.
3. Thực thi operation trên connection/context riêng.
4. Thu thập kết quả thành công, conflict và exception.
5. Kiểm tra invariant cuối cùng trong database.
6. Lặp lại đủ số lần để tăng xác suất interleaving nguy hiểm.

Ví dụ trừ tồn:

```text
Initial Stock = 10
20 request đồng thời, mỗi request trừ 1

Expected:
├── Chính xác 10 request thành công
├── 10 request thất bại theo contract nghiệp vụ
└── Stock cuối cùng = 0
```

Test phải kiểm tra trạng thái cuối, không chỉ kiểm tra “không có exception”.

### 7.5. Reconciliation

Ngay cả khi transaction local đúng, hệ thống phân tán vẫn có thể lệch do:

- Message bị trì hoãn.
- Consumer lỗi kéo dài.
- Bug cũ đã ghi dữ liệu sai.
- Manual operation.
- External provider trả kết quả không rõ ràng.

Reconciliation job so sánh source of truth với trạng thái liên quan và tạo cảnh báo hoặc repair action. Đây là lớp an toàn vận hành, không phải lý do để bỏ constraint và transaction đúng.

---

## 8. tạo đơn hàng và giữ tồn kho

### 8.1. Yêu cầu

- Client có thể retry khi timeout.
- Không tạo trùng order.
- Không bán vượt tồn kho.
- Order, items và stock movement phải cùng commit.
- Event `OrderCreated` không được mất.
- Không giữ transaction khi publish message.

### 8.2. Invariant

```text
StockQuantity >= 0
Một IdempotencyKey chỉ tạo một Order
Order total khớp với OrderItems đã chấp nhận
Mỗi lần giảm tồn có một StockTransaction tương ứng
OrderCreated chỉ được phát cho Order đã commit
```

### 8.3. Boundary

```text
Ngoài transaction
├── Validate request shape
├── Load cấu hình ít thay đổi
└── Tạo OrderId, MessageId

Trong transaction
├── Claim IdempotencyKey
├── Insert Order
├── Insert OrderItems
├── Atomic conditional update Stock
├── Insert StockTransaction
└── Insert OutboxMessage

Sau transaction
└── Outbox relay publish OrderCreated
```

### 8.4. SQL minh họa

```sql
BEGIN TRANSACTION;

INSERT INTO RequestDeduplications(
  IdempotencyKey,
  RequestHash,
  ResourceId,
  Status
)
VALUES (
  @idempotencyKey,
  @requestHash,
  @orderId,
  'Processing'
);

INSERT INTO Orders(Id, CustomerId, Status, TotalAmount)
VALUES (@orderId, @customerId, 'Created', @totalAmount);

INSERT INTO OrderItems(OrderId, ProductId, Quantity, UnitPrice)
VALUES (@orderId, @productId, @quantity, @unitPrice);

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

-- Nếu affected rows = 0: rollback và trả lỗi nghiệp vụ

INSERT INTO StockTransactions(ProductId, Quantity, ReferenceId)
VALUES (@productId, -@quantity, @orderId);

INSERT INTO OutboxMessages(Id, Type, AggregateId, Payload, CreatedAt)
VALUES (
  @messageId,
  'OrderCreated',
  @orderId,
  @payload,
  CURRENT_TIMESTAMP
);

UPDATE RequestDeduplications
SET Status = 'Completed'
WHERE IdempotencyKey = @idempotencyKey;

COMMIT;
```

Constraint:

```sql
CREATE UNIQUE INDEX UX_RequestDeduplications_IdempotencyKey
ON RequestDeduplications(IdempotencyKey);
```

### 8.5. Hai request cùng IdempotencyKey

Request đầu tiên insert deduplication record. Request thứ hai gặp unique conflict hoặc nhìn thấy record hiện có.

Application phải so sánh `RequestHash`:

```text
Cùng key + cùng request
→ trả kết quả đã có hoặc trạng thái đang xử lý

Cùng key + payload khác
→ từ chối vì idempotency key bị tái sử dụng sai
```

### 8.6. Hai request mua cùng sản phẩm

Atomic conditional update tạo điểm phân xử trong database:

```text
Stock đủ
→ update thắng và giữ invariant

Stock không còn đủ tại thời điểm write
→ affected rows = 0
→ rollback transaction
```

Không cần tin vào giá trị stock đã đọc trước đó.

### 8.7. Process dừng sau commit

Nếu process dừng sau commit nhưng trước response:

- Client retry với cùng idempotency key.
- Server tìm deduplication record đã hoàn thành.
- Server trả lại Order đã tạo thay vì insert lần nữa.

Nếu process dừng trước khi publish:

- OutboxMessage vẫn tồn tại.
- Relay publish ở lần chạy sau.

Nếu relay publish rồi dừng trước khi đánh dấu:

- Message có thể được publish lại.
- Consumer dùng inbox/idempotency để bỏ qua duplicate effect.

---

## 9. Khung quyết định và checklist

### 9.1. Chọn cơ chế theo loại invariant

| Bài toán                                    | Cơ chế ưu tiên                                   |
| ------------------------------------------- | ------------------------------------------------ |
| Không trùng business key                    | Unique constraint                                |
| Không cho số lượng xuống âm                 | Atomic conditional update                        |
| Phát hiện user ghi đè dữ liệu cũ            | Optimistic version                               |
| Giữ quyền cập nhật resource trong flow ngắn | Pessimistic lock                                 |
| Bảo vệ predicate hoặc invariant đa row      | Serializable hoặc explicit locking có kiểm chứng |
| Retry request tạo dữ liệu                   | Idempotency key + unique constraint              |
| Ghi database và phát event                  | Transactional outbox                             |
| Consumer nhận message lặp                   | Inbox/idempotent consumer                        |
| Workflow qua nhiều service                  | Saga + compensation + reconciliation             |

### 9.2. Checklist thiết kế

- Invariant được viết thành câu kiểm chứng được chưa?
- Những bảng hoặc aggregate nào phải commit cùng nhau?
- Constraint nào có thể đặt tại database?
- Có read-check-write gây race condition không?
- `affected rows = 0` mang ý nghĩa nghiệp vụ gì?
- Isolation mặc định có bảo vệ đủ invariant không?
- Có contention trên hot key hoặc hot range không?
- Cần optimistic hay pessimistic concurrency?
- Query ghi có access path phù hợp không?
- Transaction có chờ network, file hoặc user input không?
- ORM có dùng cùng connection/context không?
- Ai sở hữu commit và rollback?
- Có ambiguous outcome quanh commit không?
- Retry có chạy lại toàn bộ transaction và có idempotent không?
- Side effect ngoài database đi qua outbox hay cơ chế nào?
- Có metric cho duration, retry, rollback, blocking và deadlock không?
- Có test nhiều request chạy đồng thời và kiểm tra invariant cuối không?

### 9.3. Checklist review production incident

```text
1. Xác định invariant đã bị phá hay chỉ latency tăng.
2. Xác định transaction/session gây blocking hoặc conflict.
3. Thu thập SQL, plan, isolation level và lock/version state.
4. Xác định boundary thực tế trong application.
5. Kiểm tra external call hoặc batch nằm trong transaction.
6. Kiểm tra index của UPDATE/DELETE.
7. Kiểm tra retry và idempotency.
8. Sửa correctness trước, sau đó tối ưu contention và throughput.
```

### 9.4. Nguyên tắc tổng kết

```text
Transaction đúng
= boundary đúng
+ invariant được thực thi tại write path
+ isolation phù hợp
+ failure handling rõ ràng
+ side effect có cơ chế nhất quán riêng
+ khả năng quan sát và kiểm chứng khi chạy đồng thời
```

`BEGIN/COMMIT` chỉ là lớp vỏ. Chất lượng thiết kế nằm ở việc hệ thống vẫn giữ đúng invariant khi request chạy đồng thời, process dừng giữa chừng, client retry và các dependency bên ngoài thất bại.
