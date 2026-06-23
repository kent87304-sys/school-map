# 盛田教研｜國中落點地圖

這是一個可部署到 GitHub Pages 的靜態網站，用地圖呈現台中高中職落點資料。

## 本機預覽

```bash
python3 server.py
```

開啟：

```text
http://127.0.0.1:5173/
```

本機使用 `server.py` 時，表格編輯儲存會寫回 `data/schools.json`。

## 部署到 GitHub Pages

1. 在 GitHub 建立一個新的 repository。
2. 將這個 `school-map` 資料夾推上 GitHub。
3. 到 repository 的 `Settings` → `Pages`。
4. `Build and deployment` 選擇 `Deploy from a branch`。
5. Branch 選 `main`，資料夾選 `/root`，按 `Save`。
6. 等 GitHub Pages 部署完成後，網站會出現在：

```text
https://你的帳號.github.io/你的-repository-名稱/
```

## GitHub Pages 注意事項

GitHub Pages 只能提供靜態網站，不能執行 `server.py`，所以：

- 地圖、搜尋、學校資訊、密碼解鎖、表格編輯畫面都可以使用。
- 在 GitHub Pages 上編輯後，資料會儲存在目前瀏覽器，不會直接寫回 GitHub 上的 `data/schools.json`。
- 若要讓所有人打開都看到更新後的資料，需要把修改後的 `data/schools.json` 重新提交到 GitHub。

## 主要檔案

- `index.html`：網站頁面
- `styles.css`：版面與配色
- `app.js`：地圖、搜尋、資料顯示與編輯
- `data/schools.json`：學校與成績資料
- `data/taichung-boundary.json`：台中市邊界遮罩
- `assets/logo-avatar.png`：盛田教研 LOGO
- `server.py`：本機預覽與本機儲存用伺服器
