/**
 * Histórico de desfazer/refazer, mantido só em memória durante a sessão.
 *
 * Guarda instantâneos do documento lógico. Como o documento é imutável e
 * compartilha estrutura entre versões, cada entrada custa pouco.
 *
 * Agrupamento: alterações do tipo "typing" com a mesma chave e sem pausa longa
 * formam uma única entrada. Todo o resto (colagem, exclusão extensa, quebra manual,
 * blocos, assinaturas, campos administrativos) abre entrada própria.
 *
 * @template S
 */
export class History {
  /**
   * @param {Object} [options]
   * @param {number} [options.groupDelay]  pausa (ms) que encerra um grupo de digitação
   * @param {number} [options.maxEntries]
   * @param {number} [options.maxBytes]    orçamento aproximado de memória
   * @param {(snapshot: S) => number} [options.sizeOf]
   */
  constructor({ groupDelay = 700, maxEntries = 1000, maxBytes = 48 * 1024 * 1024, sizeOf = () => 1024 } = {}) {
    this.groupDelay = groupDelay;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.sizeOf = sizeOf;
    this.clear();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
    this.open = null;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Registra o estado ANTERIOR a uma alteração.
   * @param {S} before
   * @param {{kind?: 'typing'|'discrete', key?: string, time?: number}} [meta]
   * @returns {boolean} true se abriu nova entrada; false se a alteração entrou no grupo aberto
   */
  record(before, { kind = 'discrete', key = '', time = Date.now() } = {}) {
    this.redoStack.length = 0;
    const open = this.open;
    if (kind === 'typing' && open && open.key === key && time - open.time <= this.groupDelay) {
      open.time = time;
      return false;
    }
    this.push(this.undoStack, before);
    this.open = kind === 'typing' ? { key, time } : null;
    this.trim();
    return true;
  }

  /** Encerra o grupo de digitação em andamento (mudança de foco, por exemplo). */
  closeGroup() {
    this.open = null;
  }

  /**
   * @param {S} current  estado atual, guardado para o refazer
   * @returns {S|null} estado a restaurar
   */
  undo(current) {
    if (!this.undoStack.length) return null;
    const entry = this.undoStack.pop();
    this.bytes -= entry.size;
    this.push(this.redoStack, current);
    this.open = null;
    return entry.snapshot;
  }

  /** @returns {S|null} */
  redo(current) {
    if (!this.redoStack.length) return null;
    const entry = this.redoStack.pop();
    this.bytes -= entry.size;
    this.push(this.undoStack, current);
    this.open = null;
    return entry.snapshot;
  }

  push(stack, snapshot) {
    const size = Math.max(1, this.sizeOf(snapshot));
    stack.push({ snapshot, size });
    this.bytes += size;
  }

  trim() {
    while (this.undoStack.length > 1 && (this.undoStack.length > this.maxEntries || this.bytes > this.maxBytes)) {
      this.bytes -= this.undoStack.shift().size;
    }
  }
}
