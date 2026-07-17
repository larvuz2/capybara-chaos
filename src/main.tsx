import { createRoot } from 'react-dom/client'
import '@fontsource/baloo-2/400.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/baloo-2/800.css'
import './index.css'
import App from './App.tsx'

// NOTE: no <StrictMode> — it double-runs canvas effects (see react-dev.md).
createRoot(document.getElementById('root')!).render(<App />)
