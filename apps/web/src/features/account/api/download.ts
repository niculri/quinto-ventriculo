/** Saves a file the page already has (a Blob) with the browser's «download», without opening it. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
