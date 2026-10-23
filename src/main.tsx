import '@fontsource-variable/archivo/wdth.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getState } from './store';
import './styles.css';

document.documentElement.lang = getState().uiLang;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
