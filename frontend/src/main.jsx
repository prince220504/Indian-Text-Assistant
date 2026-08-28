import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'     // NEW
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* provides the current URL to everything below it.
        <Routes>, <Route>, <Link> all read from here -- outside it they throw. */}
    <BrowserRouter>
        <App />
    </BrowserRouter>
  </StrictMode>,
)
