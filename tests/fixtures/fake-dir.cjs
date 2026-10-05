'use strict';
// Minimal in-memory FileSystemDirectoryHandle, enough for the backup engine.
class NotFound extends Error { constructor(n) { super(n + ' not found'); this.name = 'NotFoundError'; } }
function fakeDir(name = 'root') {
  const files = new Map(), dirs = new Map();
  const dir = {
    kind: 'directory', name, _files: files, _dirs: dirs, failWrites: false,
    async getFileHandle(n, opts = {}) {
      if (!files.has(n)) { if (!opts.create) throw new NotFound(n); files.set(n, { bytes: new Uint8Array(), mtime: Date.now() }); }
      const rec = files.get(n);
      return {
        kind: 'file', name: n,
        async getFile() { return { size: rec.bytes.length, lastModified: rec.mtime, text: async () => new TextDecoder().decode(rec.bytes), arrayBuffer: async () => rec.bytes.buffer.slice(rec.bytes.byteOffset, rec.bytes.byteOffset + rec.bytes.length) }; },
        async createWritable() {
          let next = null;
          return { async write(c) { if (dir.failWrites) throw new Error('disk full'); next = typeof c === 'string' ? new TextEncoder().encode(c) : new Uint8Array(c); },
            async close() { rec.bytes = next || new Uint8Array(); rec.mtime = Date.now(); }, async abort() {} };
        }
      };
    },
    async getDirectoryHandle(n, opts = {}) {
      if (!dirs.has(n)) { if (!opts.create) throw new NotFound(n); dirs.set(n, fakeDir(n)); }
      return dirs.get(n);
    },
    async removeEntry(n) { if (!files.delete(n) && !dirs.delete(n)) throw new NotFound(n); },
    async *entries() {
      for (const n of files.keys()) yield [n, await dir.getFileHandle(n)];
      for (const [n, d] of dirs) yield [n, d];
    }
  };
  return dir;
}
module.exports = { fakeDir };
