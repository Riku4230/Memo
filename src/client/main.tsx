import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import '@fontsource/line-seed-jp/400.css';
import '@fontsource/line-seed-jp/700.css';
import './styles.css';
import { startUpdateWatcher } from './lib/update';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
// 新しい版が公開されたら、画面に戻ってきたときに読み直す
if (import.meta.env.PROD) startUpdateWatcher();
