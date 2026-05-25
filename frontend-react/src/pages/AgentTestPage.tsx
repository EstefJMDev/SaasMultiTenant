import React from 'react';
import { AgentChat } from '../components/AgentChat';

/**
 * Test page for AI Agent Chat
 * Shows the agent chat widget in a sidebar layout
 */
export function AgentTestPage() {
  return (
    <div style={{ display: 'flex', height: '100vh', gap: '16px', padding: '16px', backgroundColor: '#f5f5f5' }}>
      {/* Main content area */}
      <main style={{
        flex: 1,
        background: '#fff',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'auto'
      }}>
        <h1>🤖 Prueba del Asistente IA</h1>
        <p style={{ fontSize: '16px', color: '#666', lineHeight: '1.6' }}>
          Prueba a escribir solicitudes como:
        </p>
        <ul style={{ fontSize: '15px', color: '#555' }}>
          <li>🔍 "Hola, ¿qué puedes hacer?"</li>
          <li>📊 "Dame un resumen de mis datos"</li>
          <li>👥 "Quién está activo hoy?"</li>
          <li>💰 "Mi presupuesto"</li>
          <li>📄 "Listar documentos"</li>
        </ul>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#f0f7ff',
          borderRadius: '8px',
          borderLeft: '4px solid #0066ff'
        }}>
          <h3 style={{ marginTop: 0, color: '#0066ff' }}>💡 Información</h3>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            ✅ Agent System corriendo en http://localhost:3000
          </p>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            ✅ Ollama disponible en 192.168.1.171:11434
          </p>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            ✅ Modelo: qwen2.5-coder:7b
          </p>
        </div>
      </main>

      {/* Agent Chat Sidebar */}
      <aside style={{
        width: '380px',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <AgentChat
          userId="test-user"
          tenantId="1"
        />
      </aside>
    </div>
  );
}
