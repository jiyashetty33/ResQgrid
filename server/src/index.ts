import { createApp } from './app.js';
import { ENV } from './config/env.js';
import { getRepository } from './db/index.js';

async function bootstrap() {
  try {
    const repo = await getRepository();
    const app = createApp();

    const server = app.listen(ENV.PORT, () => {
      console.log(`====================================================`);
      console.log(`   ResQGrid Emergency Intelligence Server          `);
      console.log(`   Tagline: "Turning fragmented disaster signals   `);
      console.log(`             into coordinated, adaptive response." `);
      console.log(`====================================================`);
      console.log(`   Port:            http://localhost:${ENV.PORT}`);
      console.log(`   Client Origin:   ${ENV.CLIENT_ORIGIN}`);
      console.log(`   Data Store:      ${repo.name}`);
      console.log(`   AI Engine:       ${ENV.GEMINI_API_KEY ? 'Gemini (' + ENV.GEMINI_MODEL + ')' : 'Local Heuristic Fallback'}`);
      console.log(`   Automation:      ${ENV.N8N_ENABLED ? 'n8n Connected' : 'Local Automation Engine'}`);
      console.log(`   Demo Mode:       ${ENV.DEMO_MODE}`);
      console.log(`====================================================\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
      });
    });
  } catch (err) {
    console.error('Failed to start ResQGrid server:', err);
    process.exit(1);
  }
}

bootstrap();
