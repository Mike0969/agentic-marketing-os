import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeProvider } from "@/lib/integrations";
import { listIntegrationConfigs, saveIntegrationConfig } from "@/lib/integration-store";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const integrations = await listIntegrationConfigs();
  return NextResponse.json({ integrations });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json()) as {
    provider?: string;
    displayName?: string;
    metadata?: Record<string, string>;
    secret?: string;
  };
  const provider = body.provider ? normalizeProvider(body.provider) : null;

  if (!provider) {
    return NextResponse.json({ error: "Unsupported integration provider." }, { status: 400 });
  }

  const integration = await saveIntegrationConfig({
    provider,
    displayName: body.displayName,
    metadata: body.metadata ?? {},
    secret: body.secret
  });

  return NextResponse.json({ integration });
}
