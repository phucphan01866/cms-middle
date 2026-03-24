# Server Middle - README

## 1. Hướng hoạt động của server middle hiện tại

* Các API:

  * Đăng nhập
  * Đăng ký server
  * Thiết bị
    → Server middle sẽ bắt request và điều chuyển tới CMS nếu có thể, nếu không cũng không sao.

* API gửi event từ VMS:
  → Server middle sẽ bắt và lưu log vào thư mục local.

---

## 2. Các bước chạy server

```bash
npm i
npm dev
```

---

## 3. Cấu hình file `.env`

```
THIS_PORT=5050          // Cổng để server middle chạy
BE_CMS_IP=192.168.1.148 // IP máy server BE CMS đang chạy
BE_CMS_PORT=5000        // Cổng server BE CMS đang chạy
```

---

## 4. Kết nối VMS - Server Middle

1. Mở Command Prompt (cmd) trên Windows
2. Chạy lệnh:

   ```bash
   ipconfig
   ```
3. Lấy địa chỉ IPv4 của máy đang chạy server middle
4. Dán vào VMS theo format:

```
<IPv4>:<THIS_PORT>
```

**Ví dụ:**

```
192.168.1.148:5050
```

5. Nhấn **connect**
