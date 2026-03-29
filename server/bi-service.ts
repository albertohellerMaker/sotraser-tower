import https from "https";

let cachedToken: { token: string; expiry: number } | null = null;

function httpPost(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, { method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 500, body: data }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiry - 60000) return cachedToken.token;

  const tenantId = process.env.POWERBI_TENANT_ID;
  if (!tenantId) throw new Error("POWERBI_TENANT_ID not set");

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.POWERBI_CLIENT_ID || "7f67af8a-fedc-4b08-8b4e-11d14301e5a8",
    username: process.env.POWERBI_USERNAME || "",
    password: process.env.POWERBI_PASSWORD || "",
    scope: "https://analysis.windows.net/powerbi/api/.default",
  }).toString();

  const res = await httpPost(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, { "Content-Type": "application/x-www-form-urlencoded" }, body);

  if (res.status !== 200) {
    console.error("[BI] Auth failed:", res.body.substring(0, 200));
    throw new Error("Power BI auth failed");
  }

  const data = JSON.parse(res.body);
  cachedToken = { token: data.access_token, expiry: Date.now() + data.expires_in * 1000 };
  console.log("[BI] Token obtained, expires in", data.expires_in, "seconds");
  return cachedToken.token;
}

export async function consultarViajeEnBI(viajeId: string): Promise<{
  toneladas: number | null; km: number | null; combustible: number | null; costo: number | null; encontrado: boolean;
}> {
  try {
    const token = await getAccessToken();
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    const datasetId = process.env.POWERBI_DATASET_ID;
    if (!workspaceId || !datasetId) return { toneladas: null, km: null, combustible: null, costo: null, encontrado: false };

    const daxQuery = JSON.stringify({
      queries: [{ query: `EVALUATE SELECTCOLUMNS(FILTER(Viajes, Viajes[ViajeID] = "${viajeId}"), "toneladas", Viajes[ToneladasNetas], "km", Viajes[KilometrosRecorridos], "combustible", Viajes[CombustibleLitros], "costo", Viajes[CostoOperacional])` }],
      serializerSettings: { includeNulls: true },
    });

    const res = await httpPost(
      `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/executeQueries`,
      { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      daxQuery
    );

    if (res.status !== 200) {
      console.error("[BI] Query error:", res.body.substring(0, 200));
      return { toneladas: null, km: null, combustible: null, costo: null, encontrado: false };
    }

    const data = JSON.parse(res.body);
    const rows = data?.results?.[0]?.tables?.[0]?.rows;
    if (!rows || rows.length === 0) return { toneladas: null, km: null, combustible: null, costo: null, encontrado: false };

    const row = rows[0];
    return {
      toneladas: row["[toneladas]"] ?? null, km: row["[km]"] ?? null,
      combustible: row["[combustible]"] ?? null, costo: row["[costo]"] ?? null, encontrado: true,
    };
  } catch (err: any) {
    console.error("[BI] Error:", err.message);
    return { toneladas: null, km: null, combustible: null, costo: null, encontrado: false };
  }
}

export async function testBIConnection(): Promise<{ ok: boolean; error?: string; workspaces?: any[] }> {
  try {
    const token = await getAccessToken();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
