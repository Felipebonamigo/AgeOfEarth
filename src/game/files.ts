// Exportar/importar texto como arquivo: usa a ponte do Electron quando existe, senão download/upload do navegador.
interface DesktopBridge { saveFile?: (name: string, content: string) => Promise<boolean>; openFile?: () => Promise<string | null>; achievement?: (id: string) => Promise<boolean>; steamName?: () => Promise<string | null> }
export function desktop(): DesktopBridge | null { return (window as unknown as { desktop?: DesktopBridge }).desktop ?? null; }

export async function exportText(name: string, content: string): Promise<boolean> {
  const d = desktop();
  if (d?.saveFile) return d.saveFile(name, content);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function importText(): Promise<string | null> {
  const d = desktop();
  if (d?.openFile) return d.openFile();
  return new Promise((resolve) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = () => { const f = input.files?.[0]; if (!f) return resolve(null); f.text().then(resolve, () => resolve(null)); };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
