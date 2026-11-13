import React, { useEffect, useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { INPUT_LIMITS } from '../../lib/validation';

function detectCsvDelimiter(text: string): ',' | ';' {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break;
      if (ch === ',') commas++;
      else if (ch === ';') semicolons++;
    }
  }
  return semicolons > commas ? ';' : ',';
}

function parseCsvRows(text: string): string[][] {
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }
  return rows;
}

export const ImportModal: React.FC = () => {
  const { isImportModalOpen, closeImportModal, showToast, triggerDataReload } = useVault();

  const [source, setSource] = useState<'bitwarden' | '1password' | 'chrome' | 'generic'>('bitwarden');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isImportModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeImportModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImportModalOpen, closeImportModal]);

  if (!isImportModalOpen) return null;

  const handleProcessImport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
        // Parse as RFC-4180 CSV
        const rows = parseCsvRows(inputText);
        if (rows.length > 1) {
          const header = rows[0].map((h) => h.toLowerCase());
          const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('title') || h.includes('nombre'));
          const userIdx = header.findIndex((h) => h.includes('user') || h.includes('login') || h.includes('email'));
          const passIdx = header.findIndex((h) => h.includes('password') || h.includes('clave') || h.includes('pass'));
          const urlIdx = header.findIndex((h) => h.includes('url') || h.includes('website'));
          const notesIdx = header.findIndex((h) => h.includes('note') || h.includes('nota'));

          for (let i = 1; i < rows.length; i++) {
            const parts = rows[i];
            if (parts.length >= 2) {
              const uName = userIdx !== -1 ? (parts[userIdx] || '') : '';
              items.push({
                name: (nameIdx !== -1 && parts[nameIdx]) ? parts[nameIdx] : `Cuenta #${i}`,
                username: uName,
                password: passIdx !== -1 ? (parts[passIdx] || '') : '',
                url: urlIdx !== -1 ? (parts[urlIdx] || '') : '',
                notes: notesIdx !== -1 ? (parts[notesIdx] || undefined) : undefined,
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
      showToast(`Importación completada: ${res.imported_platforms} plataformas guardadas atómicamente.`, 'success');
      closeImportModal();
      triggerDataReload();
    } catch (err: any) {
      showToast(`Error al procesar importación: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={closeImportModal}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="relative w-full max-w-xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-4 sm:p-6 max-h-[90dvh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Upload size={20} aria-hidden="true" />
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
            aria-label="Cerrar importador"
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface flex-shrink-0"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleProcessImport} className="flex-1 min-h-0 flex flex-col">
          <div className="py-4 space-y-4 text-xs">
            <div>
              <span className="text-obsidian-text font-medium block mb-1.5">Origen de los Datos</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Origen de los datos">
                {[
                  { id: 'bitwarden', label: 'Bitwarden JSON' },
                  { id: '1password', label: '1Password CSV' },
                  { id: 'chrome', label: 'Chrome CSV' },
                  { id: 'generic', label: 'Genérico CSV/JSON' },
                ].map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    aria-pressed={source === src.id}
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
                required
                maxLength={INPUT_LIMITS.IMPORT_PAYLOAD}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Pega el contenido exportado aquí..."
                className="w-full p-3 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none"
              />
              <span className="text-[11px] text-obsidian-muted block mt-1">
                Tus correos y datos privados se guardarán protegidos.
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={closeImportModal}
              className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              {loading ? 'Procesando e Importando...' : 'Iniciar Importación Atómica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

