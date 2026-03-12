import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // 確保這行指向你的 App.jsx
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)