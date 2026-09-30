import { createServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { RestClient } from './rest-client.js';
import { createFinancialMcpServer } from './tools.js';

const port = Number(process.env.MCP_PORT ?? 3100);
const host = process.env.MCP_HOST ?? '127.0.0.1';
const allowedHosts = (process.env.MCP_ALLOWED_HOSTNAMES ?? 'localhost,127.0.0.1,[::1]')
  .split(',').map((item) => item.trim()).filter(Boolean);
const apiBaseUrl = process.env.MCP_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT must be a valid TCP port');
if (!allowedHosts.length) throw new Error('MCP_ALLOWED_HOSTNAMES must contain at least one hostname');

const rest = new RestClient(apiBaseUrl);
const handler = createMcpHandler(() => createFinancialMcpServer(rest), { responseMode: 'json' });
const nodeHandler = toNodeHandler(handler);
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedHosts);

const httpServer = createServer((request, response) => {
  if (request.url?.split('?')[0] !== '/mcp') {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }
  if (!validateHost(request, response) || !validateOrigin(request, response)) return;
  void nodeHandler(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('MCP request failed');
  });
});

httpServer.listen(port, host, () => {
  process.stdout.write(`MCP Streamable HTTP endpoint: http://${host}:${port}/mcp\n`);
});

async function shutdown() {
  httpServer.close();
  await handler.close();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
