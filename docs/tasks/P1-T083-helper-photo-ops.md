---
id: P1-T083
phase: 1
status: done
depends_on: ["P1-T082", "P1-T079"]
specs: ["resume-output.md", "bridge.md"]
track: helper
primary_repo: rolecraft
write_paths: ["apps/helper/src/handlers/photo/", "apps/helper/src/main.ts", "apps/helper/src/main.test.ts", "packages/sources/src/picker/", "packages/sources/src/index.ts", "packages/pdf-export/src/photo/", "packages/pdf-export/src/index.ts"]
contract_change: none
expected_commit: "feat(P1-T083): helper：照片選取、重新編碼去中繼資料，photo.pick／get／remove"
---

# helper：照片選取與處理、photo.* 操作

## 目標

使用者選本機照片，helper 重新編碼成 JPEG、縮到最長邊 1,200 px、去掉所有中繼資料後設為目前照片；提供查詢與刪除。

## 範圍

### 包含

- 系統選取器：只限 JPEG／PNG、10 MB 以下（比照 PDF 選取器）；請求沒有路徑
- 影像處理：解碼 → 重新編碼 JPEG、最長邊 1,200 px、去掉 EXIF（GPS、裝置）等全部中繼資料；解不開就拒絕；必須在選取器處理餘裕內完成，超過放棄、不寫入。做法優先用匯出已在用的 Chrome（puppeteer-core）重繪，放 `packages/pdf-export/src/photo/`；要新增 npm 相依先停下回報
- `photo.pick`：選定且處理成功即生效（更換走 P1-T082 的同一交易）；回照片資訊與縮圖；取消回 cancelled，已有選取視窗開著回 busy
- `photo.get`（回應低於 1 MiB）、`photo.remove`（套 D19）
- `main.ts` 組裝照片服務

### 不包含

- 編輯器照片區塊（P1-T085）
- 匯出印照片（P1-T084）
- 從網頁抓照片

## 工作區與 Context

### 必讀入口

- `plan.md` D28（其餘只看相關 D 編號）
- `docs/README.md`
- `docs/specs/resume-output.md`「照片」
- `docs/specs/bridge.md`（photo 列、選取器逾時）
- P1-T082 完成結果；`packages/sources/src/picker/pdf-picker.ts`、`apps/helper/src/handlers/import/pick-pdf.ts`、`packages/pdf-export/src/render/`

### 不應載入

- `Spec.md`、`docs/spec-discussions/`（歷史來源；web-resume-import 的權威內容已轉入 `docs/specs/`，見 plan.md D28）
- 上面沒列的 spec 與其他 Task

### 驗證命令

```bash
npm run verify
```

## 實作要求

- 高風險（個資：照片中繼資料（GPS、裝置）必須去除；照片不得進任何提示）：收官前跑對抗驗證（E3，上限 4 個 agent），再跑 codex review
- write_paths 含 `packages/pdf-export/src/index.ts`，與 P1-T084 同時跑時 P1-T084 不得改該檔
- 遵守 `docs/specs/architecture.md`（單檔 300 行、相依方向）；變更只在 write_paths 內，超出就停下回報
- 測試資料一律合成、去識別化；不讀擁有者真實資料；測試不呼叫真實 CLI

## 驗證

### 自動驗證

- 帶 EXIF／GPS 的合成 JPEG 與 PNG：存下的結果沒有任何中繼資料、最長邊不超過 1,200 px
- 超過 10 MB、非 JPEG／PNG、解不開被拒；處理逾時不寫入
- 取消不變動；`photo.get` 回應低於 1 MiB

### 手動驗證

- 擁有者或協調者用 `RUN_PICKER=1` 真實選取器選一張照片一次

## 完成定義

- [ ] 「包含」各項完成
- [ ] `npm run verify` 綠
- [ ] 變更全在 write_paths 內
- [ ] 中斷／接手紀錄與完成結果已回填

## 中斷／接手紀錄

- 最後完成：2026-10-12 主體 commit 已併入 main；codex review 無發現；對抗驗證屬實 1 項＋小瑕疵 1 項已修（`fix(P1-T083)` commit）
- 已通過驗證：`npm run verify` 綠（Vitest 4056 通過、19 略過）；`RUN_CHROME=1` 照片測試 27 案例本機通過（含真實 Chrome 夾帶假 SOF 4 案例）
- 下一步：已收官（2026-10-12 協調者：審查屬實項皆已修，最後一輪 codex review 無發現；main `npm run verify` 綠）
- Blocker：無

## 完成結果

- `packages/sources/src/picker/photo-picker.ts`：`createMacPhotoPicker`、`PHOTO_SCRIPT`（寫死 `of type {"public.jpeg", "public.png"}`）、`readPickedPhoto`（副檔名 .jpg／.jpeg／.png＋檔頭、10 MB 上限 `PHOTO_SOURCE_MAX_BYTES`），只回內容、不回檔名或路徑；`PickerFailure` 加 `not_image`。共用讀檔抽到 `read-picked.ts`（`readPickedFile`、`parseSingleFileOutput`），`pdf-picker.ts` 改用、行為不變
- `packages/pdf-export/src/photo/`：`source.ts`（`inspectPhotoSource`：看檔頭認 JPEG／PNG、讀尺寸，像素上限 `PHOTO_SOURCE_MAX_PIXELS`＝8,000 萬防解壓炸彈）；`render.ts`（`createChromePhotoRenderer`：puppeteer-core 開本機 Chrome，只允許 data:，canvas 白底重繪成 JPEG 品質 0.9、最長邊 1,200，另出 320 px 縮圖；中止時關瀏覽器）；`jpeg.ts`（`inspectJpeg`、`stripJpegMetadata`、`metadataProblems`：純函式段落解析，只留 SOI／DQT／SOFn／DHT／DRI／SOS／EOI 與最小 JFIF，丟掉全部 APPn、COM、EOI 後資料，不認得的段落拒絕）；`process.ts`（`createPhotoProcessor`：`process`／`thumbnail`，Chrome 輸出後一律再清除一次並驗證「沒有中繼資料、尺寸相符、最長邊 ≤ 1,200」，不符就拒絕；`withDeadline` 逾時中止）；`errors.ts`（`PhotoProcessError`）。未新增 npm 相依
- `apps/helper/src/handlers/photo/photo-service.ts`：`createPhotoService`。`pick`：busy 旗標 → 選取器 → 處理（時限＝min(45 秒, 選取器客戶端逾時減 10 秒餘裕的剩餘時間)）→ 處理完再檢查期限，超過就放棄 → `replacePhoto`（P1-T082，同一交易刪舊加新、套 D19）；`get`：縮圖記憶體快取，重啟後存下的照片 ≤ 256 KiB 直接當縮圖，否則用 Chrome 重產（20 秒）；`remove`：`removePhoto`（D19）。`service.ts` 的 `PhotoPickOutcome` 加 `failed`，`pick.ts` 把它轉成 `invalid_request`（非 JPEG／PNG、超過 10 MB、解不開）或 `internal_error`（逾時、找不到 Chrome、處理失敗），一律沒有寫入
- `apps/helper/src/main.ts`：`NativePickers.photo`、`nativePickers` 接 `createMacPhotoPicker`；`createServices` 第 5 參數 `photoProcessor`（只供測試替換，預設 `createPhotoProcessor()`）；有資料區才接照片服務，沒有照片選取器只少 `photo.pick`
- 新測試：`pdf-export/src/photo/jpeg.test.ts`（7）、`process.test.ts`（9，假重繪器故意輸出帶 EXIF／GPS／XMP／ICC／IPTC／COM 的 JPEG）、`process.chrome.test.ts`（2，`RUN_CHROME=1`：合成 PNG 帶 tEXt／eXIf、真 JPEG 塞回 EXIF／GPS）、`sources/src/picker/photo-picker.test.ts`（6）、`helper/src/handlers/photo/photo-service.test.ts`（11，從資料庫讀回存下的照片驗證沒有中繼資料與 GPS／裝置字樣；取消、busy、拒絕、逾時後晚到不寫入、超過期限不寫入、更換、刪除、重啟重產縮圖、經 dispatch 的 photo.get 回應 < 1 MiB）、`main.test.ts` 加 1 案例。verify 不開真實選取器、不開 Chrome
- 保守選擇：(1) 不只信 Chrome：重繪後自己再清除＋驗證，任何殘留就拒絕；(2) 連帶內嵌縮圖的 JFIF 與 ICC（APP2）也丟掉（色彩以 sRGB 為準）；(3) 原始照片像素上限 8,000 萬；(4) 失敗訊息是固定文字，不含路徑或內容；(5) 處理完已過期限也不寫入（客戶端可能已放棄）
- 殘餘：(1) busy 只在照片選取器之間互斥，跟 `import.pick_pdf`、`sources.pick_folders` 的選取視窗不共用旗標（各自既有實作如此，改要動 write_paths 外）；(2) 縮圖不存資料庫（P1-T082 未存），重啟後第一次 `photo.get` 對大於 256 KiB 的照片會開一次 Chrome（20 秒上限，小於一般逾時 30 秒）；(3) `RUN_CHROME=1` 只在本機跑過一次，verify 不跑；(4) 真實選取器手動驗證待做
- 規格落差：resume-output 說「解碼與重新編碼必須在選取器的處理餘裕內完成」，但客戶端逾時從送出算起、對話框本身最多 5 分鐘，helper 不知道送出時間；以「收到請求起算選取器逾時減 10 秒」當期限，處理上限 45 秒（< 60 秒餘裕）
- 對抗審查修正（`fix(P1-T083)`）：(1) `source.ts` `jpegSize` 把不帶長度的標記（RST0–7、TEM）當帶長度段落往後跳，可在跳到處藏假 16×16 SOF 讓檢查通過、Chrome 實際解超過上限的巨圖。改為這些標記只前進 2 位元組，走到 SOS 為止；第二個 SOF、不認得的標記、SOS 前沒有 SOF、結構截斷一律拒絕。(2) 第二道防線：`RenderRequest` 加 `expectedWidth`／`expectedHeight`／`maxPixels`，Chrome 頁面在 `img.onload` 後、`decode()` 前比對實際尺寸（允許 EXIF 方向轉 90 度）與上限，超過回 `too_large`、不符回 `undecodable`；`thumbnail()` 用 `inspectJpeg` 讀已存照片尺寸。(3) `photo-service.ts` `thumbnailOf`：重產途中照片被更換／刪除時不寫快取（寫前比對目前照片 ID），避免舊縮圖蓋回。新測試：`photo/source.test.ts`（5）、`photo/smuggle.chrome.test.ts`（4，`RUN_CHROME=1`：用 Chrome 做 9000×9000 真 JPEG 夾帶假 SOF，兩道防線各自擋下；上限內夾帶檔處理成真實尺寸）、`photo-service.test.ts` 加 1 案例；三者都先重現失敗再修
- 殘餘補充：`img.onload` 時 Chrome 是否已完整解碼未查證（第一道防線先擋，第二道是縱深防禦）
- codex 複審修正（`test(P1-T083)`）：原夾帶 fixture 在真 JPEG 大於舊解析器跳躍距離時，假 SOF 不在落點，真實 Chrome 測試沒重現繞過。`jpeg.test-helpers.ts` `smuggleFakeSof` 改為 RST／TEM 後接 APP1 載體段，假 SOF 放在 payload 裡舊邏輯的實際落點（位移 65509；APP15 落點太遠、超過段落長度上限放不下），與真 JPEG 大小無關；加 `legacyJpegSize`（修正前 `jpegSize` 原樣副本，只供測試）。`source.test.ts` 與 `smuggle.chrome.test.ts` 先斷言舊邏輯讀到假尺寸（fixture 有效），再驗新程式兩道防線都擋；真實 Chrome 對同一夾帶檔解出 900×1200 真實尺寸，證明修正前可被繞過
