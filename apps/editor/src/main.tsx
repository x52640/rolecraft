// 編輯器頁入口（擴充功能頁 chrome-extension://<id>/editor/index.html，ADR-0003）。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
// 給 e2e 確認 React 已掛載。
document.body.dataset['rolecraftEditor'] = 'ready';
