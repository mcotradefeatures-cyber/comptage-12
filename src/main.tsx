
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Aggressive error silencer for the fetch property error
if (typeof window !== 'undefined') {
  const silenceFetchError = (event: ErrorEvent | PromiseRejectionEvent) => {
    const message = 'message' in event ? event.message : (event as any).reason?.message;
    if (typeof message === 'string' && message.includes('property fetch of #<Window>')) {
      if ('preventDefault' in event) event.preventDefault();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      return true;
    }
    return false;
  };

  window.addEventListener('error', silenceFetchError, true);
  window.addEventListener('unhandledrejection', silenceFetchError as any, true);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
