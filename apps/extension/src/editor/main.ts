// 編輯器佔位頁。真正的 React 編輯器在 P1-T016；橋接請求要包成 relay/messages.ts 的形狀，
// 經 chrome.runtime.sendMessage 交給 service worker 轉送（頁面不直接連 Native Messaging，ADR-0003）。
document.body.dataset['rolecraftEditor'] = 'placeholder';
