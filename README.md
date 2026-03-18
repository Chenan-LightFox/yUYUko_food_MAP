# yUYUko_food_MAP
This is Fanlian Map (?)

Now under construction.

---

> 🚀 **初次运行？** 请先阅读 [GETTING_STARTED.md](GETTING_STARTED.md)

---

**管理员后台权限相关**

管理员权限分为以下几点：

    1. 管理所有用户

    2. 管理一般用户（非管理员）

    3. 管理地图标记点

    4. 管理邀请码

    5. 管理评论

管理员分为以下几个级别：

    - 幽幽子（YUYUKO）Y：拥有以上所有权限

    - 妖梦（YOUMU）M：拥有以上权限2-5

    - 小町（KOMACHI）K：拥有以上权限2和5

目前已经预设了一个管理员账号：
- 用户名：dev
- 密码：12345679
- 权限等级：YUYUKO

以及一个普通用户账号：
- 用户名：dev1
- 密码：12341234
- 权限等级：普通用户

以上预设账号已在`./backend/scripts/add_user.js`中创建，运行`npm run add-user`即可添加到数据库中

---

**TODO list:**
- admins.js: 完成各级权限具体操作，添加操作日志模块
- adminAuth.js: 完善管理员鉴权功能
- AdminDashboard.js: 挂载各等级管理面板路由
- Map.jsx: 添加获取用户当前位置并添加标记点的功能
- Map.jsx: 修改为自己的Marker图标，并在信息弹窗上添加关闭按钮及管理按钮
- new!: 美化界面
