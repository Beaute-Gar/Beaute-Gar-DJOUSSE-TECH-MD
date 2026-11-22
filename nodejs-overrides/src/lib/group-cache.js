'use strict';

const groupMetaCache = new Map();
const TTL = 300_000;

const getGroupMeta = async (sock, jid) => {
  const now = Date.now();
  const cached = groupMetaCache.get(jid);
  if (cached && now - cached.time < TTL) {
    return cached.data;
  }
  try {
    const meta = await sock.groupMetadata(jid);
    groupMetaCache.set(jid, { data: meta, time: now });
    return meta;
  } catch (e) {
    return null;
  }
};

const isAdminOf = (meta, ids) => {
  if (!meta || !meta.participants) return false;
  const adminJids = meta.participants
    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    .map(p => p.id);
  return ids.some(id => adminJids.includes(id));
};

const bindInvalidation = (sock) => {
  // No-op for now, group metadata invalidation handled by TTL
};

module.exports = { getGroupMeta, bindInvalidation, isAdminOf };