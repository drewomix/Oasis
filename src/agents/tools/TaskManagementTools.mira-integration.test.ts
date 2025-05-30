import { MiraAgent } from '../MiraAgent';
import dotenv from 'dotenv';
dotenv.config();

async function testMiraFetchCactusTasks() {
  const cloudUrl = process.env.CACTUS_API_BASE_URL;
  const userId = process.env.CACTUS_API_EMAIL;
  if (!cloudUrl || !userId) {
    throw new Error('CACTUS_API_BASE_URL and CACTUS_API_EMAIL must be set');
  }
  const mira = new MiraAgent(cloudUrl, userId);
  const userContext = { query: 'show me all cactus tasks' };
  console.log('--- MiraAgent: show me all cactus tasks');
  const result = await mira.handleContext(userContext);
  console.log('MiraAgent result:', result);
}

async function testMiraCreateCactusTask() {
  const cloudUrl = process.env.CACTUS_API_BASE_URL;
  const userId = process.env.CACTUS_API_EMAIL;
  if (!cloudUrl || !userId) {
    throw new Error('CACTUS_API_BASE_URL and CACTUS_API_EMAIL must be set');
  }
  const mira = new MiraAgent(cloudUrl, userId);
  const userContext = { query: 'create cactus task titled Test Task from Mira' };
  console.log('--- MiraAgent: create cactus task titled Test Task from Mira');
  const result = await mira.handleContext(userContext);
  console.log('MiraAgent result:', result);
}

async function main() {
  await testMiraFetchCactusTasks();
  await testMiraCreateCactusTask();
  await testMiraFetchCactusTasks();
}

main(); 