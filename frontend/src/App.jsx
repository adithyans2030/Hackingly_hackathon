import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Landing from './pages/Landing.jsx'
import Verify from './pages/Verify.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CaseDetail from './pages/CaseDetail.jsx'
import Metrics from './pages/Metrics.jsx'
import Demo from './pages/Demo.jsx'
import NotFound from './pages/NotFound.jsx'
import ToastProvider from './components/ToastProvider.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/:vid" element={<Dashboard />} />
          <Route path="/case/:id" element={<CaseDetail />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
