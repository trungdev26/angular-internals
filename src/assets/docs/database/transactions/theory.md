# Transactions trong Database

Transaction là cơ chế giúp một nhóm thao tác dữ liệu được xử lý như một đơn vị công việc thống nhất. Hoặc tất cả thay đổi cùng thành công, hoặc khi có lỗi thì database đưa dữ liệu về trạng thái trước đó.

Ví dụ kinh điển là chuyển tiền:

```text
Trừ 1.000.000 từ tài khoản A
Cộng 1.000.000 vào tài khoản B
```

Nếu chỉ trừ tiền A thành công rồi hệ thống lỗi trước khi cộng tiền B, dữ liệu sẽ sai. Transaction sinh ra để ngăn kiểu lỗi này.

---

## 1. Transaction giải quyết vấn đề gì?

Trong hệ thống thật, một nghiệp vụ thường không chỉ ghi một dòng.

Ví dụ tạo đơn hàng:

```text
1. Tạo Order
2. Tạo OrderItems
3. Trừ tồn kho
4. Ghi lịch sử tồn kho
5. Cập nhật công nợ
```

Nếu bước 1, 2 thành công nhưng bước 3 thất bại, dữ liệu sẽ rơi vào trạng thái nửa vời. Transaction giúp gom các bước cần nhất quán mạnh vào cùng một phạm vi.

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(CustomerId, TotalAmount)
VALUES (10, 500000);

INSERT INTO OrderItems(OrderId, ProductId, Quantity, Price)
VALUES (1001, 20, 2, 250000);

UPDATE Products
SET StockQuantity = StockQuantity - 2
WHERE Id = 20;

COMMIT;
```

Nếu có lỗi:

```sql
ROLLBACK;
```

Nói ngắn gọn:

```text
Transaction bảo vệ tính đúng đắn khi một nghiệp vụ cần nhiều thao tác dữ liệu đi cùng nhau.
```

---

## 2. ACID là gì?

ACID là 4 tính chất nền tảng của transaction.

| Tính chất | Ý nghĩa | Câu hỏi cần nhớ |
|---|---|---|
| Atomicity | Tất cả thành công hoặc tất cả rollback | Có bị lưu nửa chừng không? |
| Consistency | Dữ liệu chuyển từ trạng thái hợp lệ này sang trạng thái hợp lệ khác | Có phá rule nghiệp vụ không? |
| Isolation | Transaction đồng thời không nhìn thấy nhau một cách nguy hiểm | Có đọc/ghi chồng gây sai không? |
| Durability | Commit xong thì dữ liệu tồn tại bền vững | Mất điện sau commit có mất dữ liệu không? |

Junior thường nhớ ACID như định nghĩa. Middle/Senior cần hiểu ACID là tập trade-off giữa tính đúng, concurrency, performance và vận hành.

---

## 3. Atomicity: tất cả hoặc không gì cả

Atomicity nghĩa là transaction không được để dữ liệu ở trạng thái dở dang.

Ví dụ sai nếu không có transaction:

```sql
UPDATE Accounts
SET Balance = Balance - 1000000
WHERE Id = 1;

-- App crash ở đây

UPDATE Accounts
SET Balance = Balance + 1000000
WHERE Id = 2;
```

Đúng hơn:

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

Nếu bất kỳ bước nào lỗi, rollback toàn bộ.

```text
Atomicity không làm nghiệp vụ đúng thay mình.
Nó chỉ đảm bảo nhóm thao tác đã chọn sẽ cùng thành công hoặc cùng thất bại.
```

---

## 4. Consistency: dữ liệu phải còn hợp lệ

Consistency nghĩa là sau transaction, dữ liệu vẫn thỏa mãn constraint và rule.

Một số rule được database bảo vệ:

- Primary key
- Foreign key
- Unique constraint
- Check constraint
- Not null

Ví dụ:

```sql
ALTER TABLE OrderItems
ADD CONSTRAINT FK_OrderItems_Orders
FOREIGN KEY (OrderId) REFERENCES Orders(Id);
```

Một số rule nằm ở nghiệp vụ:

- Không cho xuất kho âm
- Không cho thanh toán hóa đơn đã hủy
- Không cho sửa phiếu đã khóa sổ
- Tổng tiền đơn hàng phải bằng tổng dòng hàng

Transaction giúp giữ các thay đổi đi cùng nhau, nhưng developer vẫn phải thiết kế rule đúng.

```text
Database constraint bảo vệ invariant kỹ thuật.
Business code bảo vệ invariant nghiệp vụ.
Transaction nối các thay đổi liên quan thành một đơn vị nhất quán.
```

---

## 5. Isolation: khi nhiều transaction chạy cùng lúc

Isolation là phần dễ gây lỗi production nhất.

Nếu chỉ có một user dùng hệ thống, transaction rất dễ hiểu. Vấn đề xuất hiện khi nhiều request cùng đọc/ghi một dữ liệu.

Ví dụ tồn kho hiện còn 1 sản phẩm:

```text
User A đọc Stock = 1
User B đọc Stock = 1
User A đặt 1 sản phẩm
User B cũng đặt 1 sản phẩm
Kết quả: bán 2 sản phẩm trong khi chỉ còn 1
```

Transaction không tự động giải quyết mọi race condition. Isolation level, lock, câu SQL và thiết kế nghiệp vụ quyết định hệ thống có đúng không.

---

## 6. Durability: commit xong phải bền

Durability nghĩa là khi database báo commit thành công, dữ liệu đã được ghi theo cơ chế đủ an toàn để sống sót qua crash thông thường.

Database thường dùng transaction log hoặc write-ahead log:

```text
Ghi log thay đổi
Commit
Sau đó mới flush/merge vào data file theo cơ chế nội bộ
```

Với developer backend, điều cần nhớ:

- Commit thành công mới được coi là dữ liệu đã lưu
- Không nên trả success cho client trước khi commit nghiệp vụ quan trọng
- Không nên tự giả lập transaction bằng nhiều biến trạng thái rời rạc
- Durability còn phụ thuộc cấu hình database, disk, replication và backup

---

## 7. Các lệnh transaction cơ bản

Tên lệnh có thể khác nhẹ giữa SQL Server, PostgreSQL, MySQL, nhưng tư duy giống nhau.

```sql
BEGIN TRANSACTION;

-- Các câu SQL cần đi cùng nhau

COMMIT;
```

Rollback:

```sql
BEGIN TRANSACTION;

-- Có lỗi hoặc điều kiện nghiệp vụ không đạt

ROLLBACK;
```

Savepoint:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(CustomerId) VALUES (10);

SAVEPOINT BeforeItems;

INSERT INTO OrderItems(OrderId, ProductId, Quantity)
VALUES (1001, 20, 2);

ROLLBACK TO SAVEPOINT BeforeItems;

COMMIT;
```

Savepoint cho phép rollback một phần bên trong transaction, nhưng không nên lạm dụng để che thiết kế flow rối.

---

## 8. Auto-commit và explicit transaction

Nhiều database/client mặc định chạy mỗi câu SQL như một transaction riêng.

```sql
UPDATE Products SET Price = 100000 WHERE Id = 1;
```

Câu này có thể tự commit ngay sau khi chạy xong.

Khi nghiệp vụ có nhiều câu cần đi cùng nhau, phải mở explicit transaction:

```sql
BEGIN TRANSACTION;

UPDATE Products SET StockQuantity = StockQuantity - 2 WHERE Id = 1;
INSERT INTO StockTransactions(ProductId, Quantity) VALUES (1, -2);

COMMIT;
```

Sai lầm hay gặp:

```text
Nghĩ rằng vì code nằm trong cùng một method nên tự động có transaction.
```

Method trong application không đồng nghĩa transaction trong database. Phải xem ORM/framework có mở transaction thật không.

---

## 9. Transaction boundary: mở ở đâu, đóng ở đâu?

Transaction boundary là phạm vi bắt đầu và kết thúc transaction.

Một boundary tốt:

- Bao đủ các thao tác dữ liệu cần nhất quán
- Không bao quá rộng
- Không giữ lock trong lúc chờ network/API ngoài
- Có commit/rollback rõ ràng
- Có log và error handling đủ để debug

Ví dụ không tốt:

```text
Begin transaction
Ghi database
Gọi API thanh toán bên ngoài
Gửi email
Upload file
Commit transaction
```

Vấn đề:

- Transaction giữ lock quá lâu
- API ngoài chậm làm nghẽn database
- Nếu email gửi rồi rollback thì side effect ngoài database không rollback được
- Nếu commit rồi gửi email lỗi thì trạng thái nghiệp vụ lại lệch

Tư duy senior:

```text
Transaction database chỉ rollback được database.
Những side effect bên ngoài cần pattern riêng như outbox, idempotency, saga hoặc retry có kiểm soát.
```

---

## 10. Isolation anomalies: các lỗi đọc/ghi đồng thời

### 10.1. Dirty Read

Transaction A đọc dữ liệu chưa commit của transaction B.

```text
B cập nhật Balance = 0 nhưng chưa commit
A đọc thấy Balance = 0
B rollback
A đã đọc một giá trị chưa từng thật sự tồn tại
```

Dirty read rất nguy hiểm cho nghiệp vụ tiền, kho, công nợ.

### 10.2. Non-repeatable Read

Trong cùng một transaction, đọc cùng một dòng hai lần nhưng ra hai giá trị khác nhau vì transaction khác đã commit ở giữa.

```text
A đọc Order.Status = Pending
B đổi Order.Status = Paid và commit
A đọc lại Order.Status = Paid
```

### 10.3. Phantom Read

Trong cùng một transaction, query theo điều kiện trả về thêm hoặc mất dòng vì transaction khác insert/delete ở giữa.

```text
A đếm đơn hàng Pending = 10
B thêm một đơn Pending và commit
A đếm lại Pending = 11
```

### 10.4. Lost Update

Hai transaction cùng đọc một giá trị, cùng tính toán, rồi ghi đè kết quả của nhau.

```text
Stock = 10
A đọc 10, trừ 2, ghi 8
B đọc 10, trừ 3, ghi 7
Kết quả đúng phải là 5, nhưng database còn 7
```

Lost update là lỗi rất hay gặp khi code làm kiểu:

```text
Read -> Modify in memory -> Write back
```

---

## 11. Isolation levels

Isolation level quyết định transaction được cách ly mạnh đến đâu.

| Isolation level | Chặn dirty read | Chặn non-repeatable read | Chặn phantom | Chi phí |
|---|---:|---:|---:|---|
| Read Uncommitted | Không | Không | Không | Thấp |
| Read Committed | Có | Không | Không | Thấp/vừa |
| Repeatable Read | Có | Có | Tùy DB | Vừa/cao |
| Serializable | Có | Có | Có | Cao |

Lưu ý quan trọng:

```text
Cùng tên isolation level nhưng hành vi thực tế có thể khác giữa SQL Server, PostgreSQL, MySQL/InnoDB.
```

Ví dụ `Repeatable Read` trong PostgreSQL dùng snapshot isolation và khác với MySQL/InnoDB ở nhiều chi tiết lock/MVCC. Khi xử lý bug concurrency, phải đọc đúng tài liệu của database đang dùng.

---

## 12. Read Committed: mặc định phổ biến

Read Committed thường là default trong nhiều hệ thống.

Ý nghĩa:

```text
Không đọc dữ liệu chưa commit.
Mỗi câu lệnh chỉ đọc dữ liệu đã commit tại thời điểm câu lệnh đó chạy.
```

Nó chặn dirty read, nhưng vẫn có thể gặp non-repeatable read và phantom read.

Phù hợp cho nhiều màn hình CRUD thông thường:

- Danh sách
- Chi tiết
- Tìm kiếm
- Báo cáo nhẹ không yêu cầu snapshot tuyệt đối

Nhưng với nghiệp vụ cạnh tranh dữ liệu như tồn kho, số dư, quota, booking slot, không nên chỉ dựa vào Read Committed và hy vọng mọi thứ đúng.

---

## 13. Serializable: mạnh nhưng đắt

Serializable cố làm kết quả giống như các transaction chạy tuần tự từng cái một.

Ưu điểm:

- Dễ reasoning hơn
- Chặn nhiều anomaly
- Phù hợp một số nghiệp vụ cần tính đúng cực mạnh

Nhược điểm:

- Giảm concurrency
- Dễ lock/block nhiều hơn
- Có thể tăng deadlock hoặc serialization failure
- Cần retry ở application

Không nên bật Serializable toàn hệ thống chỉ vì muốn "an toàn". Dùng nó cho đúng đoạn nghiệp vụ cần thiết, đo hiệu năng và chuẩn bị retry.

---

## 14. Lock: database bảo vệ dữ liệu bằng cách nào?

Lock là cơ chế database dùng để điều phối đọc/ghi đồng thời.

Các lock thường gặp theo ý tưởng:

| Lock | Ý nghĩa |
|---|---|
| Shared lock | Dùng khi đọc, nhiều transaction có thể cùng đọc |
| Exclusive lock | Dùng khi ghi, chặn transaction khác ghi/đọc tùy isolation |
| Update lock | Dùng để giảm deadlock trong một số DB như SQL Server |
| Row/Page/Table lock | Phạm vi lock ở dòng, page hoặc cả bảng |
| Range lock | Lock một khoảng dữ liệu để chặn phantom |

Developer không cần thuộc mọi loại lock ngay từ đầu, nhưng phải hiểu:

```text
Transaction càng dài, lock càng giữ lâu.
Lock giữ lâu làm request khác chờ lâu.
Chờ lâu có thể thành timeout, deadlock hoặc nghẽn toàn hệ thống.
```

---

## 15. MVCC: đọc không nhất thiết phải chặn ghi

Nhiều database hiện đại dùng MVCC, tức multi-version concurrency control.

Ý tưởng:

```text
Khi dữ liệu thay đổi, database có thể giữ nhiều phiên bản của dòng.
Reader đọc snapshot phù hợp.
Writer ghi phiên bản mới.
```

Ưu điểm:

- Reader ít bị writer chặn
- Truy vấn đọc ổn định hơn
- Concurrency tốt hơn trong nhiều workload

Nhưng MVCC không phải phép màu:

- Writer vẫn có thể chặn writer
- Transaction dài làm version cũ bị giữ lâu
- Database cần vacuum/cleanup/version store
- Vẫn có serialization conflict tùy isolation

Senior cần biết database của mình dùng lock-based read hay MVCC/snapshot ở mode nào, vì nó ảnh hưởng trực tiếp đến bug và performance.

---

## 16. Pessimistic locking

Pessimistic locking nghĩa là khóa dữ liệu trước khi xử lý, giả định có khả năng tranh chấp cao.

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

Ví dụ PostgreSQL:

```sql
BEGIN;

SELECT StockQuantity
FROM Products
WHERE Id = $1
FOR UPDATE;

UPDATE Products
SET StockQuantity = StockQuantity - $2
WHERE Id = $1
  AND StockQuantity >= $2;

COMMIT;
```

Phù hợp khi:

- Cạnh tranh cao
- Không muốn retry quá nhiều
- Dữ liệu rất nhạy như tồn kho, số dư, slot đặt lịch

Nhược điểm:

- Giữ lock
- Dễ block request khác
- Cần transaction ngắn

---

## 17. Optimistic concurrency

Optimistic concurrency giả định xung đột hiếm. Không khóa trước, nhưng khi update thì kiểm tra dữ liệu có bị người khác đổi chưa.

Thường dùng version column:

```sql
UPDATE Products
SET Name = @name,
    Price = @price,
    RowVersion = RowVersion + 1
WHERE Id = @id
  AND RowVersion = @expectedVersion;
```

Nếu số dòng affected = 0:

```text
Dữ liệu đã bị thay đổi bởi transaction khác.
Không được ghi đè im lặng.
App cần báo conflict hoặc reload dữ liệu.
```

Phù hợp khi:

- Xung đột thấp
- Màn hình chỉnh sửa dữ liệu master
- Không muốn giữ lock lâu trong lúc user đang nhập form
- Có thể yêu cầu user refresh hoặc merge

Không phù hợp nếu nghiệp vụ cần giữ chỗ ngay lập tức với contention cao mà retry liên tục sẽ gây trải nghiệm kém.

---

## 18. Cập nhật tồn kho đúng hơn

Sai lầm phổ biến:

```text
Read stock
Check in application
Subtract in application
Save stock mới
```

Dễ lost update.

Tốt hơn là đưa điều kiện vào câu update atomic:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

Sau đó kiểm tra số dòng affected:

```text
Affected rows = 1 -> trừ kho thành công
Affected rows = 0 -> không đủ tồn hoặc product không tồn tại
```

Nếu cần ghi thêm lịch sử kho:

```sql
BEGIN TRANSACTION;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

-- Nếu affected rows = 0 thì rollback

INSERT INTO StockTransactions(ProductId, Quantity, Reason)
VALUES (@productId, -@quantity, 'OrderCreated');

COMMIT;
```

Điểm mấu chốt:

```text
Điều kiện chống âm kho phải nằm trong write path, không chỉ nằm trong code kiểm tra trước đó.
```

---

## 19. Deadlock là gì?

Deadlock xảy ra khi hai hoặc nhiều transaction chờ nhau theo vòng tròn.

Ví dụ:

```text
Transaction A khóa Order 1
Transaction B khóa Order 2
A muốn khóa Order 2 nên phải chờ B
B muốn khóa Order 1 nên phải chờ A
Không ai đi tiếp được
```

Database thường chọn một transaction làm nạn nhân và rollback nó.

Dấu hiệu:

- Lỗi deadlock trong log
- Request thỉnh thoảng fail dù dữ liệu không sai
- Tải cao hoặc nhiều nghiệp vụ đồng thời thì lỗi tăng

Deadlock không nhất thiết là bug database. Thường là hệ quả của thứ tự lock không nhất quán hoặc transaction quá rộng.

---

## 20. Giảm deadlock

Các cách giảm deadlock:

1. Luôn truy cập bảng/dòng theo cùng một thứ tự.
2. Giữ transaction ngắn.
3. Không gọi API ngoài khi đang mở transaction.
4. Có index phù hợp để update/delete không scan quá rộng.
5. Update theo key cụ thể, tránh điều kiện mơ hồ.
6. Chia batch lớn thành batch nhỏ hơn.
7. Dùng lock hint có chủ đích khi database hỗ trợ và đã hiểu tác dụng.
8. Bắt lỗi deadlock và retry có backoff cho nghiệp vụ idempotent.

Ví dụ xử lý nhiều dòng:

```text
Không ổn:
Request A update product theo thứ tự [2, 1]
Request B update product theo thứ tự [1, 2]

Ổn hơn:
Luôn sort ProductId tăng dần trước khi update: [1, 2]
```

Thứ tự lock nhất quán là một kỹ thuật đơn giản nhưng rất hiệu quả.

---

## 21. Timeout, blocking và long-running transaction

Không phải lỗi transaction nào cũng là deadlock.

Blocking:

```text
Transaction A giữ lock.
Transaction B chờ A nhả lock.
```

Timeout:

```text
B chờ quá lâu nên application/database hủy request.
```

Nguyên nhân hay gặp:

- Transaction mở quá lâu
- Query thiếu index nên update quét nhiều dòng
- Màn hình export/report chạy chung database ghi
- Batch job cập nhật lượng lớn trong giờ cao điểm
- Code mở transaction rồi xử lý logic hoặc gọi service ngoài quá lâu

Checklist khi nghi ngờ blocking:

- Transaction nào đang mở lâu?
- Query nào giữ lock?
- Có index cho điều kiện `WHERE` của `UPDATE/DELETE` không?
- Có batch job nào chạy cùng giờ không?
- Isolation level có quá mạnh không?

---

## 22. Transaction và index

Index ảnh hưởng trực tiếp đến transaction.

Ví dụ:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE CreatedAt < @expiredBefore
  AND Status = 'Pending';
```

Nếu thiếu index phù hợp, database có thể scan nhiều dòng, giữ lock rộng và lâu hơn.

Index gợi ý:

```sql
CREATE INDEX IX_Orders_Status_Created
ON Orders(Status, CreatedAt);
```

Nhưng index cũng làm ghi chậm hơn vì mỗi insert/update/delete phải cập nhật thêm index.

Tư duy middle/senior:

```text
Index không chỉ để SELECT nhanh.
Index đúng còn giúp transaction ghi tìm đúng dòng nhanh hơn, giảm lock duration và giảm blocking.
```

---

## 23. Transaction trong ORM

ORM như Entity Framework, Hibernate, Sequelize, TypeORM thường có cơ chế transaction riêng.

Ví dụ khái niệm:

```text
Begin transaction
Repository A save
Repository B save
Commit
```

Cần kiểm tra rõ:

- `SaveChanges` có tự mở transaction không?
- Nhiều lần `SaveChanges` có nằm cùng một transaction không?
- Có dùng nhiều DbContext/connection khác nhau không?
- Exception có rollback thật không?
- Transaction có bị commit trước khi publish event/gọi API ngoài không?

Sai lầm hay gặp:

```text
Service A tự mở transaction.
Service B cũng tự mở transaction.
Hai service được gọi trong cùng một use case nhưng không cùng boundary.
```

Kết quả có thể là một phần commit, một phần rollback, hoặc transaction lồng nhau không hoạt động như tưởng tượng.

---

## 24. Nested transaction có thật không?

Nhiều developer nghĩ có thể mở transaction lồng nhau tùy ý.

```text
Outer transaction begin
  Inner transaction begin
  Inner commit
Outer rollback
```

Trong nhiều database/framework, inner transaction không phải transaction độc lập thật. Nó có thể chỉ là savepoint, counter, hoặc phụ thuộc transaction ngoài.

Câu hỏi cần kiểm tra:

- Database có hỗ trợ nested transaction thật không?
- ORM map nested transaction thành gì?
- Inner commit có thật sự durable chưa?
- Outer rollback có rollback cả inner không?

Quy tắc thực dụng:

```text
Mỗi use case nên có một transaction boundary rõ ở application service/use case layer.
Repository không nên tự ý commit nghiệp vụ lớn nếu caller cần kiểm soát transaction.
```

---

## 25. Side effect ngoài database

Transaction database không rollback được:

- Gửi email
- Gọi cổng thanh toán
- Gửi message queue nếu gửi trực tiếp
- Upload file
- Gọi API hệ thống khác
- Push notification

Ví dụ nguy hiểm:

```text
Begin transaction
Tạo order
Gửi email xác nhận
Update tồn kho lỗi
Rollback transaction
```

Email đã gửi nhưng order không tồn tại.

Đổi thứ tự cũng có vấn đề:

```text
Begin transaction
Tạo order
Commit
Gửi email lỗi
```

Order tồn tại nhưng email không gửi.

Giải pháp thường dùng:

- Outbox pattern
- Idempotent consumer
- Retry có kiểm soát
- Saga/process manager cho luồng dài
- Reconciliation job để so khớp dữ liệu

---

## 26. Outbox pattern

Outbox giúp đảm bảo thay đổi database và việc phát event đi cùng nhau ở mức đáng tin cậy.

Ý tưởng:

```text
Trong cùng transaction:
1. Ghi dữ liệu nghiệp vụ
2. Ghi một dòng OutboxMessage

Sau commit:
Worker đọc OutboxMessage và publish ra message broker/email/service ngoài.
Publish thành công thì đánh dấu processed.
```

Ví dụ:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status)
VALUES (@orderId, @customerId, 'Created');

INSERT INTO OutboxMessages(Id, Type, Payload, CreatedAt)
VALUES (@messageId, 'OrderCreated', @payload, CURRENT_TIMESTAMP);

COMMIT;
```

Worker:

```text
Đọc outbox chưa xử lý
Publish message
Mark processed
Nếu lỗi thì retry
```

Outbox không đảm bảo consumer chỉ nhận đúng một lần. Nó thường hướng tới at-least-once delivery, nên consumer phải idempotent.

---

## 27. Idempotency

Idempotency nghĩa là gọi lại cùng một request/message nhiều lần vẫn không làm sai dữ liệu.

Ví dụ thanh toán:

```text
Client gửi request thanh toán
Server xử lý xong nhưng response bị timeout
Client retry
Nếu server charge tiền lần hai thì lỗi nghiêm trọng
```

Cách làm:

- Dùng idempotency key
- Lưu request key và kết quả xử lý
- Unique constraint trên business key
- Consumer kiểm tra message đã xử lý chưa

Ví dụ:

```sql
CREATE UNIQUE INDEX UX_Payments_IdempotencyKey
ON Payments(IdempotencyKey);
```

Khi retry cùng key:

```text
Nếu đã xử lý -> trả lại kết quả cũ
Nếu đang xử lý -> trả trạng thái phù hợp hoặc chờ
Nếu chưa có -> xử lý mới
```

Idempotency là bạn đồng hành bắt buộc của retry, outbox, queue và distributed workflow.

---

## 28. Retry transaction

Một số lỗi transaction có thể retry:

- Deadlock victim
- Serialization failure
- Transient network/database error
- Lock timeout trong một số nghiệp vụ cho phép thử lại

Nhưng retry không phải thuốc chữa mọi lỗi.

Chỉ retry khi:

- Operation idempotent hoặc có idempotency key
- Lỗi là transient
- Có giới hạn số lần retry
- Có backoff/jitter
- Có log để theo dõi

Không nên retry mù:

```text
Catch mọi exception rồi chạy lại 5 lần.
```

Vì có thể:

- Ghi trùng dữ liệu
- Gọi API ngoài nhiều lần
- Làm tải database nặng hơn
- Che mất bug logic

---

## 29. Distributed transaction

Distributed transaction là transaction trải qua nhiều database/service.

Ví dụ:

```text
Service Order ghi database A
Service Payment ghi database B
Service Inventory ghi database C
Tất cả phải cùng commit hoặc rollback
```

Có kỹ thuật như two-phase commit, nhưng trong microservices hiện đại thường tránh vì:

- Phức tạp
- Chậm
- Khó vận hành
- Coupling mạnh giữa service
- Không phải hạ tầng nào cũng hỗ trợ tốt

Thay vào đó thường dùng eventual consistency:

- Saga
- Outbox/inbox
- Message broker
- Compensating action
- Reconciliation

Tư duy senior:

```text
Không cố kéo một transaction database qua nhiều service nếu hệ thống không thật sự cần và không đủ năng lực vận hành nó.
```

---

## 30. Saga và compensating action

Saga chia một nghiệp vụ dài thành nhiều bước nhỏ, mỗi bước có transaction riêng.

Ví dụ đặt hàng:

```text
1. Create order
2. Reserve inventory
3. Charge payment
4. Confirm order
```

Nếu bước 3 lỗi, hệ thống chạy compensating action:

```text
Release inventory
Cancel order
```

Saga không rollback theo nghĩa database transaction. Nó sửa trạng thái bằng hành động bù.

Cần thiết kế rõ:

- State machine của saga
- Bước nào retry được
- Bước nào cần compensation
- Compensation có idempotent không
- Khi worker chết giữa chừng thì resume thế nào
- Monitoring để phát hiện saga treo

Saga phù hợp distributed workflow, không thay thế transaction database cho một cụm ghi local cần nhất quán mạnh.

---

## 31. Transaction và message queue

Gửi message trong transaction là nguồn lỗi kinh điển.

Sai:

```text
Begin transaction
Ghi Order
Publish OrderCreated trực tiếp vào queue
Commit lỗi
```

Consumer nhận `OrderCreated` nhưng Order rollback mất.

Sai theo hướng ngược:

```text
Begin transaction
Ghi Order
Commit
Publish OrderCreated lỗi
```

Order tồn tại nhưng event không đi.

Giải pháp thường gặp:

```text
Ghi Order + OutboxMessage trong cùng transaction.
Worker publish sau commit.
Consumer idempotent.
```

Nếu broker/database hỗ trợ transaction chung thì vẫn phải cân nhắc chi phí vận hành. Đa số hệ thống business nên ưu tiên outbox/inbox rõ ràng.

---

## 32. Transaction và cache

Cache không tự rollback theo database.

Vấn đề:

```text
Update database trong transaction
Xóa cache trước commit
Transaction rollback
Cache đã bị xóa hoặc dữ liệu đọc lại lệch timing
```

Hoặc:

```text
Update database commit thành công
Xóa cache lỗi
User tiếp tục đọc cache cũ
```

Pattern thường dùng:

- Invalidate cache sau commit
- Dùng outbox/event để invalidate cache
- TTL hợp lý
- Cache-aside với fallback database
- Với dữ liệu cực nhạy, hạn chế cache hoặc thiết kế consistency rõ

Không nên cập nhật cache như một phần "ảo" của transaction nếu không có cơ chế đảm bảo đi kèm.

---

## 33. Transaction và report/export

Report lớn có thể làm ảnh hưởng transaction ghi.

Vấn đề:

- Query đọc lâu
- Giữ snapshot/version lâu
- Tốn IO/CPU
- Chạy cùng database OLTP
- Gây blocking nếu isolation/lock không phù hợp

Hướng xử lý:

- Read replica
- Snapshot phù hợp
- Bảng tổng hợp
- Materialized view
- Export theo batch
- Giới hạn khoảng ngày
- Queue report chạy nền
- Tách OLTP và analytics khi hệ thống lớn

Senior không ép một database transaction phục vụ mọi thứ. Cần tách workload đọc nặng khỏi ghi nóng khi dữ liệu lớn.

---

## 34. Transaction quá dài

Transaction dài là mùi nguy hiểm.

Nguyên nhân:

- Xử lý logic phức tạp sau khi begin transaction
- Gọi API ngoài
- Đọc/ghi quá nhiều dòng
- Chờ user input
- Export/report trong transaction
- Batch update không chia nhỏ

Hậu quả:

- Lock lâu
- Blocking tăng
- Deadlock tăng
- Version store/WAL/log phình
- Replication lag
- Rollback lâu nếu lỗi

Nguyên tắc:

```text
Chuẩn bị dữ liệu trước transaction nếu có thể.
Mở transaction muộn.
Ghi nhanh.
Commit sớm.
```

---

## 35. Transaction quá nhỏ

Ngược lại, transaction quá nhỏ cũng gây sai.

Ví dụ:

```text
Save Order -> commit
Save OrderItems -> commit
Update Stock -> commit
```

Nếu update stock lỗi, Order và OrderItems đã tồn tại. Trừ khi nghiệp vụ cho phép trạng thái trung gian và có cơ chế bù, đây là lỗi consistency.

Câu hỏi cần hỏi:

```text
Những thay đổi nào phải cùng đúng tại một thời điểm?
Những thay đổi nào có thể eventual consistency?
Những thay đổi nào cần compensation nếu bước sau lỗi?
```

Transaction boundary tốt nằm giữa hai cực: không quá rộng, không quá vụn.

---

## 36. Checklist thiết kế transaction cho một use case

Khi thiết kế một nghiệp vụ ghi dữ liệu, đi theo checklist:

1. Invariant nghiệp vụ cần bảo vệ là gì?
2. Những bảng/dòng nào phải thay đổi cùng nhau?
3. Có side effect ngoài database không?
4. Có request đồng thời cùng tác động một dữ liệu không?
5. Có nguy cơ lost update không?
6. Cần optimistic hay pessimistic locking?
7. Isolation level mặc định đã đủ chưa?
8. Query update/delete có index phù hợp không?
9. Transaction có gọi API ngoài, gửi email, publish queue không?
10. Nếu commit thành công nhưng side effect lỗi thì xử lý thế nào?
11. Nếu side effect thành công nhưng database rollback thì xử lý thế nào?
12. Có cần outbox/inbox/saga/idempotency không?
13. Lỗi deadlock/serialization failure có retry được không?
14. Có log đủ transaction id, business id, idempotency key không?
15. Có test concurrency không?

---

## 37. Checklist review transaction ở mức Middle/Senior

Một review transaction tốt nên hỏi:

- Transaction boundary nằm ở layer nào?
- Repository có tự commit ngoài ý muốn không?
- Có nhiều connection/context làm mất cùng transaction không?
- Có side effect ngoài database trong transaction không?
- Có giữ transaction trong lúc await network không?
- Có retry không, retry có idempotent không?
- Có unique constraint để bảo vệ duplicate không?
- Có chống lost update không?
- Có xử lý affected rows khi update có điều kiện không?
- Có nguy cơ deadlock do thứ tự update không?
- Có index cho các câu `UPDATE/DELETE` quan trọng không?
- Có log đủ để truy ngược khi rollback/deadlock/timeout không?
- Có test case cho hai request chạy song song không?

Ví dụ review chưa đủ:

```text
Đã bọc transaction rồi nên ổn.
```

Ví dụ review tốt hơn:

```text
Transaction đã bao Order + OrderItems + StockTransactions, nhưng đang publish event trực tiếp trước commit.
Nên chuyển sang outbox để tránh event đi ra ngoài khi transaction rollback.
Phần trừ kho dùng UPDATE ... WHERE StockQuantity >= @quantity và check affected rows, hướng này chống oversell tốt hơn read-check-write.
Cần thêm retry có idempotency key cho deadlock/timeout vì client có thể gửi lại request tạo đơn.
```

---

## 38. Các lỗi production hay gặp

### 38.1. Read-check-write gây lost update

```text
Đọc tồn kho -> check -> set tồn kho mới
```

Fix bằng atomic update có điều kiện hoặc locking phù hợp.

### 38.2. Gửi event/email trong transaction

Side effect không rollback được. Dùng outbox hoặc chạy sau commit có cơ chế retry.

### 38.3. Transaction giữ quá lâu

Không gọi API ngoài, không export, không xử lý file lớn khi transaction đang mở.

### 38.4. Thiếu unique constraint

Chỉ check trùng bằng `SELECT` trước khi insert không đủ an toàn khi có concurrent request.

```sql
CREATE UNIQUE INDEX UX_Users_Email ON Users(Email);
```

### 38.5. Không kiểm tra affected rows

Với update có điều kiện, affected rows là tín hiệu nghiệp vụ quan trọng.

```text
0 row affected có thể nghĩa là hết tồn, dữ liệu đã đổi, hoặc quyền không hợp lệ.
```

### 38.6. Retry không idempotent

Retry một operation tạo dữ liệu mà không có idempotency key dễ tạo trùng đơn, trùng payment, trùng phiếu.

### 38.7. Transaction trong loop lớn

Một transaction xử lý hàng trăm nghìn dòng dễ làm log phình và lock lâu. Cần batch, checkpoint, hoặc job nền.

---

## 39. Ví dụ thực tế: tạo đơn hàng và trừ kho

Yêu cầu:

- Tạo đơn hàng
- Tạo dòng hàng
- Trừ tồn kho
- Không cho tồn âm
- Phát event `OrderCreated`
- Cho phép client retry khi timeout

Thiết kế tốt hơn:

```text
1. Client gửi IdempotencyKey
2. Begin transaction
3. Kiểm tra IdempotencyKey đã xử lý chưa
4. Insert Order
5. Insert OrderItems
6. Trừ kho bằng atomic update có điều kiện
7. Insert StockTransactions
8. Insert OutboxMessage(OrderCreated)
9. Commit
10. Worker publish OutboxMessage
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

-- Nếu affected rows = 0: rollback và trả lỗi không đủ tồn

INSERT INTO StockTransactions(ProductId, Quantity, RefId)
VALUES (@productId, -@quantity, @orderId);

INSERT INTO OutboxMessages(Id, Type, Payload)
VALUES (@messageId, 'OrderCreated', @payload);

COMMIT;
```

Ràng buộc nên có:

```sql
CREATE UNIQUE INDEX UX_Orders_IdempotencyKey
ON Orders(IdempotencyKey);
```

Điểm quan trọng:

- Không publish event trực tiếp trong transaction
- Không read-check-write tồn kho theo kiểu ghi đè
- Có unique key để chống retry tạo trùng
- Có outbox để event không mất
- Có thể retry deadlock vì operation có idempotency key

---

## 40. Câu tổng kết

Junior thường nhìn transaction như cú pháp:

```sql
BEGIN;
COMMIT;
ROLLBACK;
```

Middle bắt đầu nhìn transaction theo use case:

```text
Bảng nào phải cùng commit?
Nếu lỗi giữa chừng thì rollback gì?
Isolation mặc định có đủ không?
```

Senior nhìn transaction như một quyết định thiết kế và vận hành:

```text
Invariant nào cần bảo vệ?
Concurrency thực tế ra sao?
Lock giữ bao lâu?
Deadlock retry thế nào?
Side effect ngoài database xử lý bằng pattern gì?
Boundary có quá rộng hoặc quá nhỏ không?
Nếu request retry thì có idempotent không?
Nếu dữ liệu tăng 10 lần thì còn ổn không?
```

**Kết luận**: Transaction tốt không phải cứ bọc thật nhiều code vào `BEGIN/COMMIT`. Transaction tốt là boundary đủ hẹp để chạy nhanh, đủ rộng để bảo vệ invariant, có isolation/concurrency phù hợp, và phối hợp đúng với side effect ngoài database bằng outbox, idempotency, retry hoặc saga khi cần.
