import { StrictMode, Suspense, lazy, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const App = lazy(() => import('./App.tsx'));
const TelegramMiniApp = lazy(() => import('./components/TelegramMiniApp.tsx'));

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && (String(event.reason).includes('Failed to fetch') || event.reason.message?.includes('Failed to fetch'))) {
    event.preventDefault();
  }
});

function checkIsMiniAppRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.toLowerCase();
  const q = new URLSearchParams(window.location.search);
  return (
    p.startsWith('/miniapp') ||
    p.startsWith('/shop') ||
    p.startsWith('/tg-shop') ||
    q.get('miniapp') === '1' ||
    q.get('shop') === '1'
  );
}

function RootRouter() {
  const [isMiniApp, setIsMiniApp] = useState<boolean>(checkIsMiniAppRoute);

  useEffect(() => {
    const onPopState = () => setIsMiniApp(checkIsMiniAppRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (isMiniApp) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-white flex items-center justify-center text-slate-700 font-bold text-xs">
            🛍️ កំពុងបើកហាងខោអាវ...
          </div>
        }
      >
        <TelegramMiniApp
          onBackToPos={() => {
            window.history.pushState({}, '', '/');
            setIsMiniApp(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030712] flex items-center justify-center text-cyan-400 font-bold text-xs">
          ⚡ កំពុងបើកប្រព័ន្ធ KARI OS...
        </div>
      }
    >
      <App />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
);


