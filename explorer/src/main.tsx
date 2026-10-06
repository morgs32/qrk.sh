import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ThemeProvider } from './theme';
import './style.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing Explorer root');
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
