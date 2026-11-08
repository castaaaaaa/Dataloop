import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './lib/auth/AuthContext.tsx';
import { ThemeProvider } from './lib/theme/ThemeContext.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
