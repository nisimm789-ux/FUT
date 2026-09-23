import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { uiStyles } from '@fc/ui';
import { App } from './App';
import './style.css';

const style = document.createElement('style');
style.textContent = uiStyles;
document.head.append(style);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
