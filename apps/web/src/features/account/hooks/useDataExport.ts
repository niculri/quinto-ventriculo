// «Descargar mis datos»: asks the repository for the file and saves it, saying while it is busy or if it failed.
import { useState } from 'react';
import { useAccountRepository } from '../api/context';
import { saveFile } from '../api/download';
import { accountStrings as s } from '../strings';

export function useDataExport() {
  const account = useAccountRepository();
  const [exporting, setExporting] = useState<'idle' | 'busy' | 'failed'>('idle');
  const download = async () => {
    setExporting('busy');
    try {
      const blob = await account.exportData();
      const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
      saveFile(blob, s.data.file(day));
      setExporting('idle');
    } catch {
      setExporting('failed');
    }
  };
  return { exporting, download };
}
