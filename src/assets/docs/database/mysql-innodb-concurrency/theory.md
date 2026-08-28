# MySQL InnoDB Concurrency

InnoDB là storage engine mặc định của MySQL cho workload transactional. Nó kết hợp Multi-Version Concurrency Control (MVCC) với row/index locking để các transaction đọc và ghi đồng thời mà vẫn giữ consistency.

## Isolation mặc định

InnoDB mặc định dùng `REPEATABLE READ`. Các plain consistent read trong cùng transaction đọc snapshot được tạo bởi consistent read đầu tiên. `READ COMMITTED` tạo snapshot mới cho mỗi consistent read.

```sql
SELECT @@GLOBAL.transaction_isolation,
       @@SESSION.transaction_isolation;
```

Không suy isolation từ code hoặc connection string. Production deployment cần kiểm tra giá trị session thực tế vì server có thể được cấu hình khác mặc định.

## Consistent read và current read

Plain `SELECT` thường là consistent read: nó đọc version từ MVCC snapshot và không khóa row theo cách locking read.

`SELECT ... FOR UPDATE`, `UPDATE` và `DELETE` cần current version để thay đổi dữ liệu, vì vậy chúng tham gia locking. Một transaction có thể thấy snapshot cũ ở plain `SELECT` nhưng DML vẫn đánh giá current committed/locked state theo rule của engine.

Sự khác biệt này giải thích vì sao “đã đọc trong transaction” không đồng nghĩa row đã bị khóa.

## Record, gap và next-key lock

InnoDB khóa index record được scan. Trong `REPEATABLE READ`, range search có thể dùng next-key lock, kết hợp record lock với gap trước record để ngăn phantom insert vào range.

```sql
SELECT *
FROM donHang
WHERE tenantId = @tenantId
  AND createAt >= @from
FOR UPDATE;
```

Nếu thiếu index phù hợp, engine scan phạm vi rộng và lock footprint tăng. Index là một phần của concurrency design, không chỉ là optimization.

Unique lookup thường khóa hẹp hơn range scan:

```sql
SELECT * FROM donHang WHERE id = @id FOR UPDATE;
```

## Lost update

Hai request có thể cùng đọc một row rồi ghi hai giá trị khác nhau. Isolation level không tự bảo vệ mọi read-modify-write pattern.

Optimistic concurrency thêm version/token vào `WHERE`:

```sql
UPDATE donHang
SET trangThai = @trangThaiMoi,
    version = @versionMoi
WHERE id = @id
  AND version = @versionCu;
```

Affected rows bằng `0` nghĩa là state đã thay đổi. Application phải reload, báo conflict hoặc retry operation đã chứng minh idempotent.

## Atomic conditional update

Counter hoặc tồn kho không nên chỉ “SELECT rồi kiểm tra”:

```sql
UPDATE tonKho
SET soLuong = soLuong - @soLuongDat
WHERE tenantId = @tenantId
  AND shopId = @shopId
  AND hangHoaId = @hangHoaId
  AND soLuong >= @soLuongDat;
```

Một statement vừa kiểm tra vừa update loại bỏ race window. Affected rows bằng `0` là business conflict.

## Pessimistic locking

`SELECT ... FOR UPDATE` phù hợp khi operation cần đọc nhiều field rồi quyết định và conflict thường xuyên. Transaction phải ngắn, query phải có index và các use case nên lock resource theo cùng thứ tự.

Không dùng pessimistic lock chỉ vì sợ concurrency. Nó tăng waiting, deadlock risk và giảm throughput.

## Deadlock

Deadlock xảy ra khi transaction giữ lock mà transaction khác cần và đồng thời chờ lock theo chiều ngược lại. InnoDB phát hiện cycle và rollback một victim.

Giảm deadlock bằng cách:

- cập nhật resource theo thứ tự nhất quán;
- giữ transaction ngắn;
- thêm index đúng access path;
- giảm range scan;
- không gọi network trong transaction.

Retry deadlock chỉ an toàn khi toàn operation idempotent hoặc có cơ chế chống duplicate side effect.

## Transaction dài và MVCC

Transaction dài giữ snapshot cũ, khiến InnoDB phải giữ row versions lâu hơn và làm purge chậm. Nó cũng kéo dài lock lifetime cho write. Transaction boundary nên bao đúng các database operations cần atomic, không bao thời gian người dùng suy nghĩ hoặc external call.

## Công cụ quan sát

```sql
SHOW ENGINE INNODB STATUS;

SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;
```

Khi debug contention, cần giữ SQL, execution plan, index, isolation level và transaction timeline. Chỉ nhìn câu query cuối đang chờ thường không cho biết transaction nào đã lấy lock trước đó.

## Business case — hai khách đặt món cuối

Tồn kho còn `1`; hai transaction đều plain `SELECT` và cùng thấy snapshot có giá trị `1`. `REPEATABLE READ` không tự biến read-then-write thành atomic business operation.

```text
A SELECT → 1
B SELECT → 1
A tạo đơn thành công
B tạo đơn thành công
```

Atomic conditional update đặt check vào chính write statement. Một transaction update được row; transaction còn lại chờ rồi đánh giá điều kiện trên current state và nhận affected rows bằng `0`.

## Business case — lost update trạng thái

Hai nhân viên đọc cùng `version=4`. Người thứ nhất cập nhật thành version `5`. `UPDATE` của người thứ hai kèm `WHERE version=4` không match row và tạo concurrency conflict. Cơ chế này phù hợp với Aggregate edits ít conflict; nó không tự bảo vệ counter nằm ở row khác.

## Business case — deadlock nhiều món

Đơn A update món `X` rồi `Y`; đơn B update `Y` rồi `X`. Hai transaction giữ lock chéo nhau. Sort `hangHoaId` trước khi update làm lock order nhất quán. Retry chỉ là fallback sau khi operation có idempotency.

## Business case — index làm rộng lock footprint

Query update theo `(tenantId, shopId, trangThai)` nhưng chỉ có index `tenantId`. Engine scan nhiều record hơn, từ đó giữ nhiều record/next-key lock hơn. Execution plan và composite index đúng access path thường giải contention trước khi đổi isolation level.

## Tóm tắt

InnoDB concurrency là tương tác giữa MVCC snapshot, current read, index range và lock lifetime. Chọn optimistic token, atomic update hay pessimistic lock theo invariant và conflict rate, không chọn chỉ theo tên isolation level.
