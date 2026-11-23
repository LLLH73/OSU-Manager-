import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/quicksand/400.css';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/exo-2/500.css';
import '@fontsource/exo-2/600.css';
import '@fontsource/exo-2/700.css';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/500.css';
import '@fontsource/noto-sans-sc/600.css';
import '@fontsource/noto-sans-sc/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import App from './App';
import { OverlayApp } from './components/OverlayApp';
import './index.css';

const isOverlayMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mode') === 'overlay';

if (isOverlayMode) {
  document.documentElement.dataset.overlay = 'true';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOverlayMode ? <OverlayApp /> : <App />}
  </StrictMode>,
);
