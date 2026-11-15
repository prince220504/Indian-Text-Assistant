import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'     // NEW
import './index.css'
import App from './App.jsx'

// scroll-reveal start states only apply once JS is running, so the page never ships blank
document.documentElement.classList.add('js')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* provides the current URL to everything below it.
        <Routes>, <Route>, <Link> all read from here -- outside it they throw. */}
    <BrowserRouter>
        <App />
    </BrowserRouter>
  </StrictMode>,
)
