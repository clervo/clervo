import { renderToString } from 'react-dom/server';

import { App } from './App';
import { Router } from './router';

export function render(url: string): string {
  return renderToString(
    <Router initialUrl={url}>
      <App />
    </Router>,
  );
}
