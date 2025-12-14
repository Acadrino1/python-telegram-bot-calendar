# Hypothesis Banks v2

Quick-reference hypotheses by component. Copy relevant rows into issue.

---

## 🤖 TELEGRAM BOT

### Startup Failures
| Hyp | Test | Fix |
|-----|------|-----|
| Token invalid | `curl .../bot<TOKEN>/getMe` | Regen @BotFather |
| Multiple instances | `Get-Process -Name "node"` | Kill stale |
| Webhook conflict | Check TELEGRAM_WEBHOOK_URL | Clear or fix URL |
| Rate limited | Logs show 429 | Add backoff |
| Network blocked | `Test-NetConnection api.telegram.org -Port 443` | Firewall |

### Message Handling
| Hyp | Test | Fix |
|-----|------|-----|
| Handler not registered | Search `bot.action()` | Register before launch() |
| Callback >64 bytes | Log callback length | Shorten data |
| Edit timeout (48hr) | Check msg timestamp | Re-send instead |
| Parse mode error | Try `parse_mode: undefined` | Fix escaping |
| Chat ID type wrong | `typeof chatId` | Consistent type |

### Verification Checklist
```
[ ] Token valid (getMe returns ok:true)
[ ] Bot process running
[ ] /start returns welcome
[ ] Callbacks trigger handlers
[ ] No 429 errors in logs
```

---

## 💰 MONEROPAY

### Webhook Not Receiving
| Hyp | Test | Fix |
|-----|------|-----|
| API not running | `curl localhost:3000/health` | Start server |
| Port not bound | `netstat -ano \| findstr :3000` | Check PORT env |
| URL misconfigured | Check MONEROPAY_WEBHOOK_URL | Fix URL |
| Localhost unreachable | N/A external | Use ngrok/deploy |
| Route missing | Check Express routes | Add route |

### Payment Processing
| Hyp | Test | Fix |
|-----|------|-----|
| Address gen failing | Test `/receive` endpoint | Check MoneroPay status |
| Amount conversion wrong | Log calc | Verify exchange API |
| Timeout too short | Check PAYMENT_WINDOW_MINUTES | Increase |
| DB record missing | Query payments table | Check insert |

### Verification Checklist
```
[ ] MoneroPay container running (docker ps)
[ ] API server health OK
[ ] Webhook endpoint reachable
[ ] Test payment creates DB record
[ ] Webhook callback updates status
```

---

## 🔧 EXPRESS API

### Wont Start
| Hyp | Test | Fix |
|-----|------|-----|
| Port in use | `netstat -ano \| findstr :<PORT>` | Kill/change port |
| Env var missing | Diagnostic script | Add to .env |
| Module not found | Check require paths | Fix path |
| Async race | Add startup logging | Await init |
| DB connection failed | Test connection | Fix creds |
| Silent error | Add try/catch + handlers | Surface error |

### Routes Not Working
| Hyp | Test | Fix |
|-----|------|-----|
| Route not registered | Log router stack | Add before error handler |
| Middleware blocking | Add logging | Fix order |
| CORS blocking | Browser console | Configure CORS |
| Auth rejecting | Check headers | Skip for webhooks |
| Body parser missing | Log req.body | Add express.json() |

### Verification Checklist
```
[ ] Server shows "Started" message
[ ] Health endpoint returns 200
[ ] All routes registered (check /api)
[ ] No unhandled rejection warnings
[ ] DB queries working
```

---

## ⚙️ FEATURE TOGGLES

### Feature Not Enabling
| Hyp | Test | Fix |
|-----|------|-----|
| Preset not applied | `npm run features:list` | Check FEATURE_PRESET |
| Env not overriding | Log env value | Use FEATURE_X_Y format |
| Deps not met | Check feature deps | Enable deps first |
| Required env missing | Check required_env | Add var |
| Cache stale | Restart | Call reload() |

### Verification Checklist
```
[ ] Correct preset shown in logs
[ ] Target feature shows enabled
[ ] All deps enabled
[ ] Required env vars present
```

---

## 🪟 WINDOWS-SPECIFIC

### Process Issues
| Hyp | Test | Fix |
|-----|------|-----|
| Stale node | `Get-Process -Name "node"` | `Stop-Process -Force` |
| Zombie port | `netstat -ano \| findstr :<PORT>` | `taskkill /PID /F` |
| File locked | Try edit/delete | Close IDE |
| Path separator | Check `/` vs `\` | Use path.join() |

### Env Issues
| Hyp | Test | Fix |
|-----|------|-----|
| Var not loaded | `$env:VAR` | Restart terminal |
| dotenv not override | Check flag | `{ override: true }` |
| Path too long | Check length | Shorten dirs |

### Verification Checklist
```
[ ] No orphan node processes
[ ] Target port available
[ ] Env vars echo correctly
[ ] File permissions OK
```

---

## GENERATION RULES

### New Round Requirements
1. NEVER repeat ruled-out hypothesis
2. Move down stack: app → lib → config → OS
3. Consider compound issues
4. Include one "stupid obvious" check

### Confidence
- **H** = Direct evidence
- **M** = Pattern match
- **L** = Unlikely but possible

### Escalate When
- 3 rounds no progress
- >1hr single bug
- Unfamiliar code area
