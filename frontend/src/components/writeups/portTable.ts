export const MAX_PORT_TABLE_INPUT_LENGTH = 2000;
export const MAX_PORT_TABLE_ROWS = 100;

function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, '\\`').replace(/[\r\n]+/g, ' ');
}

/** Parse a bounded, comma-separated list: port/protocol service [version] [status]. */
export function createPortTableMarkdown(input: string): string {
  if (input.length > MAX_PORT_TABLE_INPUT_LENGTH) {
    throw new Error(`La lista no puede superar ${MAX_PORT_TABLE_INPUT_LENGTH} caracteres.`);
  }

  const entries = input.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) {
    throw new Error('Escribe al menos un puerto y su servicio.');
  }
  if (entries.length > MAX_PORT_TABLE_ROWS) {
    throw new Error(`Puedes incluir hasta ${MAX_PORT_TABLE_ROWS} puertos por tabla.`);
  }

  const rows = entries.map((entry, index) => {
    const parts = entry.split(/\s+/);
    const portMatch = parts[0]?.match(/^(\d{1,5})\/(tcp|udp)$/i);
    const portNumber = portMatch ? Number(portMatch[1]) : NaN;
    const service = parts[1] || '';

    if (!portMatch || portNumber < 1 || portNumber > 65535) {
      throw new Error(`Revisa la entrada ${index + 1}: usa un puerto entre 1 y 65535 seguido de /tcp o /udp.`);
    }
    if (!/^[a-zA-Z0-9_.+-]{1,64}$/.test(service)) {
      throw new Error(`Revisa la entrada ${index + 1}: indica el servicio después del puerto.`);
    }

    const version = parts[2] || 'Sin especificar';
    const status = parts.slice(3).join(' ') || 'Sin especificar';
    const protocol = portMatch[2].toLowerCase();
    return `| \`${portNumber}/${protocol}\` | ${escapeCell(service)} | ${escapeCell(version)} | ${escapeCell(status)} |`;
  });

  return `\n| Puerto / protocolo | Servicio | Versión o dato | Estado |\n|---|---|---|---|\n${rows.join('\n')}\n`;
}
