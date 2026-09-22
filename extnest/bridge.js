(() => {
  const C = globalThis.EXTNEST_BRIDGE_CONFIG;

  const VAULT_IDS = Array.isArray(C?.vaultExtensionIds)
    ? C.vaultExtensionIds.filter(Boolean)
    : (C?.vaultExtensionId ? [C.vaultExtensionId] : []);

  if (!VAULT_IDS.length) {
    console.warn("[ExtNest] nenhum Vault ID configurado.");
    return;
  }

  let notifyTimer = null;
  let suppressChanges = false;

  async function exportConfig() {
    const keys = Array.isArray(C.backupKeys) ? C.backupKeys : [];
    const raw = await chrome.storage.local.get(keys);
    const data = C.exportTransform ? await C.exportTransform(raw) : raw;

    return {
      ok: true,
      protocol: C.protocol || 1,
      schema: C.schema || 1,
      data
    };
  }

  async function importConfig(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Payload inválido.");
    }

    const fromSchema = Number(payload.schema || 1);
    let data = payload.data || {};

    if (C.importTransform) {
      data = await C.importTransform(data, fromSchema);
    }

    suppressChanges = true;
    try {
      await chrome.storage.local.set(data);
    } finally {
      setTimeout(() => suppressChanges = false, 500);
    }

    return { ok:true };
  }

  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (!VAULT_IDS.includes(sender.id)) return;

    (async () => {
      try {
        if (message?.type === "extnest.ping") {
          sendResponse({ ok:true, protocol:C.protocol || 1, schema:C.schema || 1 });
          return;
        }
        if (message?.type === "extnest.config.export") {
          sendResponse(await exportConfig());
          return;
        }
        if (message?.type === "extnest.config.import") {
          sendResponse(await importConfig(message.payload));
          return;
        }
        if (message?.type === "extnest.reload") {
          sendResponse({ ok:true });
          setTimeout(() => chrome.runtime.reload(), 60);
          return;
        }

        sendResponse({ ok:false, error:"Comando ExtNest desconhecido." });
      } catch (error) {
        sendResponse({ ok:false, error:error.message });
      }
    })();

    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || suppressChanges) return;

    const keys = new Set(C.backupKeys || []);
    if (!Object.keys(changes).some(key => keys.has(key))) return;

    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(async () => {
      for (const vaultId of VAULT_IDS) {
        try {
          await chrome.runtime.sendMessage(vaultId, {
            type: "extnest.config.changed",
            protocol: C.protocol || 1
          });
          return;
        } catch {}
      }
    }, 1500);
  });
})();
