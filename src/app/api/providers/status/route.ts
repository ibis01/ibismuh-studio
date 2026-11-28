// GET /api/providers/status — the PROVIDER READINESS ENDPOINT (master plan
// Phase 9): the ONE honest answer to "is each capability live, and what
// degrades when it is not". Authenticated (the standard gate — the data is
// operational posture, never secrets: provider ids, model ids, booleans,
// and the lane contracts' own degradation sentences; NO keys, masked or
// otherwise, ever ride this surface).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/ibismuh/tenant";
import { getCapability } from "@/lib/ibismuh/providers/settings";
import { readZaiCredentials } from "@/lib/ibismuh/zai-config";
import {
  PROVIDER_CAPABILITIES,
  computeCapabilityReadiness,
} from "@/lib/ibismuh/providers/status";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  auth.enter();

  // The platform's global zai grant: ONE read, shared by every capability
  // that resolves to the zai provider (the shared-account story).
  let platformZai = false;
  try {
    const zai = await readZaiCredentials();
    platformZai = Boolean(zai.apiKey);
  } catch {
    platformZai = false; // an unreadable platform grant reads as absent
  }

  const capabilities: Record<string, unknown> = {};
  for (const capability of PROVIDER_CAPABILITIES) {
    try {
      const config = await getCapability(capability);
      const platformBacked = config.provider === "zai" && platformZai && !config.apiKey;
      capabilities[capability] = computeCapabilityReadiness(capability, {
        provider: config.provider,
        model: config.model ?? "",
        hasKey: Boolean(config.apiKey),
        platformBacked,
      });
    } catch (err) {
      // The readiness surface NEVER lies by omission: a capability whose
      // resolution throws reports explicitly not-ready with the reason.
      capabilities[capability] = {
        provider: null,
        model: "",
        providerKnown: false,
        keyOptional: false,
        hasKey: false,
        platformBacked: false,
        ready: false,
        lanes: [],
        degradation: [],
        error: err instanceof Error ? err.message.slice(0, 200) : "resolution failed",
      };
    }
  }

  return NextResponse.json({ schema: 1, capabilities });
}
