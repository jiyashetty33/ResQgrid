import { getRepository } from './index.js';

async function runSeed() {
  console.log('[Seed] Initializing ResQGrid database...');
  const repo = await getRepository();
  await repo.resetDemoState();
  console.log(`[Seed] Successfully seeded ${repo.name} repository with baseline emergency data.`);
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('[Seed] Error seeding repository:', err);
  process.exit(1);
});
