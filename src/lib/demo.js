/**
 * Modo demonstração (portfólio).
 *
 * Ligado por padrão: os dados ficam no navegador de cada visitante
 * (context/DemoAppStore.jsx), com login de um clique e tutorial.
 * Para usar o Supabase de verdade, defina VITE_DEMO=false no build.
 */
export const DEMO = import.meta.env.VITE_DEMO !== 'false'

/** Conta de acesso ao painel na demonstração (aparece na tela de login) */
export const DEMO_ACCOUNT = { email: 'psicologa@consultorio.demo', password: 'psico123' }

/** Senha de criptografia dos prontuários e chave de recuperação da demonstração */
export const DEMO_VAULT = { passphrase: 'prontuario123', recoveryKey: 'DEMO-2026-PSIC-ABCD' }
