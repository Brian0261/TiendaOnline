import { useState, useCallback } from "react";
import { downloadApiFile } from "../../../../api/download";

export function useExportFile() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportFile = useCallback(async (path: string, fallbackFilename: string) => {
    try {
      setExportError(null);
      setExporting(true);
      await downloadApiFile(path, fallbackFilename);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar";
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, []);

  return { exporting, exportError, exportFile };
}
