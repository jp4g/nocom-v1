# Operations Runbook

This document provides operational procedures for deploying, monitoring, and maintaining the Liquidator Service Suite.

## Table of Contents

1. [Deployment Procedures](#deployment-procedures)
2. [Monitoring Guidelines](#monitoring-guidelines)
3. [Common Issues & Resolutions](#common-issues--resolutions)
4. [Emergency Procedures](#emergency-procedures)
5. [Maintenance Tasks](#maintenance-tasks)

---

## Deployment Procedures

### Initial Deployment

#### Prerequisites
- Docker and Docker Compose installed
- `.env` file configured with production values
- API keys generated and securely stored
- Network firewall configured

#### Steps

**1. Generate API Keys**
```bash
cd /path/to/liquidator
bun scripts/generate-api-key.ts --length 64
# Copy the generated key to .env as LIQUIDATION_API_KEY
```

**2. Configure Environment**
```bash
# Copy environment template
cp .env.docker .env

# Edit .env with production values
nano .env
```

**Required environment variables:**
- `LIQUIDATION_API_KEY` - Secure 64-character key (from step 1)
- `LIQUIDATOR_PRIVATE_KEY` - Liquidator wallet private key
- `CMC_API_KEY` - CoinMarketCap API key (or use mock)
- `LOG_LEVEL` - Set to `info` for production

**3. Build and Deploy Services**
```bash
# Build all Docker images
docker-compose build

# Start services in detached mode
docker-compose up -d

# Verify all services are running
docker-compose ps
```

**4. Health Checks**
```bash
# Check Price Service
curl http://localhost:3000/health | jq

# Check Note Monitor (from inside Docker network or via exposed port)
curl http://localhost:3001/health | jq

# Check Liquidation Engine
curl http://localhost:3002/health | jq
```

**5. Add Initial Assets**
```bash
# Add BTC to price tracking
curl -X POST http://localhost:3000/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BTC", "name": "Bitcoin"}'

# Add ETH
curl -X POST http://localhost:3000/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol": "ETH", "name": "Ethereum"}'
```

**6. Register Escrow Accounts**
```bash
# Register escrow account with Note Monitor
curl -X POST http://localhost:3001/escrows \
  -H "Content-Type: application/json" \
  -d '{"address": "0x..."}'
```

### Updating Services

**Rolling Update (Zero Downtime):**
```bash
# Pull latest code
git pull origin main

# Rebuild specific service
docker-compose build price-service

# Recreate service with new image
docker-compose up -d --no-deps price-service

# Verify service is healthy
curl http://localhost:3000/health | jq
```

**Full Restart:**
```bash
# Pull latest code
git pull origin main

# Rebuild all services
docker-compose build

# Restart all services
docker-compose down && docker-compose up -d

# Monitor logs during startup
docker-compose logs -f
```

### Rollback Procedures

**Rollback to Previous Version:**
```bash
# Stop current services
docker-compose down

# Checkout previous version
git checkout <previous-commit-hash>

# Rebuild and restart
docker-compose build
docker-compose up -d

# Verify services are healthy
docker-compose ps
curl http://localhost:3000/health
```

---

## Monitoring Guidelines

### Key Metrics to Monitor

#### Service Health
- **Endpoint**: `GET /health` on all services
- **Frequency**: Every 30 seconds
- **Expected Response**: `{"status": "healthy", ...}`
- **Alert On**: Status not "healthy" for > 60 seconds

#### Price Service Metrics
```bash
# Monitor tracked assets count
curl http://localhost:3000/health | jq '.trackedAssets'

# Check recent price updates
docker-compose logs price-service | grep "Price updated on-chain"
```

**Key Indicators:**
- Price update frequency (should happen when 0.5% change or 30min timeout)
- Failed price fetches (check logs for CMC API errors)
- Tracked asset count (should not exceed 50)

#### Note Monitor Metrics
```bash
# Check total positions being monitored
curl http://localhost:3001/health | jq '.totalPositions'

# Monitor sync operations
docker-compose logs note-monitor | grep "Note sync"
```

**Key Indicators:**
- Note sync frequency (should happen every 60 seconds)
- Number of positions tracked
- PXE connection status

#### Liquidation Engine Metrics
```bash
# Monitor liquidation executions
docker-compose logs liquidation-engine | grep "Liquidation executed successfully"

# Check for failed liquidations
docker-compose logs liquidation-engine | grep "Liquidation failed"
```

**Key Indicators:**
- Number of liquidations per hour
- Failed liquidation rate
- Average liquidation amount
- PXE connection status

### Log Monitoring

**View Real-Time Logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f price-service

# Last 100 lines
docker-compose logs --tail=100 liquidation-engine
```

**Search Logs:**
```bash
# Find all liquidations
docker-compose logs | grep "Liquidation executed"

# Find errors
docker-compose logs | grep -i error

# Find authentication failures
docker-compose logs | grep "Unauthorized"
```

### Resource Monitoring

**Docker Container Stats:**
```bash
# Real-time resource usage
docker stats

# Specific container
docker stats liquidator-price-service
```

**Disk Usage:**
```bash
# Check Docker disk usage
docker system df

# Check log file sizes
du -sh /var/lib/docker/containers/*
```

### Alerting Recommendations

**Critical Alerts (Immediate Response):**
- Any service health check fails for > 2 minutes
- Liquidation Engine unable to connect to PXE
- Price Service unable to fetch prices for > 5 minutes
- Out of memory/disk space errors

**Warning Alerts (Review Within 1 Hour):**
- High error rate (> 5% of requests)
- Slow response times (> 1 second average)
- Approaching resource limits (> 80% memory/CPU)
- Failed liquidations (> 10% failure rate)

**Info Alerts (Daily Review):**
- New assets added to tracking
- Escrows registered/removed
- Successful liquidation count
- API key authentication failures

---

## Common Issues & Resolutions

### Issue 1: Service Won't Start

**Symptoms:**
- Docker container exits immediately
- Health check fails

**Diagnosis:**
```bash
# Check container logs
docker-compose logs price-service

# Check container status
docker-compose ps
```

**Common Causes & Solutions:**

1. **Missing Environment Variables**
   ```bash
   # Check .env file exists and has required variables
   cat .env | grep LIQUIDATION_API_KEY
   ```

2. **Port Already in Use**
   ```bash
   # Check what's using port 3000
   lsof -i :3000

   # Kill the process or change port in docker-compose.yml
   ```

3. **Dependency Installation Failed**
   ```bash
   # Rebuild with no cache
   docker-compose build --no-cache price-service
   ```

### Issue 2: Price Updates Not Happening

**Symptoms:**
- No "Price updated on-chain" logs
- Liquidation engine not receiving notifications

**Diagnosis:**
```bash
# Check if assets are being tracked
curl http://localhost:3000/assets

# Check if prices are being fetched
curl http://localhost:3000/prices

# Check logs for price comparison
docker-compose logs price-service | grep "Price change"
```

**Common Causes & Solutions:**

1. **No Assets Tracked**
   ```bash
   # Add assets
   curl -X POST http://localhost:3000/assets \
     -H "Content-Type: application/json" \
     -d '{"symbol": "BTC"}'
   ```

2. **Price Change Below Threshold**
   - This is normal - updates only happen when price changes > 0.5% or 30min timeout
   - Check logs: `docker-compose logs price-service | grep "not significant"`

3. **CoinMarketCap API Failure** (if using real API)
   ```bash
   # Check CMC API key is valid
   # Check logs for API errors
   docker-compose logs price-service | grep -i "cmc\|api"
   ```

### Issue 3: Liquidations Not Executing

**Symptoms:**
- Positions should be liquidatable but no liquidations happening
- "No liquidatable positions found" in logs

**Diagnosis:**
```bash
# Check if positions exist
curl http://localhost:3001/positions | jq

# Check if price notifications are being sent
docker-compose logs liquidation-engine | grep "Price update notification"

# Check health factor calculations
docker-compose logs liquidation-engine | grep "healthFactor"
```

**Common Causes & Solutions:**

1. **No Positions Being Tracked**
   ```bash
   # Register escrow accounts
   curl -X POST http://localhost:3001/escrows \
     -H "Content-Type: application/json" \
     -d '{"address": "0x..."}'
   ```

2. **All Positions Are Healthy**
   - Check logs for health factor values
   - Positions with healthFactor >= 1.0 are not liquidatable

3. **API Key Mismatch**
   ```bash
   # Verify API key is same in both services
   docker-compose logs liquidation-engine | grep "Unauthorized"
   ```

### Issue 4: High Memory Usage

**Symptoms:**
- Docker containers using excessive memory
- System becoming slow

**Diagnosis:**
```bash
# Check memory usage
docker stats

# Check for memory leaks in logs
docker-compose logs | grep -i "memory\|heap"
```

**Solutions:**

1. **Restart Services**
   ```bash
   docker-compose restart
   ```

2. **Set Memory Limits** (edit docker-compose.yml)
   ```yaml
   services:
     price-service:
       deploy:
         resources:
           limits:
             memory: 512M
   ```

3. **Clear Old Logs**
   ```bash
   docker-compose logs --tail=0 -f > /dev/null &
   truncate -s 0 /var/lib/docker/containers/*/*-json.log
   ```

### Issue 5: Authentication Failures

**Symptoms:**
- "Unauthorized" errors in liquidation-engine logs
- Price updates not triggering liquidations

**Diagnosis:**
```bash
# Check for authentication errors
docker-compose logs liquidation-engine | grep "Unauthorized"
```

**Solutions:**

1. **Verify API Keys Match**
   ```bash
   # Check price-service environment
   docker-compose exec price-service env | grep LIQUIDATION_API_KEY

   # Check liquidation-engine environment
   docker-compose exec liquidation-engine env | grep LIQUIDATION_API_KEY
   ```

2. **Regenerate API Key**
   ```bash
   # Generate new key
   bun scripts/generate-api-key.ts --length 64

   # Update .env file
   # Restart services
   docker-compose restart
   ```

---

## Emergency Procedures

### Service Outage

**Immediate Actions:**

1. **Check Service Status**
   ```bash
   docker-compose ps
   curl http://localhost:3000/health
   ```

2. **Restart Failed Services**
   ```bash
   docker-compose restart <service-name>
   ```

3. **Check Logs for Errors**
   ```bash
   docker-compose logs --tail=100 <service-name>
   ```

4. **Escalate if Restart Fails**
   - Review error logs
   - Check resource availability
   - Consider rollback to previous version

### Data Loss Prevention

**NOTE:** Current implementation uses in-memory storage. On restart, all data is lost except what's re-fetched/synced.

**Mitigation:**
- Escrow accounts: Re-register after restart
- Asset tracking: Re-add assets after restart
- Positions: Will re-sync from PXE on next cycle

**Future Enhancement:** Implement persistent storage for critical data.

### Security Incident

**If API Key Compromise Suspected:**

1. **Immediately Rotate Keys**
   ```bash
   # Generate new key
   bun scripts/generate-api-key.ts --length 64

   # Update .env
   # Restart services
   docker-compose restart
   ```

2. **Review Logs for Unauthorized Access**
   ```bash
   docker-compose logs | grep "Unauthorized\|authentication failed"
   ```

3. **Check for Suspicious Activity**
   - Unexpected asset additions
   - Unusual price update patterns
   - Failed authentication attempts

4. **Document Incident**
   - Time of detection
   - Actions taken
   - Impact assessment

### System Resource Exhaustion

**If Running Out of Disk Space:**

1. **Clean Docker Resources**
   ```bash
   # Remove unused images
   docker image prune -a

   # Remove unused volumes
   docker volume prune

   # Remove stopped containers
   docker container prune
   ```

2. **Rotate Logs**
   ```bash
   # Truncate large log files
   truncate -s 0 /var/lib/docker/containers/*/*-json.log
   ```

3. **Monitor Disk Usage**
   ```bash
   df -h
   du -sh /var/lib/docker/*
   ```

---

## Maintenance Tasks

### Daily Tasks

- [ ] Check service health status
- [ ] Review error logs
- [ ] Verify liquidation execution count
- [ ] Check resource usage (CPU, memory, disk)

### Weekly Tasks

- [ ] Review and analyze liquidation patterns
- [ ] Check for dependency updates
- [ ] Verify API key security
- [ ] Review authentication failure logs
- [ ] Test backup and restore procedures

### Monthly Tasks

- [ ] Rotate API keys
- [ ] Update dependencies (`pnpm update`)
- [ ] Run security audit (`pnpm audit`)
- [ ] Review and update documentation
- [ ] Performance optimization review
- [ ] Capacity planning review

### Quarterly Tasks

- [ ] Comprehensive security audit
- [ ] Disaster recovery test
- [ ] Review and update operational procedures
- [ ] Evaluate new feature requests
- [ ] Infrastructure optimization

---

## Support Contacts

**For production issues:**
- Internal team contact (customize for your organization)

**For security incidents:**
- Security team (customize for your organization)

---

## Additional Resources

- [README.md](README.md) - Setup and configuration
- [SECURITY.md](SECURITY.md) - Security guidelines
- [PLAN.md](PLAN.md) - Implementation details
- [Docker Documentation](https://docs.docker.com/)
- [Bun Documentation](https://bun.sh/docs)
