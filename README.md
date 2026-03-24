Hướng hoạt động của server middle hiện tại: 
+ Các API đăng nhập, đăng ký server, thiết bị,... -> Server middle bắt và điều chuyển tới CMS nếu có thể, nếu không cũng không sao.
+ API gửi event từ VMS: Server middle bắt và lưu log vào thư mục local.
Các bước chạy server: npm i -> npm dev
Config file .env:
+ THIS_PORT = 5050 //Cổng để này chạy
+ BE_CMS_IP = 192.168.1.148 //IP máy server BE CMS đang chạy
+ BE_CMS_PORT = 5000 //Cổng server BE CMS đang chạy
Kết nối VMS - server middle:
+ window -> cmd -> ipconfig -> lấy ipv4 máy chạy server middle -> dán vào VMS + THIS_PORT (VD: 192.168.1.148:5050) -> nhấn connect
