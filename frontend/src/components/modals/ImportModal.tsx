import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { INPUT_LIMITS } from '../../lib/validation';

export const ImportModal: React.FC = () => {
  const { isImportModalOpen, closeImportModal, showToast, triggerDataReload } = useVault();

  const [source, setSource] = useState<'bitwarden' | '1password' | 'chrome' | 'generic'>('bitwarden');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isImportModalOpen) return null;

  const handleProcessImport = async () => {
    if (!inputText.trim()) {
      showToast('Por favor pega el contenido JSON o CSV a importar.', 'error');
      return;
    }

    setLoading(true);
    try {
      let items: any[] = [];

      if (inputText.trim().startsWith('{') || inputText.trim().startsWith('[')) {
        // Parse as JSON
        const parsed = JSON.parse(inputText);
        if (Array.isArray(parsed)) {
          items = parsed.map(item => ({
            name: item.name || item.title || 'Servicio Importado',
            username: item.username || item.login?.username,
            password: item.password || item.login?.password,
            url: item.url || (item.login?.uris && item.login.uris[0]?.uri),
            notes: item.notes,
            parent_email: item.username && item.username.includes('@') ? item.username : null
          }));
        } else if (parsed.items && Array.isArray(parsed.items)) {
          // Bitwarden export format
          items = parsed.items.map((item: any) => ({
            name: item.name || 'Servicio Bitwarden',
            username: item.login?.username,
            password: item.login?.password,
            url: item.login?.uris && item.login.uris[0]?.uri,
            notes: item.notes,
            parent_email: item.login?.username && item.login.username.includes('@') ? item.login.username : null
          }));
        }
      } else {
        // Parse as CSV (simple comma/semicolon parser)
        const lines = inputText.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 1) {
          const header = lines[0].toLowerCase().split(/[,;]/).map(h => h.trim().replace(/['"]/g, ''));
          const nameIdx = header.findIndex(h => h.includes('name') || h.includes('title') || h.includes('nombre'));
          const userIdx = header.findIndex(h => h.includes('user') || h.includes('login') || h.includes('email'));
          const passIdx = header.findIndex(h => h.includes('password') || h.includes('clave') || h.includes('pass'));
          const urlIdx = header.findIndex(h => h.includes('url') || h.includes('website'));

          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/[,;]/).map(p => p.trim().replace(/^['"]|['"]$/g, ''));
            if (parts.length >= 2) {
              const uName = userIdx !== -1 ? parts[userIdx] : '';
              items.push({
                name: nameIdx !== -1 ? parts[nameIdx] : `Cuenta #${i}`,
                username: uName,
                password: passIdx !== -1 ? parts[passIdx] : '',
                url: urlIdx !== -1 ? parts[urlIdx] : '',
                parent_email: uName && uName.includes('@') ? uName : null
              });
            }
          }
        }
      }

      if (items.length === 0) {
        showToast('No se pudieron detectar registros válidos en los datos ingresados.', 'warning');
        setLoading(false);
        return;
      }

      const res = await api.importBatch(source, items);
      showToast(`¡Éxito! Se importaron ${res.imported_platforms} plataformas atómicamente.`, 'success');
      closeImportModal();
      triggerDataReload();
    } catch (err: any) {
      showToast(`Error al procesar importación: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="relative w-full max-w-xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Upload size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="import-modal-title" className="text-base font-bold text-white tracking-tight truncate">
                Importador Universal de Bóvedas
              </h2>
              <p className="text-xs text-obsidian-muted truncate">
                Importación desde Bitwarden, 1Password, Chrome o CSV
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeImportModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="py-4 space-y-4 text-xs">
          <div>
            <label className="text-obsidian-text font-medium block mb-1.5">Origen de los Datos</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'bitwarden', label: 'Bitwarden JSON' },
                { id: '1password', label: '1Password CSV' },
                { id: 'chrome', label: 'Chrome CSV' },
                { id: 'generic', label: 'Genérico CSV/JSON' },
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSource(src.id as any)}
                  className={`p-2 rounded-xl text-center text-xs font-medium border transition-colors ${
                    source === src.id
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                      : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="import-textarea" className="text-obsidian-text font-medium block mb-1.5">
              Pega aquí el contenido JSON o CSV
            </label>
            <textarea
              id="import-textarea"
              rows={8}
              maxLength={INPUT_LIMITS.IMPORT_PAYLOAD}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pega el contenido exportado aquí..."
              className="w-full p-3 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none"
            />
            <span className="text-[11px] text-obsidian-muted block mt-1">
              El sistema detectará automáticamente los correos padre y cifrará cada credencial y nota con AES-256-GCM.
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closeImportModal}
            className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleProcessImport}
            disabled={loading || !inputText.trim()}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? 'Procesando e Importando...' : 'Iniciar Importación Atómica'}
          </button>
        </div>
      </div>
    </div>
  );
};
