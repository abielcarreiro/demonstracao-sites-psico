/**
 * Rotas da aplicação (HashRouter: funciona até abrindo o HTML direto, sem servidor).
 *   /                        → Página pública com agendamento
 *   /admin                   → Visão geral (protegida)
 *   /admin/agenda            → Calendário Dia / Semana / Mês
 *   /admin/pacientes         → CRM de pacientes
 *   /admin/pacientes/:id     → Prontuário
 *   /admin/financeiro        → Controle financeiro
 *   /admin/configuracoes     → Expediente, serviços, bloqueios
 */
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppStoreProvider } from './context/AppStore'
import { DemoAppStoreProvider } from './context/DemoAppStore'
import { ToastProvider } from './components/ui'
import DemoBar from './components/demo/DemoBar'
import { DEMO } from './lib/demo'
import BookingPage from './pages/BookingPage'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import CalendarView from './pages/admin/CalendarView'
import PatientList from './pages/admin/PatientList'
import PatientProfile from './pages/admin/PatientProfile'
import Financials from './pages/admin/Financials'
import Settings from './pages/admin/Settings'

// Demonstração: dados no navegador do visitante; produção (VITE_DEMO=false): Supabase
const StoreProvider = DEMO ? DemoAppStoreProvider : AppStoreProvider

export default function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<BookingPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="agenda" element={<CalendarView />} />
              <Route path="pacientes" element={<PatientList />} />
              <Route path="pacientes/:id" element={<PatientProfile />} />
              <Route path="financeiro" element={<Financials />} />
              <Route path="configuracoes" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {DEMO && <DemoBar />}
        </HashRouter>
      </StoreProvider>
    </ToastProvider>
  )
}
