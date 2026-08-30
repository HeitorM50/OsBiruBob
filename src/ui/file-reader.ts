/** Read a browser File as text. No upload, persistence or network is involved. */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader returned a non-text result"));
      }
    };
    reader.onerror = () => reject(new Error("FileReader could not read the file"));
    reader.onabort = () => reject(new Error("FileReader was aborted"));
    reader.readAsText(file);
  });
}
