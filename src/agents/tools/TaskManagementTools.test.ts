import 'dotenv/config'; // Load .env file
import { FetchTasksTool, CreateTaskTool } from './TaskManagementTools';
import axios from 'axios';

// You must set these environment variables before running:
// CACTUS_API_BASE_URL, CACTUS_API_EMAIL, CACTUS_API_PASSWORD
// You can set either CACTUS_DOMAIN_ID (UUID) or CACTUS_DOMAIN_NAME (human-friendly name)

async function getDomainId(): Promise<string> {
  const domainId = process.env.CACTUS_DOMAIN_ID;
  if (domainId) return domainId;
  const domainName = process.env.CACTUS_DOMAIN_NAME || 'Default Domain';
  if (!domainName) {
    throw new Error('Please set either CACTUS_DOMAIN_ID or CACTUS_DOMAIN_NAME in your environment.');
  }
  // Authenticate
  const email = process.env.CACTUS_API_EMAIL;
  const password = process.env.CACTUS_API_PASSWORD;
  const baseUrl = process.env.CACTUS_API_BASE_URL;
  if (!email || !password || !baseUrl) {
    throw new Error('Missing CACTUS_API_EMAIL, CACTUS_API_PASSWORD, or CACTUS_API_BASE_URL');
  }
  const authResp = await axios.post(
    `${baseUrl}/api/collections/users/auth-with-password`,
    { identity: email, password },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const token = authResp.data.token;
  // Look up domain by name
  const resp = await axios.get(
    `${baseUrl}/api/collections/Domains/records?filter=(Name='${domainName}')`,
    { headers: { Authorization: token } }
  );
  if (!resp.data.items || resp.data.items.length === 0) {
    throw new Error(`No domain found with name: ${domainName}`);
  }
  const foundId = resp.data.items[0].DomainID;
  if (!foundId) {
    throw new Error(`Domain found but missing DomainID: ${JSON.stringify(resp.data.items[0])}`);
  }
  return foundId;
}

async function testFetchTasks(domainId: string) {
  const tool = new FetchTasksTool();
  const input = JSON.stringify({ domainId });
  console.log('--- Fetching tasks for domain:', domainId);
  const result = await tool._call(input);
  console.log('FetchTasksTool result:', result);
}

async function testCreateTask(domainId: string) {
  const tool = new CreateTaskTool();
  const input = JSON.stringify({
    domainId,
    title: 'Test Task from Script',
    body: 'This is a test task created by TaskManagementTools.test.ts',
    productId: 'test-product',
    pose: { px: 1, py: 2, pz: 3, rw: 1, rx: 0, ry: 0, rz: 0 },
    dueDate: new Date(Date.now() + 24*60*60*1000).toISOString(),
    dueEnabled: true
  });
  console.log('--- Creating task in domain:', domainId);
  const result = await tool._call(input);
  console.log('CreateTaskTool result:', result);
}

async function main() {
  try {
    const domainId = await getDomainId();
    console.log('Resolved domain ID:', domainId);
    await testFetchTasks(domainId);
    await testCreateTask(domainId);
    await testFetchTasks(domainId); // Fetch again to see the new task
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

main(); 