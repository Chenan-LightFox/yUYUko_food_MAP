# yUYUko_food_MAP
This is Fanlian Map (?)

Now under construction.

---

> 🚀 **初次运行？** 请先阅读 [GETTING_STARTED.md](GETTING_STARTED.md)

---

GPT 给我拉了这个先慢慢看吧（

# 一、整体系统架构建议

一般建议拆成三层：

```
前端（地图展示 + 交互）
后端（业务逻辑 + 权限 + 数据处理）
数据库（存储地点与评论等数据）
```

### 推荐技术栈（比较适合学生项目+可扩展）

#### 前端

* React
* 高德 JS API（核心地图）

#### 后端

* Node.js + Express

#### 数据库

* MySQL / PostgreSQL（结构化数据）
* 如果评论很多可考虑 MongoDB（可选）

---

# 二、核心功能模块设计

## ⭐ 1. 地点管理模块

### 需要支持功能

#### 添加地点

用户可以：

* 在地图点击选点
* 分类（火锅、烧烤、甜品等）
* 分级（推荐、避雷）
* _可选：上传图片_
* **详细描述**

👉 技术实现

* 高德地图点击事件
* 获取经纬度
* 提交到后端

#### 删除地点

仅添加者及管理员可删除。

#### 评论系统

评论建议单独表结构：

```
Comment
- id
- place_id
- user_id
- content
- rating
- time
```

## ⭐ 2. 查询与搜索模块

### ✔ 精确搜索

实现方式：

* 方案1：sql模糊查询
* 方案2：ElasticSearch _（后期维护考虑）_

### ✔ 范围搜索（地图项目重点）

---

# 三、数据库设计建议

## 用户表

```
User
- id
- username
- password
- avatar
```

## 地点表

```
Place
- id
- name
- description
- latitude
- longitude
- category
- creator_id
- created_time
```

## 评论表

```
Comment
- id
- place_id
- user_id
- content
- rating
- time
```

---

# 四、地图前端关键实现点

## 📍 加载地点标记

流程：

```
页面加载
→ 请求后端所有地点
→ 循环创建 Marker
```

## 📍 点击 Marker 展示信息

考虑使用`InfoWindow`展示：

* 店名
* 评分
* 评论
* 查看详情按钮

---

# 五、推荐附加功能

### ⭐ 用户系统

登录注册
JWT 鉴权

### ⭐ 收藏功能

用户可以收藏餐厅

### ⭐ 分类筛选

比如：

* 奶茶
* 日料
* 小吃

### ⭐ 图片上传

建议用：

* 阿里云OSS
* 或本地存储
