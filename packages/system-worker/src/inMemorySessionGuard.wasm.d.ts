declare module 'sql.js/dist/sql-wasm.wasm' {
  const wasm: WebAssembly.Module;
  export default wasm;
}

declare module 'sql.js/dist/sql-wasm-browser.js' {
  const initSqlJs: typeof import('sql.js').default;
  export default initSqlJs;
}
