# Security Considerations

This document outlines security measures implemented in the Liquidator Service Suite and additional considerations for production deployment, especially within a Trusted Execution Environment (TEE) like Intel TDX.

## Current Security Measures (Phases 1-7)

### 1. API Key Authentication

**Service-to-Service Authentication:**
- Price Service → Liquidation Engine communication requires API key authentication
- API key passed via `X-API-Key` header
- Liquidation Engine validates key before processing price update notifications

**Implementation:**
- Location: `services/liquidation-engine/src/api.ts:34-42`
- Environment variable: `LIQUIDATION_API_KEY`
- Key generation utility: `scripts/generate-api-key.ts`

**Generating Secure API Keys:**
```bash
# Generate a 32-character API key (default)
bun scripts/generate-api-key.ts

# Generate a 64-character API key (more secure)
bun scripts/generate-api-key.ts --length 64
```

### 2. Environment Variable Security

**Sensitive Variables:**
- `LIQUIDATION_API_KEY` - Shared secret for service authentication
- `LIQUIDATOR_PRIVATE_KEY` - Private key for signing liquidation transactions
- `CMC_API_KEY` - CoinMarketCap API key (if using real API)

**Best Practices:**
- Never commit `.env` files to version control
- Use `.env.example` and `.env.docker` as templates only
- Rotate API keys regularly
- Use different keys for development, staging, and production

### 3. Docker Network Isolation

**Network Configuration:**
- All services run on isolated `liquidator-network` bridge network
- Only Price Service port (3000) is exposed to external network
- Note Monitor (3001) and Liquidation Engine (3002) are internal only
- Service-to-service communication uses Docker internal DNS

**Security Benefits:**
- Prevents direct external access to internal services
- Reduces attack surface
- Forces all external traffic through authenticated Price Service API

### 4. Input Validation

**Current Validation:**
- Asset symbol format validation (Price Service)
- Ethereum address format validation (Note Monitor)
- Request body validation with proper error responses
- Max limits enforced (50 assets, pagination limits)

**Locations:**
- `services/price-service/src/api.ts` - Asset symbol validation
- `services/note-monitor/src/api.ts` - Address validation
- `services/liquidation-engine/src/api.ts` - API key validation

### 5. Health Check Endpoints

**Purpose:**
- Monitor service availability
- Detect failures early
- Enable automated restarts via Docker/Kubernetes

**Endpoints:**
- `GET /health` on all services (ports 3000, 3001, 3002)
- Returns service status and metadata
- No authentication required (read-only, non-sensitive data)

## Production Security Enhancements

### 1. TEE (Trusted Execution Environment) Deployment

**Intel TDX Considerations:**
- **Attestation**: Verify TEE integrity before deployment
- **Sealed Storage**: Use TEE-provided sealed storage for private keys
- **Memory Encryption**: Ensure runtime memory is encrypted
- **Remote Attestation**: Implement remote attestation for key provisioning

**Recommended Approach:**
- Store `LIQUIDATOR_PRIVATE_KEY` in TEE sealed storage
- Provision API keys via remote attestation
- Use TEE-provided random number generator for key generation
- Implement secure key rotation within TEE

### 2. Rate Limiting

**TODO (Future Enhancement):**
- Implement rate limiting on public Price Service endpoints
- Prevent abuse of `/assets` POST endpoint
- Limit price query requests per IP/user
- Use middleware like `@hono/rate-limit`

**Recommended Limits:**
- `/assets` POST: 10 requests per minute per IP
- `/prices` GET: 100 requests per minute per IP
- `/assets` GET: 100 requests per minute per IP

### 3. Request Validation & Sanitization

**Current State:**
- Basic input validation implemented
- TypeScript type checking for request bodies

**Production Enhancements:**
- Add schema validation library (e.g., Zod)
- Sanitize all user inputs
- Implement strict content-type checking
- Add request size limits

### 4. Secrets Management

**Current Approach:**
- Environment variables via `.env` files
- Docker secrets for containerized deployments

**Production Recommendations:**
- Use secrets management service (HashiCorp Vault, AWS Secrets Manager)
- Never store secrets in container images
- Implement automatic secret rotation
- Use separate secrets for each environment

### 5. HTTPS/TLS

**Current State:**
- Services run on HTTP (local development/testing)

**Production Requirements:**
- Enable HTTPS for Price Service public API
- Use TLS 1.3 minimum
- Implement certificate management (Let's Encrypt, cert-manager)
- Consider mTLS for service-to-service communication

### 6. Logging & Monitoring

**Current Implementation:**
- Structured logging with Pino
- Log levels configurable via `LOG_LEVEL` environment variable

**Security Considerations:**
- **DO NOT** log sensitive data (API keys, private keys, full request bodies)
- Log authentication failures for security monitoring
- Implement log aggregation (ELK, Datadog, etc.)
- Set up alerts for suspicious patterns

**What to Log:**
- ✅ API key authentication failures
- ✅ Invalid request attempts
- ✅ Service health status
- ✅ Liquidation executions (amounts, escrows, txHashes)
- ❌ API keys or private keys
- ❌ Full request/response bodies containing secrets

### 7. Vulnerability Management

**Best Practices:**
- Regularly update dependencies (`pnpm update`)
- Monitor security advisories (GitHub Dependabot, Snyk)
- Run security audits: `pnpm audit`
- Use minimal Docker base images (currently using `oven/bun:1.3.3-slim`)

### 8. Access Control

**Future Enhancements:**
- Implement role-based access control (RBAC) for Price Service API
- Separate read and write API keys
- Add admin endpoints with stronger authentication
- Implement IP whitelisting for sensitive endpoints

## Security Checklist for Production

- [ ] Generate strong, unique API keys (64+ characters)
- [ ] Store private keys in TEE sealed storage
- [ ] Enable HTTPS with valid TLS certificates
- [ ] Implement rate limiting on public endpoints
- [ ] Set up secrets management service
- [ ] Configure log aggregation and monitoring
- [ ] Enable firewall rules to restrict network access
- [ ] Implement automated security scanning in CI/CD
- [ ] Set up intrusion detection system (IDS)
- [ ] Create incident response plan
- [ ] Conduct security audit/penetration testing
- [ ] Implement automated secret rotation
- [ ] Enable Docker security scanning
- [ ] Configure resource limits (CPU, memory, disk)
- [ ] Set up backup and disaster recovery procedures

## Responsible Disclosure

If you discover a security vulnerability in this codebase:

1. Do NOT open a public GitHub issue
2. Contact the security team directly (internal use only)
3. Provide detailed description of the vulnerability
4. Allow reasonable time for patching before disclosure

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Intel TDX Documentation](https://www.intel.com/content/www/us/en/developer/tools/trust-domain-extensions/overview.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
