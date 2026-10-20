import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Falha ao carregar o Folha:', error); }
  render() {
    if (this.state.error) return <main style={{ maxWidth: 620, margin: '12vh auto', padding: 24, fontFamily: 'sans-serif', color: '#18231f' }}><h1>Não foi possível abrir o Folha</h1><p>Recarregue a página. Se o problema continuar, confira a configuração do Supabase e os dados salvos neste navegador.</p><pre style={{ whiteSpace: 'pre-wrap', color: '#75817b' }}>{this.state.error.message}</pre></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
