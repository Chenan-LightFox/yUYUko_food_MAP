import sqlite3
import re
import time
import os
import pickle
from datetime import datetime
from bs4 import BeautifulSoup
import schedule

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

# ================= 配置区 =================
DB_NAME = "../backend/data.sqlite"
TARGET_URL = "https://qun.qq.com/member.html#gid=871393095"
COOKIE_FILE = "qq_cookies.pkl" # 用于保存登录状态的文件
# ==========================================

def init_db():
    """初始化 SQLite 数据库，如果表不存在则创建"""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS QQWhitelist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            qq TEXT UNIQUE NOT NULL,
            created_time DATETIME NOT NULL
        )
    ''')
    conn.commit()
    return conn

def parse_qq_from_html(html_content):
    """从 HTML 源码中解析出所有 QQ 号"""
    soup = BeautifulSoup(html_content, 'html.parser')
    qq_set = set()
    
    # 查找所有 class 包含 'mb' 且以 'mb[QQ号]' 结尾的 tr 标签
    for tr in soup.find_all('tr', class_=re.compile(r'^mb mb\d+')):
        classes = tr.get('class', [])
        for cls in classes:
            if cls.startswith('mb') and len(cls) > 2:
                qq_num = cls[2:]  
                qq_set.add(qq_num)
                
    return list(qq_set)

def fetch_html_with_selenium():
    """
    使用 Edge 浏览器获取动态页面，并处理自动登录
    """
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 正在启动 Edge 浏览器...")
    
    options = webdriver.EdgeOptions()
    
    driver = webdriver.Edge(options=options)
    
    try:
        # 1. 访问 QQ 基础域名写入 Cookie
        driver.get("https://qun.qq.com/")
        
        # 2. 尝试加载 Cookie
        if os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, "rb") as f:
                cookies = pickle.load(f)
                for cookie in cookies:
                    driver.add_cookie(cookie)
            print("[-] 已加载本地保存的登录状态 (Cookie)。")
        
        # 3. 访问目标网址
        driver.get(TARGET_URL)
        
        # ==========================================
        # 核心修复：基于页面元素的 100% 准确登录检测
        # ==========================================
        try:
            # 尝试寻找页面上的群标题 (id="groupTit")，只等 5 秒
            # 如果能找到，说明已经登录进去了
            WebDriverWait(driver, 5).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, "tbody.list tr.mb")) > 0
            )
            print("[+] 自动登录验证通过！成功获取到群成员数据。")
        except:
            # 5 秒内没找到群标题，说明被登录框拦住了
            print("[!] 检测到未登录或 Cookie 失效。")
            print("[!] 请在弹出的 Edge 浏览器窗口中【扫码登录】...")
            print("[!] 程序将耐心等待，直到检测到您登录成功 (最多等待 5 分钟)...")
            
            try:
                # 死等群标题出现 (最多 300 秒)
                WebDriverWait(driver, 300).until(
                    lambda d: len(d.find_elements(By.ID, "groupTit")) > 0
                )
                print("[+] 登录成功！正在保存登录状态，下次将跳过此步骤...")
                with open(COOKIE_FILE, "wb") as f:
                    pickle.dump(driver.get_cookies(), f)
            except Exception as e:
                print(f"[-] 登录超时或发生异常，结束本次抓取。")
                return None
        # ==========================================

        time.sleep(3) # 缓冲一下，等页面彻底渲染完毕
        
        # 5. 模拟向下滚动，加载所有群成员
        print("[-] 正在向下滚动页面以加载完整名单...")
        last_height = driver.execute_script("return document.body.scrollHeight")
        while True:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5) # 稍微等久一点，防止网速慢导致没刷出来就以为到底了
            
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break 
            last_height = new_height
            
        print("[+] 页面滚动完毕，已加载所有成员。")
        
        # 6. 返回最终 HTML 源码
        return driver.page_source
        
    finally:
        driver.quit()

def sync_to_database(conn, scraped_qqs):
    """同步逻辑与原来保持一致"""
    cursor = conn.cursor()
    cursor.execute("SELECT qq FROM QQWhitelist")
    existing_qqs = set(row[0] for row in cursor.fetchall())
    
    new_qqs = set(scraped_qqs)
    
    if not new_qqs:
        print("警告：本次未抓取到任何 QQ 号，跳过同步。")
        return

    to_add = new_qqs - existing_qqs
    to_delete = existing_qqs - new_qqs
    
    if to_delete:
        cursor.executemany(
            "DELETE FROM QQWhitelist WHERE qq = ?", 
            [(qq,) for qq in to_delete]
        )
        print(f"[-] 删除了 {len(to_delete)} 个已退群记录。")
        
    if to_add:
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.executemany(
            "INSERT INTO QQWhitelist (qq, created_time) VALUES (?, ?)",
            [(qq, current_time) for qq in to_add]
        )
        print(f"[+] 新增了 {len(to_add)} 个新成员记录。")
        
    if not to_add and not to_delete:
        print("[=] 群成员无变化，数据库无需更新。")
        
    conn.commit()

def job():
    """定时任务主流程"""
    try:
        html = fetch_html_with_selenium()
        if html:
            qq_list = parse_qq_from_html(html)
            print(f"[*] 网页解析成功，共发现 {len(qq_list)} 个群成员。")
            
            conn = init_db()
            sync_to_database(conn, qq_list)
            conn.close()
    except Exception as e:
        print(f"[!] 任务执行发生错误: {e}")

if __name__ == "__main__":
    print("=== QQ 群成员自动同步脚本 (Selenium 自动化版) ===")
    print("提示：首次运行将弹出浏览器，请手动完成登录。")
    
    # 立即执行一次
    job()
    
    # 定时任务：每 2 小时运行一次
    schedule.every(2).hours.do(job)
    
    print("\n已进入定时循环模式... 按 Ctrl+C 退出程序")
    while True:
        schedule.run_pending()
        time.sleep(1)