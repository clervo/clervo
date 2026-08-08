import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App } from './App';
import { Router } from './router';
/*
 * Import order is the cascade order. Tokens define the variables the rest of
 * the sheets read; base sets the document defaults; the legacy page styles are
 * next so the rebuilt shell, control, and mark layers win on any conflict.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles.css';
import './styles/controls.css';
import './styles/mark.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/pages.css';
import './styles/b12/start-shell.css';
import './styles/b12/product-catalog-hardening.css';
import './styles/b12/operation-contract-hardening.css';

const root = document.getElementById('root');
if (root === null) throw new Error('clervo_site_root_missing');

const normalizePath = (value: string) => value === '/' ? '/' : value.replace(/\/+$/u, '');
const prerenderPath = root.dataset.prerenderPath;
const routeMatchesPrerender = prerenderPath === undefined
  || normalizePath(prerenderPath) === normalizePath(location.pathname);

const application = (
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
);

if (root.hasChildNodes() && routeMatchesPrerender) hydrateRoot(root, application);
else {
  root.replaceChildren();
  createRoot(root).render(application);
}
