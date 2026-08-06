import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App } from './App';
import { Router } from './router';
import './styles.css';
import './authority.css';

const root = document.getElementById('root');
if (root === null) throw new Error('clervo_site_root_missing');

const application = (
  <StrictMode>
    <Router><App /></Router>
  </StrictMode>
);

if (root.hasChildNodes()) hydrateRoot(root, application);
else createRoot(root).render(application);
