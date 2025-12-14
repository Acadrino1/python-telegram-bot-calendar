# Hypothesis Debug Workflow v2

## Issue Title
`[BUG-HYP] <Component>: <Symptom>`

---

## PHASE 1: TRIAGE (5 min max)

### State Capture Checklist
- [ ] Error message verbatim
- [ ] Repro steps (numbered)
- [ ] Last known working state
- [ ] Recent changes (commits/config)

### Quick Diagnostics
```powershell
# Process state
Get-Process -Name "node" -EA SilentlyContinue

# Port check
netstat -ano | findstr :<PORT>

# Env verification
node -e "require('dotenv').config();console.log(process.env.<KEY>)"
```

### Output Required
```
SYMPTOM: <one line>
SCOPE: <file/module/service affected>
BLOCKING: <what cant proceed>
```

---

## PHASE 2: HYPOTHESIS GENERATION

### Round 1 Table
| # | Hypothesis | Confidence | Test |
|---|------------|------------|------|
| H1 | | H/M/L | |
| H2 | | H/M/L | |
| H3 | | H/M/L | |
| H4 | | H/M/L | |

### Generation Rules
1. Start w/ hypothesis banks (see HYPOTHESIS_BANKS.md)
2. One hypothesis per failure layer (app→config→env→infra)
3. Include at least one "obvious" check (typo, wrong file, stale process)
4. High confidence = direct evidence; Low = pattern match only

---

## PHASE 3: SYSTEMATIC TESTING

### Per-Hypothesis Checklist
```
[ ] H1: <name>
    Theory: 
    Test cmd: 
    Expected if true: 
    Actual: 
    Result: ⏳/✅/❌
    Time spent: 
```

### Testing Rules
- Max 10 min per hypothesis before moving on
- Log EVERYTHING even if seems irrelevant
- If test inconclusive → mark ❓ not ✅

### Round Complete When
- [ ] All 4 tested
- [ ] Results documented
- [ ] New info captured

---

## PHASE 4: ITERATE OR RESOLVE

### If All ❌ → New Round
```
RULED OUT:
- H1: <why>
- H2: <why>
- H3: <why>
- H4: <why>

NEW INFO GAINED:
- 

PATTERN: <what failures tell us about where bug ISN'T>
```

### Generate Round 2
- MUST reference ruled-out items
- Move DOWN the stack (app→lib→OS)
- Consider compound issues (A+B together)
- Max 3 rounds before escalate/pair

### If ✅ Found → Phase 5

---

## PHASE 5: ROOT CAUSE DOCUMENTATION

### Required Fields
```
ROOT CAUSE: <one sentence>
CATEGORY: [ ]Code [ ]Config [ ]Env [ ]Race [ ]Dependency [ ]Integration
WHY MISSED INITIALLY: 
CONTRIBUTING FACTORS:
1.
2.
```

---

## PHASE 6: FIX IMPLEMENTATION

### Pre-Fix Checklist
- [ ] Root cause confirmed (not just correlated)
- [ ] Fix scope identified (which files)
- [ ] Rollback plan exists

### Fix Tracking
```
FILE: path/to/file
CHANGE: <description>
DIFF: 
```

### Post-Fix Verification Checklist
- [ ] Primary symptom resolved
- [ ] No new errors introduced
- [ ] Related functionality still works
- [ ] Logs show expected behavior

---

## PHASE 7: VERIFICATION PROTOCOL

### Startup Verification (API/Bot)
```powershell
# 1. Clean slate
Stop-Process -Name "node" -Force -EA SilentlyContinue

# 2. Port clear
netstat -ano | findstr :3000
# Expected: empty

# 3. Start
npm run start:api

# 4. Health check
curl http://localhost:3000/health
# Expected: {"status":"healthy"...}

# 5. Functional test
curl -X POST http://localhost:3000/api/payments/webhook -H "Content-Type: application/json" -d "{\"address\":\"test\"}"
# Expected: {"error":"Missing address"} or similar (proves route works)
```

### Telegram Bot Verification
```powershell
# 1. Token valid
curl "https://api.telegram.org/bot<TOKEN>/getMe"
# Expected: {"ok":true,"result":{...}}

# 2. Start bot
npm run start:bot

# 3. Send /start in Telegram
# Expected: Welcome message received
```

### MoneroPay Verification
```powershell
# 1. Container running
docker ps | findstr moneropay

# 2. Service responding
curl http://localhost:5000/health

# 3. Webhook reachable (from host)
curl -X POST http://localhost:3000/api/payments/webhook -H "Content-Type: application/json" -d "{\"address\":\"test\"}"
```

---

## PHASE 8: KNOWLEDGE CAPTURE

### Required
```
RED HERRINGS: <things that looked like problem but werent>
TECHNIQUE THAT WORKED: <what finally revealed root cause>
TIME: <total debug time>
PREVENTION: <how to stop this class of bug>
```

### Optional
- [ ] Update HYPOTHESIS_BANKS.md w/ new pattern
- [ ] Add regression test
- [ ] Update CLAUDE.md if architectural insight

---

## QUICK REFERENCE

### Confidence Scoring
- **H** = Direct evidence points here
- **M** = Matches pattern, no direct evidence  
- **L** = Possible but unlikely

### When to Escalate
- 3 rounds w/o progress
- >1hr on single bug
- Involves unfamiliar codebase area

### Debug Commands
```powershell
# Windows process mgmt
Get-Process -Name "node"
Stop-Process -Name "node" -Force
netstat -ano | findstr :<PORT>
taskkill /PID <PID> /F

# Node/npm
npm run features:status
npm run config:check
node -e "console.log(require('./config/features').features.isApiServerEnabled())"

# Telegram
curl "https://api.telegram.org/bot<TOKEN>/getMe"
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"

# Docker
docker ps
docker logs <container>
docker-compose up -d <service>
```
