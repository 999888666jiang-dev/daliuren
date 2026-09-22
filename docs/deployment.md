# 发布与亲友解读服务

前端发布到 `https://999888666jiang-dev.github.io/daliuren/`。本地排盘与已核古籍原文不依赖 Worker 或模型；AI 区域只有在真实 API 调用成功且通过校验后才显示解读。没有 API 配置时不应放入演示答案。

## 当前可部署内容

- `wrangler.jsonc` 的生产来源已固定为 `https://999888666jiang-dev.github.io`（Origin 不含 `/daliuren/` 路径）。数据库 ID 是零值占位符，必须替换为自己创建的 D1 ID 后才可远程部署。
- Worker 使用 DeepSeek 官方 `https://api.deepseek.com/chat/completions`，模型默认 `deepseek-flash`，可在 `DEEPSEEK_MODEL` 配置中更改。API 密钥只能存入 Worker Secret；不能放入仓库、前端代码或任何 `VITE_*` 变量。
- 官方 Chat Completions 支持 JSON object 输出；本项目仍逐字段校验返回结构及引用，不能把 JSON 模式当作证据准确性保证。[DeepSeek API 文档](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON 输出文档](https://api-docs.deepseek.com/guides/json_mode/)。

## 本地验证

要求 Node.js 24（测试使用内置 SQLite）。

```powershell
npm install
npm run test
npm run worker:typecheck
npx wrangler d1 migrations apply daliuren-private --local
Copy-Item -LiteralPath worker/.dev.vars.example -Destination .dev.vars
npm run worker:dev
```

`.dev.vars` 已被 Git 忽略。未填写真实 `DEEPSEEK_API_KEY` 时，健康检查返回 `configured: false`，解读返回 HTTP 503；这是预期状态。填入密钥后才能调用真实模型，不需要改变排盘功能。将前端的 `VITE_API_BASE_URL` 设为 `http://127.0.0.1:8787`，重新启动 Vite。

本地浏览器仅接受 `http://localhost:5173`、`http://127.0.0.1:5173` 及对应 4173 预览端口，且 Worker 本身也必须运行在 localhost。远程 Worker 即使误设 `ALLOW_LOCAL_DEV=true` 也不会接受这些来源。CORS 只是浏览器隔离，身份验证仍依赖邀请码。

## 首次部署

按以下顺序完成；不要在数据库 ID、密钥和实际账户尚未核实前执行远程部署。

```powershell
npx wrangler login
npx wrangler d1 create daliuren-private
```

将创建结果中的 `database_id` 填入 `wrangler.jsonc`，确认是自己的 Cloudflare 账户。数据库 ID 不是秘密；账户访问令牌是秘密。

```powershell
npx wrangler d1 migrations apply daliuren-private --remote
npx wrangler secret put DEEPSEEK_API_KEY
npm run worker:typecheck
npx wrangler deploy --dry-run
npm run worker:deploy
```

记录实际返回的 `https://daliuren-interpret.<account-subdomain>.workers.dev`，将其设为前端构建变量 `VITE_API_BASE_URL`，重新构建并发布 GitHub Pages。该 URL 可以公开，但密钥与邀请码不可以。浏览器检查 `GET /api/health` 的 `configured: true`、`status: ready` 和版本一致后，再用一个专门的邀请码做一次真实问题验收；测试中的假上游不等于线上验收通过。

免费 Workers 当前每请求 CPU 上限为 10 ms；模型网络等待不计 CPU，但服务端历法计算计入。首轮验收应同时观察 Cloudflare 的 `exceededCpu` 指标，覆盖冷调用和真太阳时；本地速度不能替代线上额度验证。若超限，先优化计算，调整付费计划由账户所有者决定。本项目不会自动开通付费服务。[Cloudflare 运行限制](https://developers.cloudflare.com/workers/platform/limits/)

## 邀请码与额度

每位亲友独立一个随机邀请码（256 位随机数），终端只在创建成功后显示一次。D1 仅保存带版本前缀的 SHA-256 摘要；保存对应摘要以便撤销。邀请码不要放在网址、仓库、截图或公开日志里。

```powershell
# 本地库
npm run invite -- create --local

# 真实生产库：核实 Cloudflare 账户后使用
npm run invite -- create --remote

# 用创建时显示的 64 位摘要撤销，不传入明文邀请码
npm run invite -- revoke --remote --hash <64-character-hash>
```

固定额度为每邀请码每个北京时间自然日 10 次，全站每天 100 次，同一邀请码同时最多 1 次。单次最多 2600 输出 token，25 秒超时，40 秒失效租约。模型调用前，一条带条件的 SQL INSERT 原子核验并登记额度，避免并发时先查询后自增导致超限。D1 使用 SQLite 语义：[D1 SQL 文档](https://developers.cloudflare.com/d1/sql-api/sql-statements/)。

已发起调用在上游失败、超时或返回无效内容时仍占一次额度，因为它可能已产生费用；系统不会自动重试。每天最多 100 次不等于固定金额账单，应在 DeepSeek 控制台查看用量与余额。需要停用时将 Worker 变量 `AI_ENABLED` 改为 `false` 并重新部署，或撤销特定邀请码。D1 故障时不绕过配额调用模型。

## 接口契约与可信边界

`POST /api/interpret` 使用 `Authorization: Bearer <邀请码>`，JSON 请求只有：

```json
{
  "input": { "datetime": "2026-09-22T12:00", "timeBasis": "standard" },
  "question": "最近应当怎样核查新的工作机会？",
  "category": "career",
  "ruleVersion": "与页面 RULE_VERSION 相同",
  "corpusVersion": "与页面 CORPUS_VERSION 相同"
}
```

时间是 2000–2100 年的北京时间墙上时间，接受 `YYYY-MM-DDTHH:mm[:ss]`，不接受 Z 或时区后缀；真太阳时 `timeBasis: solar` 必须提供经度。问题 4–1200 字符，请求体不超过 8 KB。Worker 不接受客户端课盘、引文或自定义系统提示，服务端会独立重排课盘并选择已核引文。

成功响应为 `{chartId, interpretation, meta}`，其中 `interpretation` 是共享 `Interpretation` 类型，`meta` 包含 `engineVersion/ruleVersion/corpusVersion/promptVersion/model`。`GET /api/health` 返回 `{configured,status,versions}`；`configured` 表示密钥与数据库绑定存在且未关闭，`ready` 还要求数据库表可查询，不代表已经完成真实模型验收。

错误统一为 `{error:{code,message},meta}`。常见状态：400 输入无效，401 邀请码无效，403 来源不允许，409 版本不一致，429 当日额度耗尽或已有请求进行中，502 上游失败或生成内容验证失败，503 未配置或存储不可用，504 模型超时。前端错误时保留现有课盘和原文；不得把错误转换为成功解读。

AI 只收到问题、类别、服务器课盘事实及已核参考条文，不收到 API 密钥、邀请码或原始经纬度字段。用户问题放在独立 JSON 数据字段中，无法提交额外聊天角色或工具。返回结构不能添加原文、引文网址或 HTML 字段；每条观察至少指向一个真实课盘事实，引用 ID 只能属于本次已核条文。古籍原文由资料库直接渲染，AI 文本不得被当作古籍原话。结构和引用检查无法保证现代解释在语义上永不出错，界面应始终明确 AI 解读的性质。

## 隐私与公开仓库

Worker 不写入问题、生日、地点、课盘、模型答案或请求授权日志，关闭 Workers Observability；D1 只保留邀请码摘要、撤销状态及调用时间与完成时间。调用记录在后续请求时清理七天以前的数据（没有新请求时不会自动删除）。运营方仍应核对 Cloudflare 平台层日志和 DeepSeek 的实际数据政策，不能承诺第三方零留存。

调用 AI 前告知用户：问题和必要课盘事实会发送到 DeepSeek。默认不使用浏览器持久化保存邀请码或问题，不在 URL 放入这些信息。公开文献只发布已核来源与具有可发布依据的材料；现代整理、译注与扫描平台许可须单独核对，古籍原著年代久远不代表整站内容可以复制。
