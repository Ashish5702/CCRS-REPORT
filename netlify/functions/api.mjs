import { getStore } from "@netlify/blobs";

const json = (d, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const store = getStore({ name: "complaints", consistency: "strong" });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  const PASS = process.env.UPLOAD_KEY || "";

  // Optional password for uploading / removing / changing rules
  if (req.method !== "GET" && PASS && req.headers.get("x-upload-key") !== PASS) {
    return json({ error: "Wrong upload password" }, 401);
  }

  try {
    // List all shared files + saved rules
    if (route === "list" && req.method === "GET") {
      const { blobs } = await store.list({ prefix: "files/" });
      const names = blobs.map((b) => decodeURIComponent(b.key.slice(6)));
      const rules = await store.get("rules");
      return json({ names, rules, locked: !!PASS });
    }

    // One Excel file: GET download, PUT upload, DELETE remove
    if (route === "file") {
      const name = url.searchParams.get("name");
      if (!name) return json({ error: "Missing file name" }, 400);
      const key = "files/" + encodeURIComponent(name);

      if (req.method === "GET") {
        const buf = await store.get(key, { type: "arrayBuffer" });
        if (!buf) return json({ error: "Not found" }, 404);
        return new Response(buf, {
          headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
        });
      }
      if (req.method === "PUT") {
        const buf = await req.arrayBuffer();
        if (!buf.byteLength) return json({ error: "Empty file" }, 400);
        await store.set(key, buf);
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        await store.delete(key);
        return json({ ok: true });
      }
    }

    // Pocket-area rules: PUT save, DELETE reset to default
    if (route === "rules") {
      if (req.method === "PUT") {
        await store.set("rules", await req.text());
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        await store.delete("rules");
        return json({ ok: true });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};

export const config = { path: "/api/*" };
