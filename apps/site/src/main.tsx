import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App } from './App';
import { Router } from './router';
import './styles.css';

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
