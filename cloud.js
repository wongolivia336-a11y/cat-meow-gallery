(function () {
  "use strict";

  const SUPABASE_URL = "https://gyukalzptskonblxgzca.supabase.co";
  const SUPABASE_KEY = "sb_publishable_j5ssxRZdq4XIqJ1pfFqHAg_gCUGo0gP";
  const WEB_AUTH_RETURN_URL = "https://domi-meow-gallery.vercel.app/";
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let adapter = null;
  let session = null;
  let syncing = false;
  const t = (key, variables) => window.I18n?.t(key, variables) || key;

  async function init(nextAdapter) {
    adapter = nextAdapter;
    if (!client) return;
    const result = await client.auth.getSession();
    session = result.data.session;
    adapter.onAuth?.(session?.user || null);
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      adapter.onAuth?.(session?.user || null);
      if (session) window.setTimeout(syncNow, 0);
    });
    if (session) await syncNow();
  }

  async function sendOtp(email) {
    if (!client) throw new Error(t("syncUnavailable"));
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: WEB_AUTH_RETURN_URL }
    });
    if (error) throw error;
  }

  async function verifyOtp(email, token) {
    const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
    session = data.session;
    await syncNow();
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    session = null;
    adapter?.onAuth?.(null);
  }

  async function syncNow() {
    if (!client || !session || !adapter || syncing) return;
    syncing = true;
    adapter.onStatus?.(t("syncing"));
    try {
      const userId = session.user.id;
      const localItems = adapter.getItems().filter((item) => item.source !== "seed" && item.source !== "mock");

      for (const item of localItems) {
        let audioPath = item.cloudAudioPath || null;
        if (item.audioKey && !audioPath) {
          const blob = await adapter.getBlob(item.audioKey).catch(() => null);
          if (blob?.size) {
            const extension = mimeExtension(blob.type);
            audioPath = `${userId}/${item.id}.${extension}`;
            const { error: uploadError } = await client.storage.from("cat-audio").upload(audioPath, blob, {
              contentType: (blob.type || "audio/webm").split(";")[0],
              upsert: true
            });
            if (uploadError) throw uploadError;
            item.cloudAudioPath = audioPath;
          }
        }

        const { error } = await client.from("recordings").upsert({
          id: String(item.id), user_id: userId, title: item.title, mood: item.mood,
          tags: item.tags || [], note: item.note || "", duration_seconds: item.duration || 0,
          waveform: item.waveform || null, trim_start: item.trimStart || 0, trim_end: item.trimEnd || 0,
          favorite: Boolean(item.favorite), audio_path: audioPath, mime_type: item.mimeType || null,
          client_updated_at: item.updatedAt || item.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      }

      const { data: remote, error: pullError } = await client.from("recordings")
        .select("*").is("deleted_at", null).order("client_updated_at", { ascending: false });
      if (pullError) throw pullError;

      const localById = new Map(adapter.getItems().map((item) => [String(item.id), item]));
      for (const row of remote || []) {
        let item = localById.get(String(row.id));
        if (!item) {
          item = fromRemote(row);
          adapter.addItem(item);
          localById.set(String(row.id), item);
        } else {
          item.cloudAudioPath = row.audio_path || item.cloudAudioPath || "";
        }

        if (row.audio_path && !item.audioKey) {
          const { data: blob, error: downloadError } = await client.storage.from("cat-audio").download(row.audio_path);
          if (!downloadError && blob) {
            item.audioKey = adapter.makeAudioKey(item.id);
            await adapter.putBlob(item.audioKey, blob);
          }
        }
      }
      adapter.commit();
      adapter.onStatus?.(t("synced", { count: remote?.length || 0 }));
    } catch (error) {
      adapter.onStatus?.(t("syncFailed", { message: error.message || t("retry") }));
    } finally {
      syncing = false;
    }
  }

  function fromRemote(row) {
    return {
      id: row.id, title: row.title, catName: "多米", mood: row.mood,
      tags: row.tags || [], note: row.note || "", duration: Number(row.duration_seconds) || 1,
      audioUrl: "", audioKey: "", cloudAudioPath: row.audio_path || "", source: "cloud",
      favorite: Boolean(row.favorite), playCount: 0,
      createdAt: row.created_at, updatedAt: row.client_updated_at,
      waveform: Array.isArray(row.waveform) ? row.waveform : [],
      trimStart: Number(row.trim_start) || 0, trimEnd: Number(row.trim_end) || 0
    };
  }

  function mimeExtension(type) {
    if (type.includes("mp4")) return "m4a";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("wav")) return "wav";
    if (type.includes("mpeg")) return "mp3";
    return "webm";
  }

  window.CloudSync = { init, sendOtp, verifyOtp, signOut, syncNow, get user() { return session?.user || null; } };
})();
