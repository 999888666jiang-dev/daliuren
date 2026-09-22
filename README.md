# 观象 · 大六壬

一个可复核的中文大六壬问事工具。以真实时间起课，提供四课三传、原页已核的古籍摘句，以及可独立配置的 DeepSeek 解读服务。

网站：[观象](https://999888666jiang-dev.github.io/daliuren/)

## 已实现

- 公历2000—2100年、北京时间输入、真太阳时及标准时对照；经度、均时差与跨日处理。
- 月将加时、十干寄宫、四课、完整九宗门、三传、十二天将、旬空、六亲及推导轨迹。
- 古课人工复核、本命/行年地支可选输入；没有提供的信息不会被猜填。
- 逐条原页校核的引文、影像对照、实际盘面条件匹配、百法完整题名索引（逐项标示校勘状态）。
- 手机界面、哈希深链接、本机保存、JSON导出与打印。问题不进入网址，不主动上传完整报告。
- Cloudflare Worker + D1 邀请码/原子额度控制；DeepSeek结构化解读，错误不会被替换为演示答案。

**排盘和资料查询可独立使用。在线 AI 解读需要另行完成 Cloudflare 部署及 DeepSeek 密钥配置。未配置时界面明确说明，不能视为 AI 功能已经在线。**

文献真实和软件忠实于冻结的取法，不等于证明预测结果可靠。典籍存在异说；采用何种规则、何处仍待校勘，均有记录。

## 本地运行

需要 Node.js 24（服务端测试使用其内置 SQLite）。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/daliuren/`。

```sh
npm test
npm run worker:typecheck
npm run build
```

## 文献与算法

- [算法及验证边界](docs/algorithm.md)
- [书目、底本、版权标记及校勘记录](docs/sources.md)
- [原始资料校验清单](library/source-manifest.json)
- [已发布原页校验清单](library/verified-pages.json)
- [部署说明](docs/deployment.md)
- [设计与交互](docs/design.md)
- [验收记录](docs/validation.md)

原始扫描留存于本地 `library/originals/`，不进入 Git；仓库包含可公开的已核摘句、必要原页、来源与校验值。`scripts/fetch-sources.py` 用于重新取得记录中的资料。已下载不等于已校勘，索引题名已核也不等于全条断法已实现。

## 发布与密钥

GitHub Actions 在测试、类型检查和构建通过后发布 GitHub Pages。网页API地址通过仓库变量 `VITE_API_BASE_URL` 配置。模型密钥只能存 Cloudflare Secrets，不能填入任何 `VITE_` 变量。

Worker 部署、D1迁移、创建和撤销邀请码见部署说明。首版默认每邀请码北京时间日10次、全站100次，失败调用仍计次，无自动循环重试。

## 素材与依赖

星盘及界面图形为可交互SVG；书房背景为本项目使用内置图像生成工具制作。城市数据为GeoNames城市中心参考坐标，遵循其[署名许可](https://www.geonames.org/export/)，不表示用户精确位置。依赖版本由 `package-lock.json` 固定。
