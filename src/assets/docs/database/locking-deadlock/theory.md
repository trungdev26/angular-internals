# Locking & Deadlock trong Database

Locking là cơ chế database dùng để bảo vệ dữ liệu khi nhiều transaction cùng đọc/ghi một lúc.

Deadlock là một trong những lỗi concurrency khó chịu nhất: hệ thống đang chạy bình thường, nhưng dưới tải cao lại có request thỉnh thoảng fail vì các transaction chờ nhau theo vòng tròn.

Nếu Index giúp query đọc nhanh hơn, Execution Plan giúp hiểu database chạy query thế nào, Transaction giúp giữ consistency, thì Locking & Deadlock giúp mình hiểu chuyện gì xảy ra khi nhiều người cùng thao tác dữ liệu production.

---

## 1. Vì sao backend developer cần học locking?

Nhiều lỗi production không nằm ở cú pháp SQL.

Ví dụ:

```text
API chạy nhanh ở dev.
Lên production thỉnh thoảng timeout.
Query có index rồi nhưng vẫn chậm.
Đơn hàng đôi lúc tạo lỗi deadlock.
Batch job chạy làm màn hình user bị đứng.
Report cuối ngày làm hệ thống ghi chậm hẳn.
```

Các vấn đề này thường liên quan đến:

- Lock bị giữ quá lâu
- Transaction quá rộng
- Query update/delete scan nhiều dòng
- Deadlock do thứ tự ghi không nhất quán
- Isolation level không phù hợp
- Batch job tranh chấp với request online
- Retry sai làm tải database tăng thêm

Senior backend không chỉ biết viết transaction. Senior phải biết transaction đó giữ lock gì, giữ bao lâu, ảnh hưởng request khác thế nào.

---

## 2. Lock là gì?

Lock là cách database đặt "quyền tạm thời" lên dữ liệu để tránh các transaction phá nhau.

Ví dụ một transaction đang update tài khoản:

```sql
BEGIN TRANSACTION;

UPDATE Accounts
SET Balance = Balance - 1000000
WHERE Id = 1;

-- Chưa commit
```

Trong lúc transaction này chưa commit, database phải quyết định transaction khác có được đọc/ghi dòng `Accounts.Id = 1` không.

Quyết định đó phụ thuộc vào:

- Database engine
- Isolation level
- Lock mode
- Index được dùng
- Câu SQL
- Transaction đã mở bao lâu
- MVCC/snapshot có bật không

---

## 3. Lock bảo vệ điều gì?

Lock bảo vệ các tình huống như:

- Hai transaction cùng sửa một dòng
- Một transaction đọc dữ liệu đang được sửa
- Một transaction kiểm tra điều kiện rồi transaction khác insert dòng mới làm điều kiện sai
- Update nhiều dòng nhưng transaction khác chen vào giữa
- Constraint/index cần được giữ nhất quán

Ví dụ tồn kho:

```text
Stock = 1
User A đặt 1 sản phẩm
User B đặt 1 sản phẩm cùng lúc
```

Nếu không có cơ chế concurrency đúng, cả hai request có thể cùng nghĩ còn hàng.

Lock không phải thứ xấu. Lock là cơ chế cần thiết. Vấn đề là lock bị giữ quá rộng, quá lâu, hoặc theo thứ tự gây deadlock.

---

## 4. Shared Lock và Exclusive Lock

Hai loại lock nền tảng:

| Lock | Ý nghĩa | Thường dùng khi |
|---|---|---|
| Shared lock | Cho phép đọc, nhiều transaction có thể cùng giữ | SELECT trong một số isolation |
| Exclusive lock | Độc quyền ghi, chặn ghi khác và có thể chặn đọc | INSERT/UPDATE/DELETE |

Ý tưởng:

```text
Nhiều người có thể cùng đọc một cuốn sách.
Nhưng khi một người đang sửa nội dung, người khác không nên sửa cùng lúc.
```

Trong lock-based read:

```text
SELECT có thể lấy shared lock.
UPDATE lấy exclusive lock.
Shared lock và exclusive lock thường không tương thích.
```

Trong database dùng MVCC/snapshot, reader có thể đọc version cũ mà không chặn writer trong nhiều trường hợp. Nhưng writer vẫn phải điều phối với writer.

---

## 5. Update Lock

Update lock thường gặp trong SQL Server.

Nó giúp giảm deadlock khi một transaction đọc dữ liệu với ý định sẽ update sau đó.

Ví dụ:

```sql
BEGIN TRANSACTION;

SELECT StockQuantity
FROM Products WITH (UPDLOCK)
WHERE Id = @productId;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

Ý tưởng:

```text
Tôi đang đọc dòng này và có ý định update.
Đừng để transaction khác cũng đọc với ý định update cùng lúc rồi cả hai chờ nhau.
```

Không nên dùng lock hint theo thói quen. Chỉ dùng khi hiểu rõ vấn đề contention và đã đo/verify.

---

## 6. Row lock, Page lock, Table lock

Lock có thể nằm ở nhiều cấp:

| Cấp lock | Ý nghĩa |
|---|---|
| Row lock | Khóa từng dòng |
| Page lock | Khóa một page dữ liệu/index |
| Table lock | Khóa cả bảng |
| Range lock | Khóa một khoảng giá trị |

Row lock nghe có vẻ tốt nhất, nhưng không phải lúc nào database cũng chỉ dùng row lock.

Database có thể chọn page/table lock nếu:

- Query đụng quá nhiều dòng
- Thiếu index nên scan rộng
- Lock quá nhiều gây overhead
- Engine quyết định escalation
- Câu lệnh dùng hint/table lock

Điểm quan trọng:

```text
Thiếu index không chỉ làm query chậm.
Thiếu index còn có thể làm lock rộng hơn và lâu hơn.
```

---

## 7. Lock compatibility

Không phải lock nào cũng chặn nhau.

Ý tưởng đơn giản:

| Transaction A | Transaction B | Có thể chạy cùng không? |
|---|---|---|
| Read | Read | Thường có |
| Read | Write | Tùy isolation/MVCC |
| Write | Write cùng dòng | Không |
| Write dòng khác | Write dòng khác | Có thể, nếu lock đủ hẹp |

Khi đọc plan/debug production, cần hỏi:

```text
Query này đang chờ lock gì?
Ai đang giữ lock?
Lock nằm trên row, page, table hay range?
Vì sao lock giữ lâu?
```

---

## 8. Blocking là gì?

Blocking xảy ra khi một transaction phải chờ transaction khác nhả lock.

Ví dụ:

```text
Transaction A update Order 100 và chưa commit.
Transaction B muốn update Order 100.
B phải chờ A commit hoặc rollback.
```

Blocking không luôn là lỗi. Nó là hành vi bình thường.

Blocking trở thành vấn đề khi:

- Chờ quá lâu
- Gây timeout
- Nhiều request xếp hàng
- Một transaction chặn hàng loạt transaction khác
- User thấy hệ thống đứng

Câu nhớ:

```text
Blocking là chờ theo một chiều.
Deadlock là chờ theo vòng tròn.
```

---

## 9. Deadlock là gì?

Deadlock xảy ra khi các transaction chờ nhau theo vòng tròn, không ai có thể tiếp tục.

Ví dụ:

```text
Transaction A khóa Product 1.
Transaction B khóa Product 2.
A muốn khóa Product 2 nên chờ B.
B muốn khóa Product 1 nên chờ A.
```

Vòng chờ:

```text
A chờ B
B chờ A
```

Database thường phát hiện deadlock và chọn một transaction làm victim để rollback.

Vì vậy deadlock thường xuất hiện ở application như một exception:

```text
Deadlock victim
Transaction was deadlocked
Serialization/deadlock failure
```

---

## 10. Blocking vs Deadlock

| Vấn đề | Bản chất | Kết quả |
|---|---|---|
| Blocking | Transaction B chờ A | Có thể tiếp tục khi A xong |
| Timeout | Chờ quá lâu | App/database hủy request |
| Deadlock | A chờ B, B chờ A | Database rollback một transaction |

Không nên gọi mọi timeout là deadlock.

Khi debug:

```text
Deadlock có victim và deadlock graph/log.
Blocking có blocker và waiter.
Timeout có thể do blocking, query chậm, network hoặc app timeout.
```

---

## 11. Ví dụ deadlock đơn giản

Transaction A:

```sql
BEGIN TRANSACTION;

UPDATE Products
SET StockQuantity = StockQuantity - 1
WHERE Id = 1;

UPDATE Products
SET StockQuantity = StockQuantity - 1
WHERE Id = 2;

COMMIT;
```

Transaction B:

```sql
BEGIN TRANSACTION;

UPDATE Products
SET StockQuantity = StockQuantity - 1
WHERE Id = 2;

UPDATE Products
SET StockQuantity = StockQuantity - 1
WHERE Id = 1;

COMMIT;
```

Nếu A khóa `Id = 1`, B khóa `Id = 2`, rồi cả hai muốn khóa dòng còn lại, deadlock có thể xảy ra.

Cách giảm:

```text
Luôn update product theo cùng thứ tự, ví dụ sort ProductId tăng dần trước khi xử lý.
```

---

## 12. Vì sao thứ tự lock quan trọng?

Deadlock thường xuất hiện khi các transaction lấy cùng nhóm tài nguyên nhưng theo thứ tự khác nhau.

Không ổn:

```text
Request A: update Order -> update Stock
Request B: update Stock -> update Order
```

Ổn hơn:

```text
Mọi flow đều update Order trước, Stock sau.
```

Hoặc với nhiều dòng:

```text
Luôn sort theo Id trước khi update.
```

Đây là kỹ thuật đơn giản nhưng rất hiệu quả.

Senior review code không chỉ xem câu SQL đúng không, mà xem các flow khác nhau có lấy lock theo thứ tự nhất quán không.

---

## 13. Transaction dài giữ lock lâu

Transaction càng dài, lock càng giữ lâu.

Ví dụ xấu:

```text
Begin transaction
Đọc dữ liệu
Gọi API thanh toán
Upload file
Gửi email
Update database
Commit
```

Trong lúc chờ API/file/email, lock có thể vẫn bị giữ.

Nguyên tắc:

```text
Chuẩn bị dữ liệu trước.
Mở transaction muộn.
Ghi nhanh.
Commit sớm.
Side effect ngoài database xử lý bằng outbox/event/retry sau commit.
```

---

## 14. Thiếu index gây lock lâu

Ví dụ:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE Status = 'Pending'
  AND ExpiredAt < @now;
```

Nếu thiếu index theo `(Status, ExpiredAt)`, database có thể scan nhiều dòng.

Hậu quả:

- Đọc nhiều page
- Giữ lock lâu
- Có thể lock rộng
- Chặn transaction khác
- Dễ timeout/deadlock hơn

Index gợi ý:

```sql
CREATE INDEX IX_Orders_Status_ExpiredAt
ON Orders(Status, ExpiredAt);
```

Tư duy quan trọng:

```text
Index cho UPDATE/DELETE quan trọng không kém index cho SELECT.
```

---

## 15. Lock escalation

Lock escalation là khi database nâng nhiều lock nhỏ thành lock lớn hơn, ví dụ từ nhiều row lock lên table lock.

Lý do:

- Quá nhiều lock nhỏ gây overhead
- Query đụng quá nhiều dòng
- Engine quyết định lock lớn hiệu quả hơn

Hậu quả:

- Một transaction có thể chặn nhiều request hơn dự kiến
- Batch job update lớn có thể làm cả bảng bị ảnh hưởng

Cách giảm:

- Batch nhỏ hơn
- Index đúng để giảm số dòng đụng tới
- Chạy job ngoài giờ cao điểm
- Thiết kế archive/partition
- Theo dõi lock escalation trong monitoring

---

## 16. Range lock và phantom

Range lock khóa một khoảng giá trị, không chỉ khóa dòng đã tồn tại.

Ví dụ nghiệp vụ:

```text
Không cho tạo 2 booking trùng slot.
```

Transaction A kiểm tra:

```sql
SELECT *
FROM Bookings
WHERE RoomId = @roomId
  AND StartTime < @endTime
  AND EndTime > @startTime;
```

Nếu không có cơ chế đúng, transaction B có thể insert booking trùng ngay sau khi A kiểm tra.

Serializable hoặc lock range có thể chặn phantom trong một số database.

Nhưng thường cần thêm:

- Unique/exclusion constraint nếu database hỗ trợ
- Thiết kế slot rõ ràng
- Atomic insert/update
- Transaction isolation phù hợp

Không nên chỉ `SELECT kiểm tra rồi INSERT` mà không có constraint/lock bảo vệ.

---

## 17. Isolation level ảnh hưởng lock thế nào?

Isolation level càng mạnh thường càng bảo vệ tốt hơn nhưng chi phí concurrency cao hơn.

| Isolation | Hành vi thường gặp |
|---|---|
| Read Uncommitted | Có thể dirty read, ít chặn hơn nhưng nguy hiểm |
| Read Committed | Tránh dirty read, default phổ biến |
| Repeatable Read | Giữ ổn định dòng đã đọc, lock/snapshot tùy DB |
| Serializable | Mạnh nhất, có thể lock range/chặn phantom |

Lưu ý:

```text
Cùng tên isolation nhưng hành vi thực tế khác nhau giữa SQL Server, PostgreSQL, MySQL/InnoDB.
```

Khi debug lock, phải biết database đang dùng isolation nào và mode snapshot/MVCC có bật không.

---

## 18. Read Committed và blocking

Read Committed thường không cho đọc dữ liệu chưa commit.

Trong lock-based read, nếu một dòng đang bị transaction khác update, SELECT có thể phải chờ.

Trong snapshot-based read committed, SELECT có thể đọc version đã commit gần nhất mà không chờ writer.

Vì vậy cùng là Read Committed nhưng:

```text
SQL Server default lock-based có thể khác SQL Server bật RCSI.
PostgreSQL đọc theo MVCC snapshot.
MySQL/InnoDB có hành vi riêng theo consistent read/current read.
```

Đừng học isolation level chỉ bằng bảng lý thuyết. Khi làm production, phải hiểu engine cụ thể.

---

## 19. MVCC và Snapshot

MVCC cho phép database lưu nhiều version của dữ liệu.

Ý tưởng:

```text
Writer tạo version mới.
Reader có thể đọc version cũ phù hợp snapshot.
Reader ít chặn writer hơn.
```

Ưu điểm:

- Giảm read/write blocking
- Query đọc ổn định hơn
- Tăng concurrency cho workload đọc nhiều

Nhược điểm:

- Writer vẫn tranh chấp với writer
- Long transaction giữ version cũ lâu
- Version store/WAL/vacuum có thể bị áp lực
- Snapshot quá cũ có thể gây lỗi tùy DB
- Không tự giải quyết mọi lost update/business race

Câu nhớ:

```text
MVCC giảm nhiều blocking giữa đọc và ghi, nhưng không xóa bỏ vấn đề concurrency.
```

---

## 20. Pessimistic locking

Pessimistic locking giả định sẽ có tranh chấp, nên khóa trước.

PostgreSQL:

```sql
BEGIN;

SELECT StockQuantity
FROM Products
WHERE Id = $1
FOR UPDATE;

UPDATE Products
SET StockQuantity = StockQuantity - $2
WHERE Id = $1;

COMMIT;
```

SQL Server:

```sql
BEGIN TRANSACTION;

SELECT StockQuantity
FROM Products WITH (UPDLOCK, ROWLOCK)
WHERE Id = @productId;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

Phù hợp khi:

- Tranh chấp cao
- Dữ liệu nhạy cảm
- Muốn tránh conflict sau khi user đã đi xa trong flow

Nhược điểm:

- Giữ lock
- Có blocking
- Cần transaction ngắn

---

## 21. Optimistic concurrency

Optimistic concurrency giả định conflict hiếm. Không khóa trước, nhưng khi ghi thì kiểm tra version.

Ví dụ:

```sql
UPDATE Products
SET Name = @name,
    Price = @price,
    RowVersion = RowVersion + 1
WHERE Id = @id
  AND RowVersion = @expectedVersion;
```

Nếu affected rows = 0:

```text
Dữ liệu đã bị thay đổi bởi người khác.
Không được ghi đè im lặng.
```

Phù hợp khi:

- Form edit dữ liệu master
- Conflict thấp
- User có thể refresh/merge
- Không muốn giữ lock trong lúc user nhập liệu

Không phù hợp nếu tranh chấp rất cao và retry liên tục gây trải nghiệm tệ.

---

## 22. Atomic update giúp giảm race

Sai:

```text
SELECT StockQuantity
Check trong app
UPDATE StockQuantity = giá trị mới
```

Dễ lost update.

Tốt hơn:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

Sau đó kiểm tra affected rows:

```text
1 row affected: trừ kho thành công
0 row affected: không đủ tồn hoặc product không tồn tại
```

Điểm hay:

- Check và update nằm trong cùng câu lệnh
- Database xử lý atomic
- Giảm cửa sổ race condition

Nếu cần ghi lịch sử kho, bọc update + insert history trong cùng transaction.

---

## 23. Deadlock graph đọc gì?

Deadlock graph/log thường cho biết:

- Transaction/process nào tham gia
- Câu SQL nào đang chạy
- Lock resource là gì
- Ai giữ lock
- Ai đang chờ lock
- Victim là transaction nào
- Mode lock đang giữ/chờ

Khi đọc deadlock graph, hỏi:

```text
Hai transaction lấy tài nguyên nào?
Thứ tự lấy lock có ngược nhau không?
Câu SQL nào scan rộng?
Index nào thiếu?
Transaction nào giữ lock lâu?
Có flow nào update cùng bảng nhưng thứ tự khác không?
```

Đừng chỉ retry deadlock rồi bỏ qua. Retry giúp request qua được, nhưng deadlock lặp lại nhiều là tín hiệu thiết kế cần xem lại.

---

## 24. Cách giảm deadlock

Các cách thực dụng:

1. Giữ transaction ngắn.
2. Không gọi API ngoài trong transaction.
3. Luôn update bảng/dòng theo cùng thứ tự.
4. Sort danh sách Id trước khi update nhiều dòng.
5. Thêm index cho điều kiện update/delete.
6. Tránh scan lớn trong transaction.
7. Chia batch lớn thành batch nhỏ.
8. Dùng isolation level vừa đủ.
9. Dùng lock hint có chủ đích khi cần.
10. Retry deadlock với idempotency và backoff.

Ví dụ:

```text
Nếu nhiều request cùng update ProductIds [3, 1, 2],
hãy sort thành [1, 2, 3] trước khi update.
```

---

## 25. Retry deadlock đúng cách

Deadlock victim thường có thể retry, nhưng không được retry mù.

Retry chỉ ổn khi:

- Operation idempotent hoặc có idempotency key
- Exception đúng loại transient/deadlock
- Có giới hạn số lần retry
- Có backoff/jitter
- Không lặp lại side effect ngoài database
- Có log để theo dõi tần suất

Sai:

```text
Catch mọi exception rồi retry 5 lần.
```

Đúng hơn:

```text
Chỉ retry lỗi deadlock/serialization/transient đã phân loại.
Retry tối đa 2-3 lần.
Backoff tăng dần.
Nếu vẫn fail thì trả lỗi có kiểm soát.
```

Nếu retry một request tạo đơn hàng mà không có idempotency key, có thể tạo trùng đơn.

---

## 26. Side effect ngoài database và lock

Không nên làm side effect ngoài database khi transaction đang mở:

- Gọi payment gateway
- Gửi email
- Publish message trực tiếp
- Upload file
- Gọi service khác

Vì:

- Làm transaction dài
- Giữ lock lâu
- Side effect không rollback được
- Timeout bên ngoài kéo database vào trạng thái chờ

Pattern tốt hơn:

```text
Trong transaction:
  Ghi dữ liệu nghiệp vụ
  Ghi OutboxMessage
Commit

Sau commit:
  Worker publish message/gửi email/gọi service ngoài
```

---

## 27. Batch job và lock

Batch job là nguồn gây lock production rất phổ biến.

Ví dụ:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE Status = 'Pending'
  AND ExpiredAt < @now;
```

Nếu câu này update 2 triệu dòng trong một transaction:

- Lock giữ lâu
- Log tăng mạnh
- Replication lag
- Request online bị chặn
- Rollback cực lâu nếu lỗi

Hướng tốt hơn:

- Batch theo `TOP/LIMIT`
- Có index phù hợp
- Commit từng batch
- Chạy ngoài giờ cao điểm
- Có checkpoint/resume
- Theo dõi số dòng mỗi batch

Ví dụ ý tưởng:

```text
Mỗi lần update 1.000 dòng.
Commit.
Nghỉ ngắn.
Lặp tiếp.
```

---

## 28. Report/export và lock

Report lớn có thể gây áp lực concurrency:

- Đọc nhiều dữ liệu
- Giữ snapshot lâu
- Tốn IO/CPU
- Làm version store phình trong MVCC
- Có thể block nếu isolation/engine dùng lock-based read

Hướng xử lý:

- Read replica
- Report async
- Bảng tổng hợp
- Materialized view
- Giới hạn khoảng thời gian
- Export theo batch
- Tách OLTP và analytics khi hệ thống lớn

Không nên để report nặng chạy trực tiếp trên bảng giao dịch nóng nếu dữ liệu đã lớn.

---

## 29. Lock timeout

Lock timeout xảy ra khi transaction chờ lock quá lâu.

Nó khác deadlock:

```text
Deadlock: chờ vòng tròn, database rollback victim.
Lock timeout: chờ một lock quá lâu nên timeout.
```

Khi gặp lock timeout:

- Tìm blocker
- Xem blocker đang chạy câu SQL nào
- Xem transaction mở bao lâu
- Xem query waiter có index không
- Xem có batch/report nào đang chạy không
- Xem timeout config ở app/database

Tăng timeout chỉ là giải pháp cuối, không phải chữa nguyên nhân.

---

## 30. Connection pool và transaction bị bỏ quên

Một lỗi nguy hiểm:

```text
Mở transaction
Exception xảy ra
Không rollback/commit đúng
Connection quay lại pool trong trạng thái xấu hoặc giữ lock lâu
```

Framework thường giúp xử lý, nhưng code vẫn phải cẩn thận.

Nguyên tắc:

- Dùng `using`/scope transaction đúng cách
- Rollback khi exception
- Không swallow exception rồi bỏ transaction
- Không để transaction sống qua nhiều layer mơ hồ
- Log transaction boundary ở nghiệp vụ quan trọng

---

## 31. Transaction trong ORM và lock

ORM không làm biến mất lock.

Ví dụ:

```text
Load entity
Modify object
SaveChanges
```

Khi `SaveChanges`, ORM sinh SQL và database vẫn lấy lock như thường.

Cần chú ý:

- ORM có thể update nhiều cột hơn cần thiết
- Lazy loading gây N+1 và kéo dài request
- SaveChanges nhiều lần có thể tạo nhiều transaction nhỏ
- Transaction scope quá rộng có thể giữ lock qua nhiều thao tác
- Query generated SQL có thể không SARGable

Senior BE cần xem SQL thật ORM sinh ra khi debug performance/concurrency.

---

## 32. Lock và foreign key

Foreign key cũng ảnh hưởng locking.

Ví dụ xóa parent:

```sql
DELETE FROM Customers
WHERE Id = @customerId;
```

Database phải kiểm tra bảng con như `Orders` có dòng tham chiếu không.

Nếu bảng con thiếu index trên FK:

```sql
Orders(CustomerId)
```

Database có thể scan bảng con để kiểm tra, gây chậm và lock rộng.

Nguyên tắc:

```text
Các foreign key quan trọng thường nên có index ở bảng con.
```

Đặc biệt với delete/update parent hoặc join thường xuyên.

---

## 33. Unique constraint và concurrency

Không nên chống trùng chỉ bằng check trước insert:

```sql
SELECT COUNT(*)
FROM Users
WHERE Email = @email;

INSERT INTO Users(Email)
VALUES (@email);
```

Hai request cùng lúc có thể đều thấy chưa tồn tại rồi cùng insert.

Đúng hơn:

```sql
CREATE UNIQUE INDEX UX_Users_Email
ON Users(Email);
```

Sau đó insert và xử lý lỗi unique violation.

Unique constraint vừa bảo vệ dữ liệu, vừa là công cụ concurrency cực quan trọng.

---

## 34. Queue worker và lock

Nhiều worker cùng lấy job cần thiết kế locking đúng.

Ý tưởng phổ biến:

```text
Worker lấy một batch job Pending.
Đánh dấu Processing.
Commit.
Xử lý job.
Đánh dấu Done/Failed.
```

Nếu nhiều worker cùng đọc một job Pending mà không lock/claim atomic, job có thể bị xử lý trùng.

Một số DB hỗ trợ pattern như:

- `FOR UPDATE SKIP LOCKED` trong PostgreSQL
- Lock hints trong SQL Server
- Atomic update với status condition

Ví dụ ý tưởng:

```sql
UPDATE Jobs
SET Status = 'Processing',
    WorkerId = @workerId
WHERE Id = @jobId
  AND Status = 'Pending';
```

Check affected rows để biết claim job thành công không.

---

## 35. Case thực tế: trừ kho

Yêu cầu:

- Không cho tồn âm
- Nhiều người đặt hàng cùng lúc
- Có lịch sử kho

Hướng tốt:

```sql
BEGIN TRANSACTION;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

-- Nếu affected rows = 0: rollback, báo không đủ tồn

INSERT INTO StockTransactions(ProductId, Quantity, Reason)
VALUES (@productId, -@quantity, 'OrderCreated');

COMMIT;
```

Nếu đơn hàng có nhiều sản phẩm:

```text
Sort ProductId tăng dần trước khi trừ kho từng dòng.
```

Giúp giảm deadlock khi nhiều đơn cùng chứa các sản phẩm giống nhau nhưng thứ tự khác.

---

## 36. Case thực tế: cập nhật trạng thái đơn

Sai:

```sql
UPDATE Orders
SET Status = 'Cancelled'
WHERE Id = @orderId;
```

Nếu không kiểm tra trạng thái hiện tại, request song song có thể ghi đè trạng thái.

Tốt hơn:

```sql
UPDATE Orders
SET Status = 'Cancelled'
WHERE Id = @orderId
  AND Status = 'Pending';
```

Check affected rows:

```text
1: cancel thành công
0: order không còn Pending hoặc không tồn tại
```

Đây là optimistic concurrency ở mức business state.

---

## 37. Case thực tế: batch expire orders

Query:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE Status = 'Pending'
  AND ExpiredAt < @now;
```

Rủi ro:

- Update quá nhiều dòng
- Scan nếu thiếu index
- Lock lâu
- Chặn API user đang thao tác order

Hướng tốt:

```text
1. Có index (Status, ExpiredAt).
2. Lấy batch nhỏ order ids cần expire.
3. Update theo Id trong batch.
4. Commit từng batch.
5. Có checkpoint/resume.
6. Chạy ngoài giờ cao điểm nếu cần.
```

---

## 38. Checklist debug blocking production

Khi API timeout nghi do lock:

1. Xác định query/request nào đang chờ.
2. Tìm blocker đang giữ lock.
3. Xem blocker mở transaction bao lâu.
4. Xem blocker đang chạy SQL nào.
5. Xem waiter đang chờ resource nào.
6. Kiểm tra query update/delete có index không.
7. Kiểm tra có batch/report đang chạy không.
8. Kiểm tra transaction có gọi API ngoài không.
9. Kiểm tra isolation level.
10. Kiểm tra số dòng bị đụng tới.
11. Nếu cần, kill blocker có kiểm soát và ghi nhận hậu quả.
12. Sau incident, sửa root cause: index, batch, boundary, schedule, code flow.

---

## 39. Checklist debug deadlock

Khi gặp deadlock:

1. Lấy deadlock graph/log.
2. Xác định victim.
3. Xác định các transaction tham gia.
4. Xem câu SQL mỗi transaction đang chạy.
5. Xác định resource bị giữ/chờ.
6. Kiểm tra thứ tự lock có ngược nhau không.
7. Kiểm tra query có scan rộng vì thiếu index không.
8. Kiểm tra transaction có quá dài không.
9. Kiểm tra batch nhiều dòng có sort Id không.
10. Thêm retry có kiểm soát nếu operation idempotent.
11. Sửa root cause, không chỉ tăng retry.

---

## 40. Checklist thiết kế chống lock/deadlock

Khi thiết kế use case ghi dữ liệu:

1. Những dòng/bảng nào sẽ bị update?
2. Có request song song tác động cùng dữ liệu không?
3. Transaction boundary có đủ hẹp không?
4. Có side effect ngoài database trong transaction không?
5. Các flow khác có update cùng bảng theo thứ tự khác không?
6. Update nhiều dòng có sort key trước không?
7. Điều kiện update/delete có index không?
8. Có cần optimistic concurrency/version không?
9. Có cần pessimistic lock không?
10. Có check affected rows không?
11. Có unique constraint bảo vệ invariant không?
12. Có retry deadlock đúng cách không?
13. Có idempotency key cho request có thể retry không?
14. Có log business id/correlation id để truy sự cố không?

---

## 41. Khi nào dùng lock mạnh hơn?

Có lúc cần lock mạnh hơn hoặc isolation cao hơn:

- Booking slot không được trùng
- Trừ kho contention cao
- Rút tiền/chuyển tiền
- Claim job trong queue
- Sinh số thứ tự tuần tự theo nghiệp vụ
- Kiểm tra invariant trên một khoảng dữ liệu

Nhưng lock mạnh hơn phải đi cùng:

- Transaction ngắn
- Index tốt
- Retry
- Monitoring
- Test concurrency

Không nên bật isolation mạnh toàn hệ thống chỉ vì một nghiệp vụ nhỏ.

---

## 42. Khi nào không nên dùng lock để giải quyết?

Không nên dùng lock nặng nếu vấn đề thật là:

- Report cần read model
- API trả quá nhiều dữ liệu
- Batch job nên chia nhỏ
- Workflow dài nên dùng saga
- Side effect nên dùng outbox
- Duplicate nên dùng unique constraint/idempotency
- Form edit nên dùng optimistic concurrency
- Search text nên dùng search engine/full-text

Senior biết khi nào lock là đúng thuốc, và khi nào lock chỉ làm hệ thống nghẽn hơn.

---

## 43. Tư duy Middle/Senior

Junior thường nghĩ:

```text
Bọc transaction là an toàn.
```

Middle bắt đầu hỏi:

```text
Transaction này update bảng nào?
Có deadlock không?
Có giữ lock lâu không?
```

Senior hỏi sâu hơn:

```text
Lock order giữa các use case có nhất quán không?
Query update/delete có seek đúng index không?
Batch job có lock quá rộng không?
Retry có idempotent không?
Side effect ngoài database có làm transaction dài không?
Deadlock graph nói resource nào đang tranh chấp?
Nếu dữ liệu tăng 10 lần, lock duration có còn ổn không?
```

Locking không phải kiến thức DBA xa vời. Nó là phần lõi của backend production.

---

## 44. Câu tổng kết

Lock giúp database giữ dữ liệu đúng khi nhiều transaction chạy cùng lúc. Deadlock là hệ quả khi nhiều transaction lấy tài nguyên theo thứ tự xung đột.

Muốn xử lý tốt locking/deadlock, đừng chỉ nhớ tên lock. Hãy nhìn vào:

```text
Transaction boundary
Thứ tự update
Index cho write path
Isolation level
Side effect ngoài database
Batch size
Retry và idempotency
Deadlock graph/log
```

**Kết luận**: Backend senior không chỉ làm cho query chạy đúng. Backend senior làm cho query chạy đúng khi nhiều request cùng lúc, dữ liệu lớn, production có batch job, có retry, có timeout, và có người dùng thật đang chờ hệ thống phản hồi.
