import React from "react";
import styles from "./App.module.css";

export default function App(): React.JSX.Element {
  return (
    <main className={styles.wrapper}>
      <h1 className={styles.title}>Hindsight</h1>
      <div className={styles.dropzone} aria-disabled="true">
        <p className={styles.dropzoneText}>
          Arraste um export do Bob aqui para analisar
        </p>
        <button type="button" disabled className={styles.dropzoneButton}>
          Selecionar arquivo
        </button>
      </div>
    </main>
  );
}
