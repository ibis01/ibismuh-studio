import { createPrisma } from "../src/lib/ibismuh/prisma-factory.mjs";

// A3 screenshot harness bootstrap (local-only, never shipped):
// one org, one user, a handful of videos across the pipeline so the
// dashboard / library / analytics surfaces have honest content to render.
const prisma = createPrisma();

const org = (await prisma.organization.findFirst({ where: { slug: "studio-harness" } })) ??
  await prisma.organization.create({
    data: { name: "Studio Harness", slug: "studio-harness" },
  });
let user = await prisma.user.findFirst({ where: { email: "ibis01abc@gmail.com" } });
if (!user) {
  user = await prisma.user.create({
    data: {
      email: "ibis01abc@gmail.com",
      passwordHash: "pbkdf2$120000$AAAA$AAAA", // unused locally; gate handled by setup route
      memberships: { create: { organizationId: org.id, role: "OWNER" } },
    },
  });
}

const mk = (topic, niche, status, days, extra = {}) =>
  prisma.video.create({
    data: {
      organizationId: org.id,
      topic,
      niche,
      tone: "documentary",
      length: "60s",
      status,
      voice: "female_wanwan",
      ttsSpeed: 1,
      thumbStyle: "cinematic",
      voiceSource: "tts",
      format: "classic",
      renderMode: "2d",
      hasStoryboard: false,
      createdAt: new Date(Date.now() - days * 86400000),
      updatedAt: new Date(Date.now() - days * 86400000),
      ...extra,
    },
  });

await mk("Why the ocean has two layers that never mix", "science", "published", 6);
await mk("The bankruptcy that built Las Vegas", "history", "ready", 3);
await mk("5 sleep experiments that went too far", "health", "voiced", 2);
await mk("How container ships broke global trade", "economics", "scripted", 1);
await mk("The lost library that rewrote medicine", "history", "draft", 0);

console.log("harness ready:", { orgId: org.id, userId: user.id });
await prisma.$disconnect();
