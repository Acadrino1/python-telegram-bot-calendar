# Hypothesis Banks v2

Quick-reference hypotheses by component. Copy relevant rows into issue.

---

## 🤖 TELEGRAM BOT

### Docs Reference
- Telethon: https://docs.telethon.dev/en/stable/
- Telegraf.js: https://telegraf.js.org/
- Bot API: https://core.telegram.org/bots/api
- MTProto: https://core.telegram.org/mtproto

### Startup Failures
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Token invalid | `curl .../bot<TOKEN>/getMe` | Regen @BotFather | [getMe](https://core.telegram.org/bots/api#getme) |
| Multiple instances | `Get-Process -Name "node"` | Kill stale | — |
| Webhook conflict | Check TELEGRAM_WEBHOOK_URL | Clear or fix URL | [setWebhook](https://core.telegram.org/bots/api#setwebhook) |
| Rate limited (429) | Logs show 429 | Add backoff | [Limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits) |
| Polling timeout | Connection drops | Increase timeout | [getUpdates](https://core.telegram.org/bots/api#getupdates) |
| Session conflict | "already running" error | Delete .session file | [Telethon sessions](https://docs.telethon.dev/en/stable/concepts/sessions.html) |
| FloodWaitError | Telethon raises FloodWait | Sleep for e.seconds | [Telethon errors](https://docs.telethon.dev/en/stable/quick-references/faq.html) |

### Message/Callback Handling
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Handler not registered | Search `bot.action()` | Register before launch() | [Telegraf middleware](https://telegraf.js.org/#md:middleware) |
| Callback >64 bytes | Log callback length | Shorten data | [callback_data limit](https://core.telegram.org/bots/api#inlinekeyboardbutton) |
| Edit timeout (48hr) | Check msg timestamp | Re-send instead | [editMessageText](https://core.telegram.org/bots/api#editmessagetext) |
| Parse mode error | Try `parse_mode: undefined` | Fix escaping | [Formatting](https://core.telegram.org/bots/api#formatting-options) |
| Chat ID type wrong | `typeof chatId` | Consistent type | — |
| Message not modified | Edit same content | Track content hash | [Error 400](https://core.telegram.org/bots/api#making-requests) |
| Button callback silent | No handler response | Send answerCallbackQuery | [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery) |

### Telethon-Specific (Python)
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Event loop conflict | "loop already running" | Use nest_asyncio | [asyncio issues](https://docs.telethon.dev/en/stable/basic/signing-in.html) |
| Disconnected error | Random disconnects | Add reconnect handler | [Connection](https://docs.telethon.dev/en/stable/modules/client.html) |
| AuthKeyUnregistered | Session invalidated | Delete session, re-auth | [Sessions](https://docs.telethon.dev/en/stable/concepts/sessions.html) |
| Entity not found | get_entity fails | Use get_input_entity | [Entities](https://docs.telethon.dev/en/stable/concepts/entities.html) |
| StringSession invalid | Import fails | Check encoding | [StringSession](https://docs.telethon.dev/en/stable/modules/sessions.html) |

### Telegraf-Specific (JS)
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Scene not entering | ctx.scene.enter() fails | Check stage middleware | [Scenes](https://telegraf.js.org/#md:scenes) |
| Session lost | Data disappears | Check session middleware order | [Session](https://telegraf.js.org/#md:session) |
| Wizard cursor wrong | Wrong step | Reset with ctx.wizard.selectStep() | [Wizard](https://telegraf.js.org/#md:wizards) |
| Command not triggering | /cmd ignored | Check bot.command() registration | [Commands](https://telegraf.js.org/#md:commands) |

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

### Docs Reference
- MoneroPay: https://github.com/moneropay/moneropay
- Monero RPC: https://www.getmonero.org/resources/developer-guides/wallet-rpc.html
- Monero SE: https://monero.stackexchange.com/

### Webhook Not Receiving
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| API not running | `curl localhost:3000/health` | Start server | — |
| Port not bound | `netstat -ano \| findstr :3000` | Check PORT env | — |
| URL misconfigured | Check MONEROPAY_WEBHOOK_URL | Fix URL | [MoneroPay config](https://github.com/moneropay/moneropay#configuration) |
| Localhost unreachable | N/A external | Use ngrok/deploy | — |
| Route missing | Check Express routes | Add route | — |
| Webhook format wrong | Log req.body | Match expected schema | [Webhook payload](https://github.com/moneropay/moneropay#webhooks) |
| HTTPS required | Check MoneroPay logs | Add SSL or use tunnel | — |

### Payment Processing
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Address gen failing | Test `/receive` endpoint | Check MoneroPay status | [/receive](https://github.com/moneropay/moneropay#receive) |
| Amount conversion wrong | Log calc | Verify exchange API | — |
| Timeout too short | Check PAYMENT_WINDOW_MINUTES | Increase | — |
| DB record missing | Query payments table | Check insert | — |
| Confirmations stuck | Check wallet sync | Wait or rescan | [Wallet RPC](https://www.getmonero.org/resources/developer-guides/wallet-rpc.html) |
| Atomic units wrong | Log piconero calc | 1 XMR = 1e12 piconero | [Units](https://www.getmonero.org/resources/moneropedia/atomic-units.html) |

### MoneroPay Container Issues
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Container not running | `docker ps` | `docker-compose up -d` | — |
| Wallet not synced | Check logs | Wait for sync | — |
| RPC connection failed | Test wallet RPC port | Check monero-wallet-rpc | [Wallet RPC setup](https://www.getmonero.org/resources/developer-guides/wallet-rpc.html) |
| View key invalid | Check wallet config | Regenerate keys | — |

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

### Docs Reference
- Express.js: https://expressjs.com/en/4x/api.html
- Node.js: https://nodejs.org/docs/latest/api/
- Knex.js: https://knexjs.org/guide/
- Objection.js: https://vincit.github.io/objection.js/

### Wont Start
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Port in use | `netstat -ano \| findstr :<PORT>` | Kill/change port | — |
| Env var missing | Diagnostic script | Add to .env | — |
| Module not found | Check require paths | Fix path | [require](https://nodejs.org/docs/latest/api/modules.html) |
| Async race | Add startup logging | Await init | [async/await](https://nodejs.org/docs/latest/api/async_hooks.html) |
| DB connection failed | Test connection | Fix creds | [Knex config](https://knexjs.org/guide/#configuration-options) |
| Silent error | Add try/catch + handlers | Surface error | [process events](https://nodejs.org/docs/latest/api/process.html#event-unhandledrejection) |

### Routes Not Working
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Route not registered | Log router stack | Add before error handler | [Routing](https://expressjs.com/en/guide/routing.html) |
| Middleware blocking | Add logging | Fix order | [Middleware](https://expressjs.com/en/guide/using-middleware.html) |
| CORS blocking | Browser console | Configure CORS | [cors pkg](https://www.npmjs.com/package/cors) |
| Auth rejecting | Check headers | Skip for webhooks | — |
| Body parser missing | Log req.body | Add express.json() | [express.json](https://expressjs.com/en/api.html#express.json) |
| 404 on valid route | Check route order | Move before catch-all | [Route order](https://expressjs.com/en/guide/routing.html) |

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

## 🐍 PYTHON/ASYNCIO (Lodge Auction Bot)

### Docs Reference
- asyncio: https://docs.python.org/3/library/asyncio.html
- SQLAlchemy async: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- aiohttp: https://docs.aiohttp.org/

### Event Loop Issues
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Loop already running | "cannot run nested" | Use nest_asyncio | [nest_asyncio](https://pypi.org/project/nest-asyncio/) |
| Loop not running | "no running event loop" | Use asyncio.run() | [asyncio.run](https://docs.python.org/3/library/asyncio-runner.html) |
| Task cancelled | CancelledError | Check task cleanup | [Task cancellation](https://docs.python.org/3/library/asyncio-task.html#task-cancellation) |
| Blocking call in async | Slow/hangs | Use run_in_executor | [run_in_executor](https://docs.python.org/3/library/asyncio-eventloop.html#asyncio.loop.run_in_executor) |
| gather() exception | One task fails all | Use return_exceptions=True | [gather](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather) |

### SQLAlchemy Async Issues
| Hyp | Test | Fix | Docs |
|-----|------|-----|------|
| Session not async | "greenlet" error | Use async_sessionmaker | [async session](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#using-asyncsession) |
| Connection timeout | Pool exhausted | Increase pool_size | [Pool config](https://docs.sqlalchemy.org/en/20/core/pooling.html) |
| DetachedInstanceError | Lazy load outside session | Use selectinload | [Eager loading](https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html#eager-loading) |
| Transaction isolation | Dirty reads | Set isolation_level | [Isolation](https://docs.sqlalchemy.org/en/20/core/connections.html#setting-transaction-isolation-levels) |

### Verification Checklist
```
[ ] Event loop running (asyncio.get_running_loop())
[ ] No blocking calls in async path
[ ] DB sessions properly closed
[ ] Tasks awaited or gathered
[ ] No unhandled exceptions in tasks
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

### Escalate Path
```
Round 1 fail → Round 2 (new hyps)
Round 2 fail → Round 3 (deeper stack)
Round 3 fail → PHASE 4.5 (external research)
Fix attempt fail → PHASE 4.5 (external research)
```

### When to Hit Docs
- Fix implemented but still broken
- Error message not in hypothesis banks
- Version-specific behavior suspected
- >1hr on single bug

### Research Priority
1. Official docs (Telegram, Telethon, Express, etc.)
2. GitHub issues (exact error search)
3. Stack Overflow (pattern match)
4. Community forums (edge cases)
